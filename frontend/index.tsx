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

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type LibraryPillTheme = {
  background: string;
  rowBorder: string;
  text: string;
  muted: string;
  accent: string;
  shadow: string;
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
let libraryIntervalId: number | null = null;

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
      padding: 11px 14px 7px 14px;
      border-radius: 9px;
      color: var(--shc-text, #dfe3e6);
      background: var(--shc-panel-bg, rgba(36, 43, 47, 0.82));
      border: 0;
      box-shadow: var(--shc-shadow, 0 12px 28px rgba(0, 0, 0, 0.38));
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);

      --shc-accent: #66c0f4;
      --shc-link-accent: #66c0f4;
      --shc-text: #ffffff;
      --shc-muted: rgba(255, 255, 255, 0.78);
      --shc-panel-bg: rgba(36, 43, 47, 0.82);
      --shc-row-border: rgba(255, 255, 255, 0.105);
      --shc-shadow: 0 12px 28px rgba(0, 0, 0, 0.38);
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
      line-height: 20px;
      border-top: 1px solid var(--shc-row-border);
    }

    #${PANEL_ID} .shc-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    #${PANEL_ID} .shc-label {
      color: var(--shc-muted);
      min-width: 0;
      height: 20px;
      line-height: 20px;
      overflow: hidden;
      display: flex;
      align-items: center;
      font-weight: 500;
    }

    #${PANEL_ID} .shc-label-wrap {
      display: grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 7px;
      min-width: 0;
      height: 20px;
      line-height: 20px;
    }

    #${PANEL_ID} .shc-label-wrap span:last-child {
      min-width: 0;
      height: 20px;
      line-height: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    #${PANEL_ID} .shc-row-icon {
      width: 14px;
      height: 20px;
      min-width: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
      line-height: 20px;
    }

    #${PANEL_ID} .shc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
    }

    #${PANEL_ID} .shc-native-icon {
      width: 14px;
      min-width: 14px;
      height: 20px;
      text-align: center;
      font-size: 12px;
      line-height: 20px;
      color: currentColor;
    }

    #${PANEL_ID} .shc-row-icon-normal {
      color: var(--shc-muted);
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
      color: var(--shc-text);
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      height: 20px;
      line-height: 20px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      transform: translateY(1px);
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
      margin-top: 4px;
      padding-top: 5px;
      min-height: 19px;
      border-top: 1px solid var(--shc-row-border);
    }

    #${PANEL_ID} .shc-link,
    #${PANEL_ID} .shc-link:visited {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--shc-link-accent);
      font-size: 12px;
      font-weight: 600;
      line-height: 14px;
      height: 14px;
      text-decoration: none;
      opacity: 1;
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
      background: var(--shc-link-accent);
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
        width: 310px;
      }
    }
  `;

  doc.head?.appendChild(style);
}

function parseRgb(value: string): Rgba | null {
  const match = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);

  if (!match) {
    return null;
  }

  return {
    r: Math.max(0, Math.min(255, Number(match[1]))),
    g: Math.max(0, Math.min(255, Number(match[2]))),
    b: Math.max(0, Math.min(255, Number(match[3]))),
    a: match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4]))),
  };
}

function rgbaString(color: Rgba, alpha?: number): string {
  const a = alpha === undefined ? color.a : alpha;

  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.max(
    0,
    Math.min(1, a)
  )})`;
}

function mixRgb(a: Rgba, b: Rgba, amount: number, alpha = 1): string {
  const t = Math.max(0, Math.min(1, amount));

  return rgbaString(
    {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: alpha,
    },
    alpha
  );
}

function colorLooksUseful(value: string): boolean {
  const color = value.trim().toLowerCase();

  if (!color || color === 'transparent') {
    return false;
  }

  if (color === 'rgba(0, 0, 0, 0)' || color === 'rgba(0,0,0,0)') {
    return false;
  }

  const rgb = parseRgb(color);

  if (rgb && rgb.a <= 0.03) {
    return false;
  }

  return color.startsWith('rgb') || color.startsWith('#');
}

