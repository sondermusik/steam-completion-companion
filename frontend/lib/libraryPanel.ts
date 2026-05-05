import { callable } from '@steambrew/client';
import { getSettings, subscribeSettings } from './settings';
import {
  CompletionCompanionResponse,
  IpcParams,
  RgbaColor,
  cssColorIsTooGenericDark,
  escapeHtml,
  getCompletionCompanionIconHtml,
  getCompletionCompanionValueClass,
  getSteamHuntersIconFontCss,
  getUsefulCssStyleColor,
  mixRgbaColor,
  normalizeResponseItemKind,
  parseCompletionCompanionResponse,
  parsePositiveInteger,
  parseRgbaColor,
  responseHasCompletionRows,
  rgbaColorToCss,
  stringifyUnknownError,
} from '../../shared/steamCompletionCompanionCore';

const NS = '[SCC_LIBRARY]';

const sccJsonBridge = callable<[params: IpcParams], string>('shc_json_bridge');

const PANEL_ID = 'scc-companion-library-panel';
const STYLE_ID = 'scc-companion-library-style';

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

let unsubscribeSettings: (() => void) | null = null;

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
  const libraryAppId = parsePositiveInteger(libraryMatch?.[1]);

  if (libraryAppId !== null) {
    return {
      appId: libraryAppId,
      reason: 'MainWindowBrowserManager_library_path',
      href,
      pathname,
    };
  }

  const genericMatch = pathname.match(GENERIC_APP_PATH_PATTERN);
  const genericAppId = parsePositiveInteger(genericMatch?.[1]);

  if (genericAppId !== null && !href.toLowerCase().includes('store.steampowered.com')) {
    return {
      appId: genericAppId,
      reason: 'MainWindowBrowserManager_app_path',
      href,
      pathname,
    };
  }

  const hrefMatch = href.match(LIBRARY_PATH_PATTERN);
  const hrefAppId = parsePositiveInteger(hrefMatch?.[1]);

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

function shouldShowRowKind(kind: string): boolean {
  const visible = getSettings().visibleContent;

  if (kind === 'median_completion') return visible.medianCompletion;
  if (kind === 'players_perfected') return visible.playersPerfected;
  if (kind === 'perfected_by_starters') return visible.perfectedByStarters;
  if (kind === 'paid_dlc') return visible.paidDlc;
  if (kind === 'restricted') return visible.restricted;
  if (kind === 'broken') return visible.broken;
  if (kind === 'conditional') return visible.conditional;
  if (kind === 'unobtainable') return visible.unobtainable;

  return true;
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
      right: auto;
      top: auto;
      bottom: auto;
      left: auto;
      z-index: 9999;
      width: 330px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 7px 14px;
      border-radius: 9px;
      color: var(--scc-text, #ffffff);
      background: var(--scc-panel-bg, rgba(14, 20, 27, 0.85));
      border: 0;
      box-shadow: var(--scc-shadow, none);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);

      --scc-accent: #00aeef;
      --scc-text: #ffffff;
      --scc-muted: rgba(255, 255, 255, 0.78);
      --scc-panel-bg: rgba(36, 43, 47, 0.82);
      --scc-row-border: rgba(255, 255, 255, 0.105);
      --scc-shadow: none;
      --scc-yellow: #ffcc66;
      --scc-orange: #f39c12;
      --scc-red: #ff6b6b;
      --scc-row-height: 24px;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .scc-row,
    #${PANEL_ID} .scc-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 12px;
      width: 100%;
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      padding: 0;
      margin: 0;
      line-height: var(--scc-row-height);
      border-top: 1px solid var(--scc-row-border);
    }

    #${PANEL_ID} .scc-row:first-child {
      border-top: 0;
    }

#${PANEL_ID} .scc-footer {
  grid-template-columns: minmax(0, 1fr);
  justify-items: end;
  justify-content: stretch;
  height: var(--scc-row-height);
  min-height: var(--scc-row-height);
  max-height: var(--scc-row-height);
  line-height: var(--scc-row-height);
  margin: 0;
  padding: 0;
  transform: none;
}

