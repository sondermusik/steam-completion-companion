import { useEffect, useState } from 'react';
import {
  definePlugin,
  Field,
  DialogButton,
  callable,
  IconsModule,
  Millennium,
} from '@steambrew/client';

const NS = '[SCC_FRONTEND]';

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

const PANEL_ID = 'scc-library-panel';
const STYLE_ID = 'scc-library-style';

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
      right: 18px;
      top: 18px;
      z-index: 9999;
      width: 330px;
      max-width: calc(100vw - 36px);
      box-sizing: border-box;
      padding: 13px 14px 12px 14px;
      border-radius: 12px;
      color: #dfe3e6;
      background: rgba(13, 17, 22, 0.94);
      border: 1px solid rgba(117, 174, 209, 0.38);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      pointer-events: auto;
      backdrop-filter: blur(10px);
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .scc-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    #${PANEL_ID} .scc-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    #${PANEL_ID} .scc-label {
      color: #91a4b5;
    }

    #${PANEL_ID} .scc-value {
      color: #ffffff;
      text-align: right;
      overflow-wrap: anywhere;
      font-weight: 700;
    }

    #${PANEL_ID} .scc-row-warning .scc-value {
      color: #ffcc66;
    }

    #${PANEL_ID} .scc-row-error .scc-value {
      color: #ffb4b4;
    }

    #${PANEL_ID} .scc-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    #${PANEL_ID} .scc-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #66c0f4;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      opacity: 0.9;
    }

    #${PANEL_ID} .scc-link:hover {
      color: #ffffff;
      opacity: 1;
      text-decoration: none;
    }

    #${PANEL_ID} .scc-link-icon {
      width: 14px;
      height: 14px;
      display: block;
      border-radius: 3px;
      flex: 0 0 auto;
    }

    #${PANEL_ID} .scc-link-icon-fallback {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: #66c0f4;
      color: #0b141d;
      font-size: 7px;
      font-weight: 800;
      line-height: 1;
      flex: 0 0 auto;
    }

    #${PANEL_ID} .scc-link-icon-fallback-hidden {
      display: none;
    }

    #${PANEL_ID} .scc-error {
      color: #ffb4b4;
      padding: 4px 0;
    }
  `;

  doc.head?.appendChild(style);
}

function getOrCreatePanel(doc: Document, container: HTMLElement): HTMLElement {
  ensureStyle(doc);

  const existing = doc.getElementById(PANEL_ID);

  if (existing) {
    if (existing.parentElement !== container) {
      container.appendChild(existing);
    }

    return existing;
  }

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-scc-library-panel', '1');

  container.style.position = 'relative';
  container.appendChild(panel);

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
      items: [
        {
          label: 'Error',
          value: 'Backend returned non JSON response.',
          kind: 'error',
        },
      ],
      error: raw,
    };
  }
}

function rowClassForKind(kind: string): string {
  if (
    kind === 'paid_dlc' ||
    kind === 'restricted' ||
    kind === 'removed' ||
    kind === 'broken' ||
    kind === 'conditional' ||
    kind === 'unobtainable'
  ) {
    return ' scc-row-warning';
  }

  if (kind === 'error') {
    return ' scc-row-error';
  }

  return '';
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
      const label = safeText(item.label);
      const value = safeText(item.value);
      const kind = safeText(item.kind || 'metric');
      const rowClass = rowClassForKind(String(item.kind || 'metric'));

      rows.push(`
        <div class="scc-row${rowClass}" data-kind="${kind}">
          <div class="scc-label">${label}</div>
          <div class="scc-value">${value}</div>
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
      <div class="scc-footer">
        <a class="scc-link" href="${steamHuntersUrl}" target="_blank" rel="noopener noreferrer">
          <img
            class="scc-link-icon"
            src="https://www.google.com/s2/favicons?domain=steamhunters.com&sz=32"
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
}

function renderError(
  doc: Document,
  container: HTMLElement,
  _appId: number,
  _reason: string,
  message: string
) {
  const panel = getOrCreatePanel(doc, container);

  panel.innerHTML = `
    <div class="scc-error">${safeText(message)}</div>
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
      label="Steam Completion Companion"
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