function isTooGenericDark(value: string): boolean {
  const rgb = parseRgb(value);

  if (!rgb) {
    return false;
  }

  return rgb.r < 18 && rgb.g < 22 && rgb.b < 28;
}

function getUsefulStyleColor(style: CSSStyleDeclaration | null, properties: string[]): string | null {
  if (!style) {
    return null;
  }

  for (const property of properties) {
    const value = style.getPropertyValue(property).trim();

    if (colorLooksUseful(value)) {
      return value;
    }
  }

  return null;
}

function getNativePanelBackgroundFromColor(source: Rgba): string {
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const neutral: Rgba = { r: 52, g: 60, b: 64, a: 1 };

  const luminance = (0.2126 * source.r + 0.7152 * source.g + 0.0722 * source.b) / 255;

  if (luminance > 0.48) {
    return mixRgb(source, black, 0.58, 0.82);
  }

  return mixRgb(source, neutral, 0.38, 0.82);
}

function findTopRightCollectionPillTheme(doc: Document): LibraryPillTheme | null {
  const view = doc.defaultView;

  if (!view) {
    return null;
  }

  const viewportWidth = view.innerWidth || doc.documentElement.clientWidth || 0;
  const viewportHeight = view.innerHeight || doc.documentElement.clientHeight || 0;

  function isCollectionPillText(text: string): boolean {
    const clean = text.trim();

    if (!clean || clean.length < 2 || clean.length > 40) {
      return false;
    }

    const lower = clean.toLowerCase();

    if (
      lower.includes('median completion') ||
      lower.includes('players perfected') ||
      lower.includes('perfected by starters') ||
      lower.includes('view on steamhunters') ||
      lower.includes('errungenschaften') ||
      lower.includes('achievements') ||
      lower.includes('spielen') ||
      lower.includes('play')
    ) {
      return false;
    }

    return true;
  }

  function getReadableBackgroundFromElement(element: HTMLElement): {
    background: string;
    text: string | null;
    shadow: string | null;
  } | null {
    let current: HTMLElement | null = element;

    for (let depth = 0; current && depth < 6; depth += 1) {
      const style = view.getComputedStyle(current);
      const background = style.backgroundColor;
      const rgb = parseRgb(background);

      if (rgb && rgb.a > 0.08 && !isTooGenericDark(background)) {
        const text = getUsefulStyleColor(style, ['color']);
        const shadow = style.boxShadow && style.boxShadow !== 'none' ? style.boxShadow : null;

        return {
          background,
          text,
          shadow,
        };
      }

      current = current.parentElement;
    }

    return null;
  }

  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      [
        '[class*="Collection"]',
        '[class*="collection"]',
        '[class*="Tag"]',
        '[class*="tag"]',
        '[class*="Pill"]',
        '[class*="pill"]',
        '[class*="Capsule"]',
        '[class*="capsule"]',
        '[class*="AppTag"]',
        '[class*="app_tag"]',
        'button',
        'div',
        'span',
      ].join(',')
    )
  );

  let best: {
    score: number;
    background: string;
    text: string | null;
    shadow: string | null;
  } | null = null;

  for (const candidate of candidates) {
    if (candidate.id === PANEL_ID || candidate.closest(`#${PANEL_ID}`)) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();

    if (rect.width < 38 || rect.width > 210 || rect.height < 18 || rect.height > 46) {
      continue;
    }

    if (rect.top < 0 || rect.top > Math.max(110, viewportHeight * 0.18)) {
      continue;
    }

    if (rect.left < viewportWidth * 0.28) {
      continue;
    }

    const text = String(candidate.textContent || '').trim();

    if (!isCollectionPillText(text)) {
      continue;
    }

    const colors = getReadableBackgroundFromElement(candidate);

    if (!colors) {
      continue;
    }

    const bgRgb = parseRgb(colors.background);

    if (!bgRgb || bgRgb.a <= 0.08) {
      continue;
    }

    const style = view.getComputedStyle(candidate);

    let score = 0;

    score += 120 - Math.min(120, rect.top);
    score += Math.max(0, rect.left - viewportWidth * 0.28) / 8;

    if (/^[A-Z0-9 ÄÖÜ&:_-]+$/.test(text)) {
      score += 30;
    }

    if (text.length >= 3 && text.length <= 18) {
      score += 14;
    }

    if (style.borderRadius && style.borderRadius !== '0px') {
      score += 10;
    }

    if (colors.shadow) {
      score += 10;
    }

    if (!best || score > best.score) {
      best = {
        score,
        background: colors.background,
        text: colors.text,
        shadow: colors.shadow,
      };
    }
  }

  if (!best) {
    return null;
  }

  const bgRgb = parseRgb(best.background);

  if (!bgRgb) {
    return null;
  }

  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };

  const panelBackground = getNativePanelBackgroundFromColor(bgRgb);
  const rowBorder = mixRgb(bgRgb, white, 0.48, 0.16);
  const text = '#ffffff';
  const muted = 'rgba(255, 255, 255, 0.78)';
  const accent = mixRgb(bgRgb, white, 0.48, 1);

  return {
    background: panelBackground,
    rowBorder,
    text,
    muted,
    accent,
    shadow: best.shadow || '0 12px 28px rgba(0, 0, 0, 0.38)',
  };
}

