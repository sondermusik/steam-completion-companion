import { useEffect, useState } from 'react';
import {
  definePlugin,
  Field,
  DialogButton,
  callable,
  IconsModule,
  Millennium,
} from '@steambrew/client';

const NS = '[SHC_FRONTEND]';

type IPCValue = string | number | boolean | null;
type IPCParams = Record<string, IPCValue>;

type ShcResponseItem = {
  label?: string;
  value?: string;
  kind?: string;
};

type ShcResponse = {
  ok?: boolean;
  show_panel?: boolean;
  type?: string;
  has_app?: boolean;
  app_id?: number;
  page_kind?: string;
  title?: string;
  summary?: string;
  restricted_count?: number;
  steam_hunters_url?: string;
  items?: ShcResponseItem[];
  error?: string;
};

declare global {
  interface Window {
    MainWindowBrowserManager?: {
      m_lastLocation?: {
        pathname?: string;
        href?: string;
      };
    };
  }
}

const shcJsonBridge = callable<[params: IPCParams], string>('shc_json_bridge');

const PANEL_ID = 'shc-companion-library-panel';
const STYLE_ID = 'shc-companion-library-style';

const LIBRARY_PATH_PATTERN = /\/library\/app\/(\d+)/i;
const GENERIC_APP_PATH_PATTERN = /\/app\/(\d+)/i;

const LIBRARY_GAME_CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';

let currentDocument: Document | null = null;
let observer: MutationObserver | null = null;
let refreshTimer: number | null = null;
let lastAppId: number | null = null;
let processingAppId: number | null = null;

function log(...args: unknown[]) {
  console.log(NS, ...args);
}

function warn(...args: unknown[]) {
  console.warn(NS, ...args);
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function parseAppId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getSteamLibraryPathname(): string {
  return String(window.MainWindowBrowserManager?.m_lastLocation?.pathname || '');
}

function getSteamLibraryHref(): string {
  const internalHref = window.MainWindowBrowserManager?.m_lastLocation?.href;

  if (internalHref) {
    return String(internalHref);
  }

  return String(window.location.href || '');
}

function getLibraryAppId(): {
  appId: number | null;
  reason: string;
  href: string;
  pathname: string;
} {
  const pathname = getSteamLibraryPathname();
  const href = getSteamLibraryHref();

  const libraryMatch = pathname.match(LIBRARY_PATH_PATTERN);
  const libraryAppId = parseAppId(libraryMatch?.[1]);

  if (libraryAppId !== null) {
    return {
      appId: libraryAppId,
      reason: 'MainWindowBrowserManager_library_path',
      href,
      pathname,
    };
  }

  const genericMatch = pathname.match(GENERIC_APP_PATH_PATTERN);
  const genericAppId = parseAppId(genericMatch?.[1]);

  if (genericAppId !== null && !href.toLowerCase().includes('store.steampowered.com')) {
    return {
      appId: genericAppId,
      reason: 'MainWindowBrowserManager_app_path',
      href,
      pathname,
    };
  }

  const hrefMatch = href.match(LIBRARY_PATH_PATTERN);
  const hrefAppId = parseAppId(hrefMatch?.[1]);

  if (hrefAppId !== null) {
    return {
      appId: hrefAppId,
      reason: 'href_library_path',
      href,
      pathname,
    };
  }

  return {
    appId: null,
    reason: `no_library_app_path pathname=${pathname || 'empty'}`,
    href,
    pathname,
  };
}

function getGameName(appId: number): string {
  try {
    const steamWindow = window as unknown as {
      appStore?: {
        GetAppOverviewByAppID?: (appId: number) => {
          display_name?: string;
          appid?: number;
        };
      };
    };

    const overview = steamWindow.appStore?.GetAppOverviewByAppID?.(appId);

    return String(overview?.display_name || '');
  } catch {
    return '';
  }
}

function getLibraryContainer(doc: Document): HTMLElement | null {
  const direct = doc.querySelector<HTMLElement>(LIBRARY_GAME_CONTAINER_SELECTOR);

  if (direct) {
    return direct;
  }

  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      [
        '[class*="AppDetails"]',
        '[class*="appdetails"]',
        '[class*="LibraryAppDetails"]',
        '[class*="library_AppDetails"]',
        '[class*="GameDetails"]',
      ].join(',')
    )
  );

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();

    if (rect.width > 300 && rect.height > 200) {
      return candidate;
    }
  }

  return null;
}

function removePanel(doc: Document) {
  const existing = doc.getElementById(PANEL_ID);

  if (existing) {
    existing.remove();
  }
}

function ensureStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} {
      position: absolute;
      right: 16px;
      top: auto;
      bottom: 96px;
      z-index: 9999;
      width: 330px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 11px 14px 10px 14px;
      border-radius: 10px;
      color: var(--shc-text, #dfe3e6);
      background: var(--shc-panel-bg, rgba(13, 17, 22, 0.94));
      border: 1px solid var(--shc-border, rgba(117, 174, 209, 0.35));
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      pointer-events: auto;
      backdrop-filter: blur(10px);

      --shc-accent: #66c0f4;
      --shc-text: #dfe3e6;
      --shc-muted: #9fb0bf;
      --shc-panel-bg: rgba(13, 17, 22, 0.94);
      --shc-border: rgba(117, 174, 209, 0.35);
      --shc-row-border: rgba(255, 255, 255, 0.08);
      --shc-yellow: #ffcc66;
      --shc-orange: #f39c12;
      --shc-red: #ff6b6b;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .shc-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 12px;
      padding: 4px 0;
      min-height: 21px;
      border-top: 1px solid var(--shc-row-border);
    }

    #${PANEL_ID} .shc-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    #${PANEL_ID} .shc-label {
      color: var(--shc-muted);
      min-width: 0;
      overflow: hidden;
    }

    #${PANEL_ID} .shc-label-wrap {
      display: inline-grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 7px;
      min-width: 0;
      line-height: 18px;
    }

    #${PANEL_ID} .shc-label-wrap span:last-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${PANEL_ID} .shc-row-icon {
      width: 14px;
      height: 14px;
      min-width: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
    }

    #${PANEL_ID} .shc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
    }

    #${PANEL_ID} .shc-row-icon-normal {
      color: var(--shc-text);
    }

    #${PANEL_ID} .shc-row-icon-muted {
      color: var(--shc-muted);
    }

    #${PANEL_ID} .shc-row-icon-yellow {
      color: var(--shc-yellow);
    }

    #${PANEL_ID} .shc-row-icon-orange {
      color: var(--shc-orange);
    }

    #${PANEL_ID} .shc-row-icon-red {
      color: var(--shc-red);
    }

    #${PANEL_ID} .shc-row-icon-blue {
      color: var(--shc-accent);
    }

    #${PANEL_ID} .shc-value {
      color: #ffffff;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      line-height: 18px;
      min-height: 18px;
      display: block;
    }

    #${PANEL_ID} .shc-value-yellow {
      color: var(--shc-yellow);
    }

    #${PANEL_ID} .shc-value-orange {
      color: var(--shc-orange);
    }

    #${PANEL_ID} .shc-value-red {
      color: var(--shc-red);
    }

    #${PANEL_ID} .shc-value-blue {
      color: var(--shc-accent);
    }

    #${PANEL_ID} .shc-error {
      color: #ffb4b4;
    }

    #${PANEL_ID} .shc-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 6px;
      padding-top: 7px;
      border-top: 1px solid var(--shc-row-border);
    }

    #${PANEL_ID} .shc-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--shc-accent);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      opacity: 0.95;
    }

    #${PANEL_ID} .shc-link:hover {
      color: #ffffff;
      opacity: 1;
      text-decoration: none;
    }

    #${PANEL_ID} .shc-link-icon {
      width: 14px;
      height: 14px;
      display: block;
      border-radius: 3px;
      flex: 0 0 auto;
    }

    #${PANEL_ID} .shc-link-icon-fallback {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: var(--shc-accent);
      color: #0b141d;
      font-size: 7px;
      font-weight: 800;
      line-height: 1;
      flex: 0 0 auto;
    }

    #${PANEL_ID} .shc-link-icon-fallback-hidden {
      display: none;
    }

    @media (max-width: 900px) {
      #${PANEL_ID} {
        right: 12px;
        bottom: 92px;
        width: 310px;
      }
    }
  `;

  doc.head?.appendChild(style);
}

function colorLooksUseful(value: string): boolean {
  const color = value.trim().toLowerCase();

  if (!color || color === 'transparent') {
    return false;
  }

  if (color === 'rgba(0, 0, 0, 0)' || color === 'rgba(0,0,0,0)') {
    return false;
  }

  return color.startsWith('rgb') || color.startsWith('#');
}

function findLibraryThemeColor(doc: Document): string | null {
  const selectors = [
    '[class*="Collection"]',
    '[class*="collection"]',
    '[class*="Tag"]',
    '[class*="tag"]',
    '[class*="Pill"]',
    '[class*="pill"]',
    '[class*="AppTag"]',
    '[class*="app_tag"]',
  ];

  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selectors.join(',')));

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();

    if (rect.width < 20 || rect.height < 8) {
      continue;
    }

    const style = doc.defaultView?.getComputedStyle(candidate);

    if (!style) {
      continue;
    }

    const background = style.backgroundColor;
    const border = style.borderTopColor;
    const color = style.color;

    if (colorLooksUseful(background) && !background.includes('13, 17, 22')) {
      return background;
    }

    if (colorLooksUseful(border)) {
      return border;
    }

    if (colorLooksUseful(color)) {
      return color;
    }
  }

  return null;
}

function applyLibraryTheme(doc: Document, panel: HTMLElement) {
  const rootStyle = doc.defaultView?.getComputedStyle(doc.documentElement);
  const tagColor = findLibraryThemeColor(doc);

  const accent =
    tagColor ||
    rootStyle?.getPropertyValue('--SystemAccentColor').trim() ||
    rootStyle?.getPropertyValue('--gpColor-Blue').trim() ||
    '#66c0f4';

  panel.style.setProperty('--shc-accent', accent);
  panel.style.setProperty('--shc-text', '#dfe3e6');
  panel.style.setProperty('--shc-muted', '#9fb0bf');
  panel.style.setProperty('--shc-panel-bg', 'rgba(13, 17, 22, 0.94)');
  panel.style.setProperty('--shc-border', 'rgba(117, 174, 209, 0.35)');
  panel.style.setProperty('--shc-row-border', 'rgba(255, 255, 255, 0.08)');
}

function getOrCreatePanel(doc: Document, container: HTMLElement): HTMLElement {
  ensureStyle(doc);

  const existing = doc.getElementById(PANEL_ID);

  if (existing) {
    if (existing.parentElement !== container) {
      container.appendChild(existing);
    }

    applyLibraryTheme(doc, existing);
    return existing;
  }

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-shc-library-panel', '1');

  container.style.position = 'relative';
  container.appendChild(panel);

  applyLibraryTheme(doc, panel);
  return panel;
}

function renderLoading(doc: Document, _container: HTMLElement, _appId: number, _reason: string) {
  removePanel(doc);
}

function parseBackendResponse(raw: string): ShcResponse {
  try {
    return JSON.parse(raw) as ShcResponse;
  } catch {
    return {
      ok: false,
      type: 'parse_error',
      title: 'Steam Completion Companion',
      summary: 'Backend returned non JSON response.',
      restricted_count: 0,
      items: [],
      error: raw,
    };
  }
}

function iconSvg(kind: string): string {
  if (kind === 'dlc') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18.5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2ZM6.2 6l.7 3h9.7c.8 0 1.5.7 1.5 1.5 0 .2 0 .4-.1.6l-1.3 3.8c-.2.6-.8 1.1-1.4 1.1H8.1c-.7 0-1.3-.5-1.5-1.2L4.4 4.5H2V3h3.6l.7 3Z"/>
      </svg>
    `;
  }

  if (kind === 'broken') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M11 10h2v7h-2z" stroke="none"/>
        <circle cx="12" cy="7" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'conditional') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 22 20H2L12 3Z" fill="none" stroke-width="2" stroke-linejoin="round"/>
        <path d="M11 9h2v5h-2z" stroke="none"/>
        <circle cx="12" cy="17" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'unobtainable') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M11 6h2v8h-2z" stroke="none"/>
        <circle cx="12" cy="17.5" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'restricted') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke-width="2" stroke-linecap="round"/>
        <path d="M20.2 6.8a9 9 0 0 0-3-2.4" fill="none" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 1.8v3.6M12 18.6v3.6M1.8 12h3.6M18.6 12h3.6M4.8 4.8l2.5 2.5M16.7 16.7l2.5 2.5M19.2 4.8l-2.5 2.5M7.3 16.7l-2.5 2.5" fill="none" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (kind === 'star') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.8-4.6 6.6-1L12 2.5Z"/>
      </svg>
    `;
  }

  if (kind === 'clock') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M12 7v5l3.2 2" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  if (kind === 'chart') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19h16" fill="none" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 17V9h3v8H6Zm5 0V5h3v12h-3Zm5 0v-6h3v6h-3Z" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'percent') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18 18 6" fill="none" stroke-width="2" stroke-linecap="round"/>
        <circle cx="7.5" cy="7.5" r="2.2" fill="none" stroke-width="2"/>
        <circle cx="16.5" cy="16.5" r="2.2" fill="none" stroke-width="2"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
      <path d="M11 10h2v7h-2z" stroke="none"/>
      <circle cx="12" cy="7" r="1.2" stroke="none"/>
    </svg>
  `;
}

