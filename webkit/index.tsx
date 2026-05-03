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
  steam_hunters_url?: string;
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

    #${PANEL_ID} .scc-label-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    #${PANEL_ID} .scc-row-icon {
      width: 14px;
      height: 14px;
      min-width: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
      transform: translateY(1px);
    }

    #${PANEL_ID} .scc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
    }

    #${PANEL_ID} .scc-row-icon-normal {
      color: #c7d5e0;
    }

    #${PANEL_ID} .scc-row-icon-muted {
      color: #8f98a0;
    }

    #${PANEL_ID} .scc-row-icon-yellow {
      color: #ffcc66;
    }

    #${PANEL_ID} .scc-row-icon-orange {
      color: #f39c12;
    }

    #${PANEL_ID} .scc-row-icon-red {
      color: #ff6b6b;
    }

    #${PANEL_ID} .scc-row-icon-blue {
      color: #66c0f4;
    }

    #${PANEL_ID} .scc-value {
      color: #c7d5e0;
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }

    #${PANEL_ID} .scc-value-yellow {
      color: #ffcc66;
    }

    #${PANEL_ID} .scc-value-orange {
      color: #f39c12;
    }

    #${PANEL_ID} .scc-value-red {
      color: #ff6b6b;
    }

    #${PANEL_ID} .scc-value-blue {
      color: #66c0f4;
    }

    #${PANEL_ID} .scc-error {
      color: #ffb4b4;
      padding: 4px 0;
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
  `;

  document.documentElement.appendChild(style);
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
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M6.4 17.6 17.6 6.4" fill="none" stroke-width="2" stroke-linecap="round"/>
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

function getRowIcon(label: string): { kind: string; className: string } {
  const lower = label.toLowerCase();

  if (lower.includes('paid dlc')) {
    return { kind: 'dlc', className: 'scc-row-icon-yellow' };
  }

  if (lower.includes('broken but obtainable')) {
    return { kind: 'broken', className: 'scc-row-icon-yellow' };
  }

  if (lower.includes('conditionally obtainable')) {
    return { kind: 'conditional', className: 'scc-row-icon-orange' };
  }

  if (lower.includes('unobtainable')) {
    return { kind: 'unobtainable', className: 'scc-row-icon-red' };
  }

  if (lower.includes('restricted')) {
    return { kind: 'restricted', className: 'scc-row-icon-yellow' };
  }

  if (lower.includes('players perfected')) {
    return { kind: 'star', className: 'scc-row-icon-normal' };
  }

  if (lower.includes('median completion')) {
    return { kind: 'clock', className: 'scc-row-icon-normal' };
  }

  if (lower.includes('steamdb rating')) {
    return { kind: 'chart', className: 'scc-row-icon-normal' };
  }

  if (lower.includes('perfected by starters')) {
    return { kind: 'percent', className: 'scc-row-icon-normal' };
  }

  return { kind: 'info', className: 'scc-row-icon-muted' };
}

function getValueClass(label: string): string {
  const lower = label.toLowerCase();

  if (lower.includes('broken but obtainable')) {
    return 'scc-value-yellow';
  }

  if (lower.includes('conditionally obtainable')) {
    return 'scc-value-orange';
  }

  if (lower.includes('unobtainable')) {
    return 'scc-value-red';
  }

  if (lower.includes('paid dlc')) {
    return 'scc-value-yellow';
  }

  if (lower.includes('restricted')) {
    return 'scc-value-yellow';
  }

  return '';
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

function renderResponse(response: ShcResponse) {
  if (response.show_panel === false) {
    removePanel();
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const rawLabel = String(item.label || '');
      const label = safeText(rawLabel);
      const value = safeText(item.value);
      const icon = getRowIcon(rawLabel);
      const valueClass = getValueClass(rawLabel);

      rows.push(`
        <div class="scc-row">
          <div class="scc-label">
            <span class="scc-label-wrap">
              <span class="scc-row-icon ${icon.className}">
                ${iconSvg(icon.kind)}
              </span>
              <span>${label}</span>
            </span>
          </div>
          <div class="scc-value ${valueClass}">${value}</div>
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

  const steamHuntersUrl = response.steam_hunters_url
    ? safeText(response.steam_hunters_url)
    : '';

  const footer = steamHuntersUrl
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
    <div class="scc-card">
      ${rows.join('')}
      ${footer}
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