function findLibraryActionBar(container: HTMLElement): HTMLElement | null {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        '[class*="PlayBar"]',
        '[class*="playbar"]',
        '[class*="AppActionButton"]',
        '[class*="appaction"]',
        '[class*="GamepadUIAppDetails_PlayBar"]',
        '[class*="Achievements"]',
        '[class*="achievements"]',
      ].join(',')
    )
  );

  for (const candidate of candidates) {
    const text = String(candidate.textContent || '').toLowerCase();
    const rect = candidate.getBoundingClientRect();

    if (rect.width < 250 || rect.height < 40) {
      continue;
    }

    if (
      text.includes('spielen') ||
      text.includes('play') ||
      text.includes('install') ||
      text.includes('achievements') ||
      text.includes('errungenschaften')
    ) {
      return candidate;
    }
  }

  const containerRect = container.getBoundingClientRect();
  const broadCandidates = Array.from(container.children) as HTMLElement[];

  for (const candidate of broadCandidates) {
    const rect = candidate.getBoundingClientRect();

    const nearBottom =
      rect.bottom > containerRect.bottom - 125 &&
      rect.top < containerRect.bottom - 20;

    if (
      nearBottom &&
      rect.width > containerRect.width * 0.5 &&
      rect.height >= 45 &&
      rect.height < 120
    ) {
      return candidate;
    }
  }

  return null;
}