function normalizeKind(item: ShcResponseItem): string {
  const kind = String(item.kind || '').toLowerCase();
  const label = String(item.label || '').toLowerCase();

  if (kind === 'paid_dlc' || label.includes('paid dlc')) {
    return 'paid_dlc';
  }

  if (kind === 'broken' || label.includes('broken but obtainable')) {
    return 'broken';
  }

  if (kind === 'conditional' || label.includes('conditionally obtainable')) {
    return 'conditional';
  }

  if (kind === 'unobtainable' || label.includes('unobtainable')) {
    return 'unobtainable';
  }

  if (kind === 'restricted' || label.includes('restricted')) {
    return 'restricted';
  }

  if (kind === 'players_perfected' || label.includes('players perfected')) {
    return 'players_perfected';
  }

  if (kind === 'median_completion' || label.includes('median completion')) {
    return 'median_completion';
  }

  if (kind === 'perfected_by_starters' || label.includes('perfected by starters')) {
    return 'perfected_by_starters';
  }

  return 'info';
}

function getRowVisual(item: ShcResponseItem): {
  iconKind: string;
  iconClass: string;
  valueClass: string;
} {
  const kind = normalizeKind(item);

  if (kind === 'paid_dlc') {
    return {
      iconKind: 'dlc',
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'broken') {
    return {
      iconKind: 'broken',
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'conditional') {
    return {
      iconKind: 'conditional',
      iconClass: 'shc-row-icon-orange',
      valueClass: 'shc-value-orange',
    };
  }

  if (kind === 'unobtainable') {
    return {
      iconKind: 'unobtainable',
      iconClass: 'shc-row-icon-red',
      valueClass: 'shc-value-red',
    };
  }

  if (kind === 'restricted') {
    return {
      iconKind: 'restricted',
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'players_perfected') {
    return {
      iconKind: 'star',
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  if (kind === 'median_completion') {
    return {
      iconKind: 'clock',
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  if (kind === 'perfected_by_starters') {
    return {
      iconKind: 'percent',
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  return {
    iconKind: 'info',
    iconClass: 'shc-row-icon-muted',
    valueClass: '',
  };
}

function renderResponse(
  doc: Document,
  container: HTMLElement,
  _appId: number,
  _reason: string,
  response: ShcResponse
) {
  if (response.show_panel === false) {
    removePanel(doc);
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const visual = getRowVisual(item);

      rows.push(`
        <div class="shc-row">
          <div class="shc-label">
            <span class="shc-label-wrap">
              <span class="shc-row-icon ${visual.iconClass}">
                ${iconSvg(visual.iconKind)}
              </span>
              <span>${safeText(item.label)}</span>
            </span>
          </div>
          <div class="shc-value ${visual.valueClass}">${safeText(item.value)}</div>
        </div>
      `);
    }
  }

  if (rows.length === 0) {
    removePanel(doc);
    return;
  }

  const panel = getOrCreatePanel(doc, container);

  const steamHuntersUrl = response.steam_hunters_url
    ? safeText(response.steam_hunters_url)
    : '';

  const footer = steamHuntersUrl
    ? `
      <div class="shc-footer">
        <a class="shc-link" href="${steamHuntersUrl}" target="_blank" rel="noopener noreferrer">
          <img
            class="shc-link-icon"
            src="https://steamhunters.com/content/img/steam_hunters.svg?v=201706240149"
            onerror="this.style.display='none'; this.nextElementSibling.classList.remove('shc-link-icon-fallback-hidden');"
          />
          <span class="shc-link-icon-fallback shc-link-icon-fallback-hidden">SH</span>
          <span>View on SteamHunters →</span>
        </a>
      </div>
    `
    : '';

  panel.innerHTML = `
    ${rows.join('')}
    ${footer}
  `;
}

function renderError(
  doc: Document,
  container: HTMLElement,
  appId: number,
  reason: string,
  message: string
) {
  const panel = getOrCreatePanel(doc, container);

  panel.innerHTML = `
    <div class="shc-row">
      <div class="shc-label">Error</div>
      <div class="shc-value shc-error">${safeText(message)}</div>
    </div>
    <div class="shc-row">
      <div class="shc-label">App ID</div>
      <div class="shc-value">${safeText(appId)}</div>
    </div>
    <div class="shc-row">
      <div class="shc-label">Reason</div>
      <div class="shc-value">${safeText(reason)}</div>
    </div>
  `;
}

async function updateLibraryPanel(doc: Document, reasonFromCaller: string) {
  const detection = getLibraryAppId();

  if (detection.appId === null) {
    lastAppId = null;
    removePanel(doc);
    return;
  }

  const container = getLibraryContainer(doc);

  if (!container) {
    log('library app detected but container missing', {
      appId: detection.appId,
      reason: detection.reason,
      pathname: detection.pathname,
      caller: reasonFromCaller,
    });
    return;
  }

  const existing = doc.getElementById(PANEL_ID);
  const needsReattach = existing !== null && existing.parentElement !== container;

  if (
    detection.appId === lastAppId &&
    detection.appId !== processingAppId &&
    reasonFromCaller !== 'manual' &&
    !needsReattach &&
    existing
  ) {
    return;
  }

  lastAppId = detection.appId;
  processingAppId = detection.appId;

  const appId = detection.appId;
  const gameName = getGameName(appId);

  log('detected library app page', {
    appId,
    gameName,
    reason: detection.reason,
    href: detection.href,
    pathname: detection.pathname,
    containerClass: container.className,
  });

  renderLoading(doc, container, appId, detection.reason);

  const payload = {
    type: 'get_page_info',
    source: 'frontend_library_window_hook',
    page_kind: 'library',
    app_id: appId,
    href: detection.href,
    title: String(doc.title || document.title || ''),
    game_name: gameName,
    reason: detection.reason,
    time: new Date().toISOString(),
  };

  try {
    const raw = await shcJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    const response = parseBackendResponse(String(raw));

    renderResponse(doc, container, appId, detection.reason, response);
  } catch (err) {
    warn('backend call failed', err);
    renderError(doc, container, appId, detection.reason, stringifyError(err));
  } finally {
    if (processingAppId === appId) {
      processingAppId = null;
    }
  }
}

function scheduleLibraryUpdate(doc: Document, reason: string) {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    updateLibraryPanel(doc, reason);
  }, 250);
}

function disconnectObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  refreshTimer = null;
  lastAppId = null;
  processingAppId = null;
}

function setupLibraryObserver(doc: Document) {
  disconnectObserver();

  currentDocument = doc;

  log('setup library observer', {
    docTitle: doc.title,
    href: String(window.location.href || ''),
    pathname: getSteamLibraryPathname(),
  });

  observer = new MutationObserver(() => {
    scheduleLibraryUpdate(doc, 'dom_mutation');
  });

  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  });

  doc.addEventListener(
    'click',
    () => {
      scheduleLibraryUpdate(doc, 'doc_click');
    },
    true
  );

  window.addEventListener('focus', () => {
    scheduleLibraryUpdate(doc, 'window_focus');
  });

  scheduleLibraryUpdate(doc, 'initial');

  window.setInterval(() => {
    if (currentDocument === doc) {
      scheduleLibraryUpdate(doc, 'interval');
    }
  }, 1000);
}

async function callBackendFromSettings(): Promise<string> {
  const payload = {
    type: 'settings_probe',
    source: 'plugin_settings',
    page_kind: 'settings',
    app_id: 0,
    href: String(window.location.href || ''),
    time: new Date().toISOString(),
  };

  try {
    const result = await shcJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    return String(result);
  } catch (err) {
    return `FAILED:${stringifyError(err)}`;
  }
}

function ProbeContent() {
  const [status, setStatus] = useState<string>('not tested yet');

  async function runProbe() {
    setStatus('calling backend...');

    const result = await callBackendFromSettings();

    setStatus(result);
  }

  useEffect(() => {
    console.log(NS, 'settings React content mounted');
    runProbe();
  }, []);

  return (
    <Field
      label="SteamHunters Companion Probe"
      description={status}
      bottomSeparator="standard"
    >
      <DialogButton onClick={runProbe}>
        Run Backend Probe
      </DialogButton>
    </Field>
  );
}

export default definePlugin(() => {
  console.log(NS, 'plugin factory loaded');

  const steamMillennium = Millennium as unknown as {
    AddWindowCreateHook?: (callback: (context: any) => void) => void;
  };

  steamMillennium.AddWindowCreateHook?.((context: any) => {
    const windowName = String(context?.m_strName || '');

    if (!windowName.startsWith('SP ')) {
      return;
    }

    const doc = context?.m_popup?.document as Document | undefined;

    if (!doc?.body) {
      return;
    }

    log('Steam window hook fired', {
      windowName,
      docTitle: doc.title,
    });

    if (currentDocument && currentDocument !== doc) {
      removePanel(currentDocument);
      disconnectObserver();
    }

    setupLibraryObserver(doc);
  });

  return {
    title: 'Steam Completion Companion',
    icon: <IconsModule.Settings />,
    content: <ProbeContent />,
  };
});