#${PANEL_ID} .scc-footer .scc-link {
  height: var(--scc-row-height);
  min-height: var(--scc-row-height);
  max-height: var(--scc-row-height);
  line-height: var(--scc-row-height);
  display: inline-flex;
  align-items: center;
  transform: translateY(3px);
}

    #${PANEL_ID} .scc-label,
    #${PANEL_ID} .scc-value,
    #${PANEL_ID} .scc-link {
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
    }

    #${PANEL_ID} .scc-label {
      color: var(--scc-muted);
      min-width: 0;
      overflow: hidden;
      font-weight: 500;
    }

    #${PANEL_ID} .scc-label-wrap {
      display: grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 7px;
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
    }

    #${PANEL_ID} .scc-label-wrap span:last-child {
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    #${PANEL_ID} .scc-row-icon {
      width: 14px;
      min-width: 14px;
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
      line-height: var(--scc-row-height);
      overflow: hidden;
    }

    #${PANEL_ID} .scc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
      flex: 0 0 auto;
    }

    #${PANEL_ID} .scc-row-icon-restricted svg {
      width: 12px;
      height: 12px;
    }

    #${PANEL_ID} .scc-row-icon-normal,
    #${PANEL_ID} .scc-row-icon-muted {
      color: var(--scc-muted);
    }

    #${PANEL_ID} .scc-row-icon-yellow {
      color: var(--scc-yellow);
    }

    #${PANEL_ID} .scc-row-icon-orange {
      color: var(--scc-orange);
    }

    #${PANEL_ID} .scc-row-icon-red {
      color: var(--scc-red);
    }

    #${PANEL_ID} .scc-value {
      color: var(--scc-text);
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      justify-content: flex-end;
    }

    #${PANEL_ID} .scc-value-yellow {
      color: var(--scc-yellow);
    }

    #${PANEL_ID} .scc-value-orange {
      color: var(--scc-orange);
    }

    #${PANEL_ID} .scc-value-red {
      color: var(--scc-red);
    }

    #${PANEL_ID} .scc-error {
      color: #ffb4b4;
    }

    #${PANEL_ID} .scc-link,
    #${PANEL_ID} .scc-link:visited {
      gap: 5px;
      color: var(--scc-accent);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      opacity: 1;
    }

    #${PANEL_ID} .scc-link:hover {
      color: #ffffff;
      opacity: 1;
      text-decoration: none;
    }

    #${PANEL_ID} .scc-link-icon,
    #${PANEL_ID} .scc-link-icon-fallback {
      width: 14px;
      height: 14px;
      min-width: 14px;
      max-width: 14px;
      min-height: 14px;
      max-height: 14px;
      flex: 0 0 14px;
      border-radius: 3px;
    }

    #${PANEL_ID} .scc-link-icon {
      display: block;
    }

    #${PANEL_ID} .scc-link-icon-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--scc-accent);
      color: #0b141d;
      font-size: 7px;
      font-weight: 800;
      line-height: 1;
    }

    #${PANEL_ID} .scc-link-icon-fallback-hidden {
      display: none;
    }

    @media (max-width: 900px) {
      #${PANEL_ID} {
        width: 310px;
      }
    }

    ${getSteamHuntersIconFontCss(`#${PANEL_ID}`)}
  `;

  doc.head?.appendChild(style);
}

function getNativePanelBackgroundFromColor(source: RgbaColor): string {
  const black: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
  const neutral: RgbaColor = { r: 52, g: 60, b: 64, a: 1 };

  const luminance = (0.2126 * source.r + 0.7152 * source.g + 0.0722 * source.b) / 255;

  if (luminance > 0.48) {
    return mixRgbaColor(source, black, 0.58, 0.82);
  }

  return mixRgbaColor(source, neutral, 0.38, 0.82);
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
      const rgb = parseRgbaColor(background);

      if (rgb && rgb.a > 0.08 && !cssColorIsTooGenericDark(background)) {
        const text = getUsefulCssStyleColor(style, ['color']);
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

    const bgRgb = parseRgbaColor(colors.background);

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

  const bgRgb = parseRgbaColor(best.background);

  if (!bgRgb) {
    return null;
  }

  const white: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

  return {
    background: getNativePanelBackgroundFromColor(bgRgb),
    rowBorder: mixRgbaColor(bgRgb, white, 0.48, 0.16),
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

  let background = getUsefulCssStyleColor(actionStyle, [
    'background-color',
    '--gradient-body-background-color',
    '--color-background',
  ]);

  let text = getUsefulCssStyleColor(actionStyle, ['color']);

  if (!background || cssColorIsTooGenericDark(background)) {
    const children = Array.from(actionBar.querySelectorAll<HTMLElement>('*')).slice(0, 60);

    for (const child of children) {
      const rect = child.getBoundingClientRect();

      if (rect.width < 80 || rect.height < 20) {
        continue;
      }

      const childStyle = view?.getComputedStyle(child) || null;
      const childBackground = getUsefulCssStyleColor(childStyle, ['background-color']);
      const childText = getUsefulCssStyleColor(childStyle, ['color']);

      if (!background && childBackground && !cssColorIsTooGenericDark(childBackground)) {
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

  const bgRgb = background ? parseRgbaColor(background) : null;

  const panelBackground = bgRgb
    ? rgbaColorToCss(bgRgb, Math.max(0.68, Math.min(0.84, bgRgb.a || 0.78)))
    : null;

  const rowBorder = bgRgb ? rgbaColorToCss({ ...bgRgb, a: 1 }, 0.16) : null;

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

  panel.style.setProperty('--scc-accent', '#00aeef');
  panel.style.setProperty('--scc-text', '#ffffff');
  panel.style.setProperty('--scc-muted', pillTheme?.muted || labelText);
  panel.style.setProperty('--scc-panel-bg', actionTheme.background || pillTheme?.background || nativeFallbackBackground);
  panel.style.setProperty('--scc-row-border', actionTheme.rowBorder || pillTheme?.rowBorder || nativeFallbackRowBorder);
  panel.style.setProperty('--scc-shadow', 'none');
}

function applyLibraryPanelPosition(panel: HTMLElement) {
  const settings = getSettings();

  const BASE_HORIZONTAL_OFFSET = 16;
  const BASE_VERTICAL_OFFSET = 16;

  const userHorizontalOffset = Number.isFinite(settings.libraryPanelHorizontalOffset)
    ? settings.libraryPanelHorizontalOffset
    : 0;

  const userVerticalOffset = Number.isFinite(settings.libraryPanelVerticalOffset)
    ? settings.libraryPanelVerticalOffset
    : 0;

  const horizontalOffset = BASE_HORIZONTAL_OFFSET + userHorizontalOffset;
  const verticalOffset = BASE_VERTICAL_OFFSET + userVerticalOffset;

  panel.style.left = 'auto';
  panel.style.right = 'auto';
  panel.style.top = 'auto';
  panel.style.bottom = 'auto';

  if (settings.libraryPanelPosition === 'topLeft') {
    panel.style.left = `${horizontalOffset}px`;
    panel.style.top = `${verticalOffset}px`;
    return;
  }

  if (settings.libraryPanelPosition === 'topRight') {
    panel.style.right = `${horizontalOffset}px`;
    panel.style.top = `${verticalOffset}px`;
    return;
  }

  if (settings.libraryPanelPosition === 'bottomLeft') {
    panel.style.left = `${horizontalOffset}px`;
    panel.style.bottom = `${verticalOffset}px`;
    return;
  }

  panel.style.right = `${horizontalOffset}px`;
  panel.style.bottom = `${verticalOffset}px`;
}

function getOrCreatePanel(doc: Document, container: HTMLElement): HTMLElement {
  ensureStyle(doc);

  const existing = doc.getElementById(PANEL_ID);

  if (existing) {
    if (existing.parentElement !== container) {
      container.appendChild(existing);
    }

    container.style.position = 'relative';
    applyLibraryPanelPosition(existing);
    applyLibraryTheme(doc, container, existing);
    return existing;
  }

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-scc-library-panel', '1');

  container.style.position = 'relative';
  container.appendChild(panel);

  applyLibraryPanelPosition(panel);
  applyLibraryTheme(doc, container, panel);
  return panel;
}

function renderLoading(doc: Document) {
  removePanel(doc);
}

function renderResponse(
  doc: Document,
  container: HTMLElement,
  response: CompletionCompanionResponse
) {
  if (response.show_panel === false || !responseHasCompletionRows(response)) {
    removePanel(doc);
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const kind = normalizeResponseItemKind(item);

      if (kind === 'info') {
        continue;
      }

      if (!shouldShowRowKind(kind)) {
  continue;
}

      const icon = getCompletionCompanionIconHtml(kind);
      const valueClass = getCompletionCompanionValueClass(kind);

      rows.push(`
        <div class="scc-row">
          <div class="scc-label">
            <span class="scc-label-wrap">
              <span class="scc-row-icon ${icon.className}">
                ${icon.html}
              </span>
              <span>${escapeHtml(item.label)}</span>
            </span>
          </div>
          <div class="scc-value ${valueClass}">${escapeHtml(item.value)}</div>
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
    ? escapeHtml(response.steam_hunters_url)
    : '';