function findActionBarThemeColors(
  doc: Document,
  container: HTMLElement
): {
  background: string | null;
  rowBorder: string | null;
  shadow: string | null;
  text: string | null;
} {
  const actionBar = findLibraryActionBar(container);

  if (!actionBar) {
    return {
      background: null,
      rowBorder: null,
      shadow: null,
      text: null,
    };
  }

  const view = doc.defaultView;
  const actionStyle = view?.getComputedStyle(actionBar) || null;

  let background = getUsefulStyleColor(actionStyle, [
    'background-color',
    '--gradient-body-background-color',
    '--color-background',
  ]);

  let text = getUsefulStyleColor(actionStyle, ['color']);

  if (!background || isTooGenericDark(background)) {
    const children = Array.from(actionBar.querySelectorAll<HTMLElement>('*')).slice(0, 60);

    for (const child of children) {
      const rect = child.getBoundingClientRect();

      if (rect.width < 80 || rect.height < 20) {
        continue;
      }

      const childStyle = view?.getComputedStyle(child) || null;
      const childBackground = getUsefulStyleColor(childStyle, ['background-color']);
      const childText = getUsefulStyleColor(childStyle, ['color']);

      if (!background && childBackground && !isTooGenericDark(childBackground)) {
        background = childBackground;
      }

      if (!text && childText) {
        text = childText;
      }

      if (background && text) {
        break;
      }
    }
  }

  const bgRgb = background ? parseRgb(background) : null;

  const panelBackground = bgRgb
    ? rgbaString(bgRgb, Math.max(0.68, Math.min(0.84, bgRgb.a || 0.78)))
    : null;

  const rowBorder = bgRgb ? rgbaString({ ...bgRgb, a: 1 }, 0.16) : null;

  const shadow =
    actionStyle?.boxShadow && actionStyle.boxShadow !== 'none'
      ? actionStyle.boxShadow
      : '0 12px 28px rgba(0, 0, 0, 0.38)';

  return {
    background: panelBackground,
    rowBorder,
    shadow,
    text: text || null,
  };
}

function applyLibraryTheme(doc: Document, container: HTMLElement, panel: HTMLElement) {
  const rootStyle = doc.defaultView?.getComputedStyle(doc.documentElement);
  const pillTheme = findTopRightCollectionPillTheme(doc);
  const actionTheme = findActionBarThemeColors(doc, container);

  const fallbackAccent =
    rootStyle?.getPropertyValue('--SystemAccentColor').trim() ||
    rootStyle?.getPropertyValue('--gpColor-Blue').trim() ||
    '#66c0f4';

  const nativeFallbackBackground = 'rgba(36, 43, 47, 0.82)';
  const nativeFallbackRowBorder = 'rgba(255, 255, 255, 0.105)';
  const labelText = 'rgba(255, 255, 255, 0.78)';
  const fixedSteamHuntersLinkColor = '#66c0f4';

  panel.style.setProperty('--shc-link-accent', fixedSteamHuntersLinkColor);

  if (pillTheme) {
    panel.style.setProperty('--shc-accent', pillTheme.accent);
    panel.style.setProperty('--shc-text', pillTheme.text);
    panel.style.setProperty('--shc-muted', pillTheme.muted || labelText);
    panel.style.setProperty('--shc-panel-bg', actionTheme.background || pillTheme.background);
    panel.style.setProperty('--shc-row-border', actionTheme.rowBorder || pillTheme.rowBorder);
    panel.style.setProperty('--shc-shadow', pillTheme.shadow);
    return;
  }

  panel.style.setProperty('--shc-accent', fallbackAccent);
  panel.style.setProperty('--shc-text', '#ffffff');
  panel.style.setProperty('--shc-muted', labelText);
  panel.style.setProperty('--shc-panel-bg', actionTheme.background || nativeFallbackBackground);
  panel.style.setProperty('--shc-row-border', actionTheme.rowBorder || nativeFallbackRowBorder);
  panel.style.setProperty('--shc-shadow', actionTheme.shadow || '0 12px 28px rgba(0, 0, 0, 0.38)');
}

function applyAdaptiveLibraryPanelPosition(container: HTMLElement, panel: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const actionBar = findLibraryActionBar(container);

  let bottom = 96;

  if (actionBar) {
    const barRect = actionBar.getBoundingClientRect();
    const distanceFromContainerBottomToBarTop = containerRect.bottom - barRect.top;

    if (
      Number.isFinite(distanceFromContainerBottomToBarTop) &&
      distanceFromContainerBottomToBarTop > 40 &&
      distanceFromContainerBottomToBarTop < containerRect.height
    ) {
      bottom = Math.ceil(distanceFromContainerBottomToBarTop + 10);
    }
  }

  panel.style.right = '16px';
  panel.style.left = 'auto';
  panel.style.top = 'auto';
  panel.style.bottom = `${bottom}px`;
}

