import { callable } from '@steambrew/webkit';

const NS = '[SCC_WEBKIT]';

type IPCValue = string | number | boolean | null;
type IPCParams = Record<string, IPCValue>;

type ShcResponseItem = {
  label?: string;
  value?: string;
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
  items?: ShcResponseItem[];
  error?: string;
};

const shcJsonBridge = callable<[params: IPCParams], string>('shc_json_bridge');

const PANEL_ID = 'scc-store-panel';
const STYLE_ID = 'scc-store-style';
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
      width: 100%;
      box-sizing: border-box;
      margin: 2px 0;
      padding: 0;
      color: var(--gpStoreLightGrey, #c7d5e0);
      font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.35;
      clear: both;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .scc-card {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 12px 5px 12px;
      border-radius: 8px;
      background: rgba(28, 28, 28, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.04);
      box-shadow: none;
    }

    #${PANEL_ID} .scc-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      padding: 1px 0;
      min-height: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    #${PANEL_ID} .scc-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    #${PANEL_ID} .scc-row:last-child {
      padding-bottom: 0;
    }

    #${PANEL_ID} .scc-label {
      color: #8f98a0;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    #${PANEL_ID} .scc-value {
      color: #c7d5e0;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }

    #${PANEL_ID} .scc-value-warning {
      color: #ffcc66;
    }

    #${PANEL_ID} .scc-error {
      color: #ffb4b4;
      padding: 4px 0;
    }
  `;

  document.documentElement.appendChild(style);
}

function findFeatureMetadataBlock(): HTMLElement | null {
  const directBlockSelectors = [
    '.block.responsive_apppage_details_right',
    '.game_area_details_specs_ctn',
    '.game_area_details_specs',
    '#category_block',
  ];

  for (const selector of directBlockSelectors) {
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) {
      continue;
    }

    const block = element.closest<HTMLElement>('.block.responsive_apppage_details_right');

    if (block) {
      return block;
    }

    return element;
  }

  const links = Array.from(document.querySelectorAll<HTMLElement>('a, div, span'));

  for (const element of links) {
    const text = String(element.textContent || '').trim().toLowerCase();

    if (
      text.includes('singleplayer') ||
      text.includes('einzelspieler') ||
      text.includes('steam achievements') ||
      text.includes('steam-errungenschaften') ||
      text.includes('steam cloud')
    ) {
      const block =
        element.closest<HTMLElement>('.block.responsive_apppage_details_right') ||
        element.closest<HTMLElement>('.game_area_details_specs_ctn') ||
        element.closest<HTMLElement>('.game_area_details_specs');

      if (block) {
        return block;
      }
    }
  }

  return null;
}

function findStoreInsertionParentAndReference(): {
  parent: HTMLElement;
  reference: HTMLElement;
} | null {
  const featureBlock = findFeatureMetadataBlock();

  if (!featureBlock) {
    return null;
  }

  const parent = featureBlock.parentElement;

  if (!parent) {
    return null;
  }

  return {
    parent,
    reference: featureBlock,
  };
}

function getOrCreatePanel(): HTMLElement | null {
  ensureStyle();

  const placement = findStoreInsertionParentAndReference();

  if (!placement) {
    return null;
  }

  const existing = document.getElementById(PANEL_ID);

  if (existing) {
    if (existing.parentElement !== placement.parent) {
      placement.parent.insertBefore(existing, placement.reference);
    } else {
      const currentNext = existing.nextElementSibling;

      if (currentNext !== placement.reference) {
        placement.parent.insertBefore(existing, placement.reference);
      }
    }

    return existing;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-scc-store-panel', '1');

  placement.parent.insertBefore(panel, placement.reference);

  return panel;
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

function isWarningRow(label: string): boolean {
  const lower = label.toLowerCase();

  return (
    lower.includes('paid dlc') ||
    lower.includes('restricted') ||
    lower.includes('broken') ||
    lower.includes('conditionally') ||
    lower.includes('unobtainable') ||
    lower.includes('error')
  );
}

function renderResponse(response: ShcResponse) {
  if (response.show_panel === false) {
    removePanel();
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const label = safeText(item.label);
      const value = safeText(item.value);
      const warningClass = isWarningRow(String(item.label || '')) ? ' scc-value-warning' : '';

      rows.push(`
        <div class="scc-row">
          <div class="scc-label">${label}</div>
          <div class="scc-value${warningClass}">${value}</div>
        </div>
      `);
    }
  }

  if (rows.length === 0) {
    removePanel();
    return;
  }

  const panel = getOrCreatePanel();

  if (!panel) {
    log('store insertion target missing');
    return;
  }

  panel.innerHTML = `
    <div class="scc-card">
      ${rows.join('')}
    </div>
  `;
}

function renderError(message: string) {
  const panel = getOrCreatePanel();

  if (!panel) {
    return;
  }

  panel.innerHTML = `
    <div class="scc-card">
      <div class="scc-error">${safeText(message)}</div>
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

  const existing = document.getElementById(PANEL_ID);

  if (appId === lastAppId && existing && reason !== 'manual') {
    const placement = findStoreInsertionParentAndReference();

    if (placement && existing.parentElement !== placement.parent) {
      placement.parent.insertBefore(existing, placement.reference);
    }

    return;
  }

  const placement = findStoreInsertionParentAndReference();

  if (!placement) {
    log('store app detected but insertion target missing', appId);
    return;
  }

  lastAppId = appId;

  log('detected store app page', appId);

  removePanel();

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

    renderResponse(response);
  } catch (err) {
    warn('backend call failed', err);
    renderError(err instanceof Error ? err.message : String(err));
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

function installDomObserver() {
  const observer = new MutationObserver(() => {
    scheduleUpdate('dom_mutation');
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function boot() {
  log('webkit boot', window.location.href);

  installHistoryHooks();
  installDomObserver();

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