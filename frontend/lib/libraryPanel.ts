import { callable } from '@steambrew/client';
import {
  IPCParams,
  ShcResponse,
  Rgba,
  getUsefulStyleColor,
  isTooGenericDark,
  mixRgb,
  normalizeKind,
  parseAppId,
  parseBackendResponse,
  parseRgb,
  responseHasAchievementRows,
  rgbaString,
  safeText,
  stringifyError,
} from './shared';
import { getIconHtml, getValueClass } from './icons';

const NS = '[SHC_LIBRARY]';

const shcJsonBridge = callable<[params: IPCParams], string>('shc_json_bridge');

const PANEL_ID = 'shc-companion-library-panel';
const STYLE_ID = 'shc-companion-library-style';

const LIBRARY_PATH_PATTERN = /\/library\/app\/(\d+)/i;
const GENERIC_APP_PATH_PATTERN = /\/app\/(\d+)/i;
const LIBRARY_GAME_CONTAINER_SELECTOR = '.NZMJ6g2iVnFsOOp-lDmIP';

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
      color: var(--shc-text, #ffffff);
      background: var(--shc-panel-bg, rgba(36, 43, 47, 0.82));
      border: 0;
      box-shadow: var(--shc-shadow, 0 12px 28px rgba(0, 0, 0, 0.38));
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);

      --shc-accent: #00aeef;
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

    #${PANEL_ID} .shc-row-icon-normal,
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
      color: var(--shc-accent);
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
        width: 310px;
      }
    }
  `;

  doc.head?.appendChild(style);
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

    return !(
      lower.includes('median completion') ||
      lower.includes('players perfected') ||
      lower.includes('perfected by starters') ||
      lower.includes('view on steamhunters') ||
      lower.includes('errungenschaften') ||
      lower.includes('achievements') ||
      lower.includes('spielen') ||
      lower.includes('play')
    );
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

  return {
    background: getNativePanelBackgroundFromColor(bgRgb),
    rowBorder: mixRgb(bgRgb, white, 0.48, 0.16),
    text: '#ffffff',
    muted: 'rgba(255, 255, 255, 0.78)',
    accent: '#00aeef',
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
  const pillTheme = findTopRightCollectionPillTheme(doc);
  const actionTheme = findActionBarThemeColors(doc, container);

  const nativeFallbackBackground = 'rgba(36, 43, 47, 0.82)';
  const nativeFallbackRowBorder = 'rgba(255, 255, 255, 0.105)';
  const labelText = 'rgba(255, 255, 255, 0.78)';

  panel.style.setProperty('--shc-accent', '#00aeef');
  panel.style.setProperty('--shc-text', '#ffffff');
  panel.style.setProperty('--shc-muted', pillTheme?.muted || labelText);
  panel.style.setProperty('--shc-panel-bg', actionTheme.background || pillTheme?.background || nativeFallbackBackground);
  panel.style.setProperty('--shc-row-border', actionTheme.rowBorder || pillTheme?.rowBorder || nativeFallbackRowBorder);
  panel.style.setProperty('--shc-shadow', actionTheme.shadow || pillTheme?.shadow || '0 12px 28px rgba(0, 0, 0, 0.38)');
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

function renderLoading(doc: Document) {
  removePanel(doc);
}

function renderResponse(
  doc: Document,
  container: HTMLElement,
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

      const icon = getIconHtml(kind);
      const valueClass = getValueClass(kind);

      rows.push(`
        <div class="shc-row">
          <div class="shc-label">
            <span class="shc-label-wrap">
              <span class="shc-row-icon ${icon.className}">
                ${icon.html}
              </span>
              <span>${safeText(item.label)}</span>
            </span>
          </div>
          <div class="shc-value ${valueClass}">${safeText(item.value)}</div>
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

  renderLoading(doc);

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

    renderResponse(doc, container, response);
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

export function disconnectLibraryObserver() {
  if (observer) {
    observer.disconnect();
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

export function cleanupLibraryPanel(doc: Document) {
  removePanel(doc);
}

export function setupLibraryObserver(doc: Document) {
  disconnectLibraryObserver();

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