function getOrCreatePanel(doc: Document, container: HTMLElement): HTMLElement {
  ensureStyle(doc);

  const existing = doc.getElementById(PANEL_ID);

  if (existing) {
    if (existing.parentElement !== container) {
      container.appendChild(existing);
    }

    container.style.position = 'relative';
    applyAdaptiveLibraryPanelPosition(container, existing);
    applyLibraryTheme(doc, container, existing);
    return existing;
  }

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-shc-library-panel', '1');

  container.style.position = 'relative';
  container.appendChild(panel);

  applyAdaptiveLibraryPanelPosition(container, panel);
  applyLibraryTheme(doc, container, panel);
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

  if (kind === 'error' || label.includes('error')) {
    return 'error';
  }

  return 'info';
}

function getRowVisual(item: ShcResponseItem): {
  iconHtml: string;
  iconClass: string;
  valueClass: string;
} {
  const kind = normalizeKind(item);

  if (kind === 'paid_dlc') {
    return {
      iconHtml: iconSvg('dlc'),
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'broken') {
    return {
      iconHtml: iconSvg('broken'),
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'conditional') {
    return {
      iconHtml: iconSvg('conditional'),
      iconClass: 'shc-row-icon-orange',
      valueClass: 'shc-value-orange',
    };
  }

  if (kind === 'unobtainable') {
    return {
      iconHtml: iconSvg('unobtainable'),
      iconClass: 'shc-row-icon-red',
      valueClass: 'shc-value-red',
    };
  }

  if (kind === 'restricted') {
    return {
      iconHtml: '<i class="icon icon-fw icon-spinner shc-native-icon" aria-hidden="true"></i>',
      iconClass: 'shc-row-icon-yellow',
      valueClass: 'shc-value-yellow',
    };
  }

  if (kind === 'players_perfected') {
    return {
      iconHtml: iconSvg('star'),
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  if (kind === 'median_completion') {
    return {
      iconHtml: iconSvg('clock'),
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  if (kind === 'perfected_by_starters') {
    return {
      iconHtml: iconSvg('percent'),
      iconClass: 'shc-row-icon-normal',
      valueClass: '',
    };
  }

  return {
    iconHtml: iconSvg('info'),
    iconClass: 'shc-row-icon-muted',
    valueClass: '',
  };
}

function responseHasAchievementRows(response: ShcResponse): boolean {
  if (!Array.isArray(response.items)) {
    return false;
  }

  return response.items.some((item) => {
    const kind = normalizeKind(item);

    return (
      kind === 'median_completion' ||
      kind === 'players_perfected' ||
      kind === 'perfected_by_starters' ||
      kind === 'broken' ||
      kind === 'conditional' ||
      kind === 'unobtainable' ||
      kind === 'restricted'
    );
  });
}

function renderResponse(
  doc: Document,
  container: HTMLElement,
  _appId: number,
  _reason: string,
  response: ShcResponse
) {
  if (response.show_panel === false || !responseHasAchievementRows(response)) {
    removePanel(doc);
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const kind = normalizeKind(item);

      if (kind === 'info') {
        continue;
      }

      const visual = getRowVisual(item);

      rows.push(`
        <div class="shc-row">
          <div class="shc-label">
            <span class="shc-label-wrap">
              <span class="shc-row-icon ${visual.iconClass}">
                ${visual.iconHtml}
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

  applyAdaptiveLibraryPanelPosition(container, panel);
  applyLibraryTheme(doc, container, panel);
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
    container.style.position = 'relative';
    applyAdaptiveLibraryPanelPosition(container, existing);
    applyLibraryTheme(doc, container, existing);
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

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  if (libraryIntervalId !== null) {
    window.clearInterval(libraryIntervalId);
  }

  observer = null;
  refreshTimer = null;
  libraryIntervalId = null;
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
    attributes: true,
    attributeFilter: ['class', 'style'],
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

  libraryIntervalId = window.setInterval(() => {
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