const footer = steamHuntersUrl && getSettings().visibleContent.steamHuntersLink
  ? `
      <div class="scc-footer">
        <a class="scc-link" href="${steamHuntersUrl}" target="_blank" rel="noopener noreferrer">
          <img
            class="scc-link-icon"
            src="https://steamhunters.com/content/img/steam_hunters.svg?v=201706240149"
            onerror="this.style.display='none'; this.nextElementSibling.classList.remove('scc-link-icon-fallback-hidden');"
          />
          <span class="scc-link-icon-fallback scc-link-icon-fallback-hidden">SH</span>
          <span>View on SteamHunters →</span>
        </a>
      </div>
    `
    : '';

  panel.innerHTML = `
    ${rows.join('')}
    ${footer}
  `;

  applyLibraryPanelPosition(panel);
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
    <div class="scc-row">
      <div class="scc-label">Error</div>
      <div class="scc-value scc-error">${escapeHtml(message)}</div>
    </div>
    <div class="scc-row">
      <div class="scc-label">App ID</div>
      <div class="scc-value">${escapeHtml(appId)}</div>
    </div>
    <div class="scc-row">
      <div class="scc-label">Reason</div>
      <div class="scc-value">${escapeHtml(reason)}</div>
    </div>
  `;
}

async function updateLibraryPanel(doc: Document, reasonFromCaller: string) {
  if (!getSettings().showInLibrary) {
    lastAppId = null;
    processingAppId = null;
    removePanel(doc);
    return;
  }

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
    applyLibraryPanelPosition(existing);
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
    const raw = await sccJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    const response = parseCompletionCompanionResponse(String(raw));

    renderResponse(doc, container, response);
  } catch (error) {
    warn('backend call failed', error);
    renderError(doc, container, appId, detection.reason, stringifyUnknownError(error));
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

  if (unsubscribeSettings !== null) {
    unsubscribeSettings();
  }

  unsubscribeSettings = null;

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

unsubscribeSettings = subscribeSettings((settings: { showInLibrary: boolean }) => {
  if (!settings.showInLibrary) {
    removePanel(doc);
    return;
  }

  scheduleLibraryUpdate(doc, 'settings_changed');
});

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