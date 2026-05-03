import { callable } from '@steambrew/webkit';

const NS = '[SHC_WEBKIT]';

type IPCValue = string | number | boolean | null;
type IPCParams = Record<string, IPCValue>;

type ShcResponseItem = {
  label?: string;
  value?: string;
};

type ShcResponse = {
  ok?: boolean;
  type?: string;
  has_app?: boolean;
  app_id?: number;
  page_kind?: string;
  title?: string;
  summary?: string;
  restricted_count?: number;
  items?: ShcResponseItem[];
  error?: string;
};

const shcJsonBridge = callable<[params: IPCParams], string>('shc_json_bridge');

const PANEL_ID = 'shc-companion-store-panel';
const STYLE_ID = 'shc-companion-store-style';
const STORE_APP_PATTERN = /store\.steampowered\.com\/app\/(\d+)/i;

let lastAppId: number | null = null;
let refreshTimer: number | null = null;

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

function getStoreAppIdFromUrl(): number | null {
  const href = String(window.location.href || '');
  const match = href.match(STORE_APP_PATTERN);

  if (!match) {
    return null;
  }

  const appId = Number.parseInt(match[1], 10);

  if (!Number.isFinite(appId) || appId <= 0) {
    return null;
  }

  return appId;
}

function removePanel() {
  const existing = document.getElementById(PANEL_ID);

  if (existing) {
    existing.remove();
  }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
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

    #${PANEL_ID} .shc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    #${PANEL_ID} .shc-title {
      font-weight: 700;
      font-size: 13px;
      color: #ffffff;
      letter-spacing: 0.2px;
    }

    #${PANEL_ID} .shc-badge {
      padding: 2px 7px;
      border-radius: 999px;
      color: #9fd4ff;
      background: rgba(74, 144, 196, 0.18);
      border: 1px solid rgba(126, 189, 232, 0.22);
      font-size: 11px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    #${PANEL_ID} .shc-summary {
      color: #c9d3dc;
      margin-bottom: 9px;
    }

    #${PANEL_ID} .shc-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    #${PANEL_ID} .shc-label {
      color: #91a4b5;
    }

    #${PANEL_ID} .shc-value {
      color: #ffffff;
      text-align: right;
      overflow-wrap: anywhere;
    }

    #${PANEL_ID} .shc-error {
      color: #ffb4b4;
    }

    #${PANEL_ID} .shc-small {
      margin-top: 9px;
      color: #6f8394;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
  `;

  document.documentElement.appendChild(style);
}

function getOrCreatePanel(): HTMLElement {
  ensureStyle();

  const existing = document.getElementById(PANEL_ID);

  if (existing) {
    return existing;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-shc-store-panel', '1');

  document.documentElement.appendChild(panel);

  return panel;
}

function renderLoading(appId: number) {
  const panel = getOrCreatePanel();

  panel.innerHTML = `
    <div class="shc-head">
      <div class="shc-title">SteamHunters Companion</div>
      <div class="shc-badge">store</div>
    </div>
    <div class="shc-summary">Loading store probe info...</div>
    <div class="shc-row">
      <div class="shc-label">App ID</div>
      <div class="shc-value">${safeText(appId)}</div>
    </div>
  `;
}

function parseBackendResponse(raw: string): ShcResponse {
  try {
    return JSON.parse(raw) as ShcResponse;
  } catch {
    return {
      ok: false,
      type: 'parse_error',
      title: 'SteamHunters Companion',
      summary: 'Backend returned non JSON response.',
      restricted_count: 0,
      items: [],
      error: raw,
    };
  }
}

function renderResponse(appId: number, response: ShcResponse) {
  const panel = getOrCreatePanel();

  const title = safeText(response.title || 'SteamHunters Companion');
  const summary = safeText(response.summary || 'No summary.');
  const restrictedCount = response.restricted_count ?? 0;

  const rows: string[] = [];

  rows.push(`
    <div class="shc-row">
      <div class="shc-label">App ID</div>
      <div class="shc-value">${safeText(appId)}</div>
    </div>
  `);

  rows.push(`
    <div class="shc-row">
      <div class="shc-label">Restricted</div>
      <div class="shc-value">${safeText(restrictedCount)}</div>
    </div>
  `);

  rows.push(`
    <div class="shc-row">
      <div class="shc-label">Context</div>
      <div class="shc-value">store</div>
    </div>
  `);

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      rows.push(`
        <div class="shc-row">
          <div class="shc-label">${safeText(item.label)}</div>
          <div class="shc-value">${safeText(item.value)}</div>
        </div>
      `);
    }
  }

  panel.innerHTML = `
    <div class="shc-head">
      <div class="shc-title">${title}</div>
      <div class="shc-badge">store</div>
    </div>
    <div class="shc-summary">${summary}</div>
    ${rows.join('')}
    <div class="shc-small">reason=store_url_app_only</div>
  `;
}

function renderError(appId: number, message: string) {
  const panel = getOrCreatePanel();

  panel.innerHTML = `
    <div class="shc-head">
      <div class="shc-title">SteamHunters Companion</div>
      <div class="shc-badge">store</div>
    </div>
    <div class="shc-summary shc-error">${safeText(message)}</div>
    <div class="shc-row">
      <div class="shc-label">App ID</div>
      <div class="shc-value">${safeText(appId)}</div>
    </div>
  `;
}

async function updateStorePanel(reason: string) {
  const appId = getStoreAppIdFromUrl();

  if (appId === null) {
    lastAppId = null;
    removePanel();
    return;
  }

  if (appId === lastAppId && reason !== 'manual') {
    return;
  }

  lastAppId = appId;

  log('detected store app page', appId);

  renderLoading(appId);

  const payload = {
    type: 'get_page_info',
    source: 'webkit_store',
    page_kind: 'store',
    app_id: appId,
    href: String(window.location.href || ''),
    title: String(document.title || ''),
    reason: 'store_url_app_only',
    time: new Date().toISOString(),
  };

  try {
    const raw = await shcJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    const response = parseBackendResponse(String(raw));

    renderResponse(appId, response);
  } catch (err) {
    warn('backend call failed', err);
    renderError(appId, err instanceof Error ? err.message : String(err));
  }
}

function scheduleUpdate(reason: string) {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    updateStorePanel(reason);
  }, 250);
}

function installHistoryHooks() {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    scheduleUpdate('push_state');
    return result;
  };

  window.history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleUpdate('replace_state');
    return result;
  };

  window.addEventListener('popstate', () => scheduleUpdate('pop_state'));
  window.addEventListener('hashchange', () => scheduleUpdate('hash_change'));
}

function boot() {
  log('webkit boot', window.location.href);

  installHistoryHooks();
  scheduleUpdate('boot');

  window.setInterval(() => {
    scheduleUpdate('interval');
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}