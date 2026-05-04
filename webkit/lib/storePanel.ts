import { callable } from '@steambrew/webkit';
import {
  IPCParams,
  ShcResponse,
  normalizeKind,
  parseBackendResponse,
  safeText,
} from './shared';
import { getIconHtml, getValueClass } from './icons';

const NS = '[SCC_WEBKIT]';

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

      --scc-accent: #00aeef;
      --scc-text: var(--gpStoreLightGrey, #c7d5e0);
      --scc-muted: rgba(199, 213, 224, 0.78);
      --scc-card-bg: rgba(27, 27, 27, 0.92);
      --scc-border: rgba(255, 255, 255, 0.085);
      --scc-yellow: #ffcc66;
      --scc-orange: #f39c12;
      --scc-red: #ff6b6b;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .scc-card {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 12px 5px 12px;
      border-radius: 8px;
      background: var(--scc-card-bg);
      border: 0;
      outline: 0;
      box-shadow: none;
      overflow: hidden;
    }

    #${PANEL_ID} .scc-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 12px;
      padding: 1px 0;
      min-height: 20px;
      line-height: 20px;
      border-top: 1px solid var(--scc-border);
    }

    #${PANEL_ID} .scc-row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    #${PANEL_ID} .scc-row:last-child {
      padding-bottom: 0;
    }

    #${PANEL_ID} .scc-label {
      color: var(--scc-muted);
      min-width: 0;
      height: 20px;
      line-height: 20px;
      overflow: hidden;
      display: flex;
      align-items: center;
      font-weight: 500;
    }

    #${PANEL_ID} .scc-label-wrap {
      display: grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 6px;
      min-width: 0;
      height: 20px;
      line-height: 20px;
    }

    #${PANEL_ID} .scc-label-wrap span:last-child {
      min-width: 0;
      height: 20px;
      line-height: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    #${PANEL_ID} .scc-row-icon {
      width: 14px;
      height: 20px;
      min-width: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
      line-height: 20px;
    }

    #${PANEL_ID} .scc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
    }

    #${PANEL_ID} .scc-native-icon {
      width: 14px;
      min-width: 14px;
      height: 20px;
      text-align: center;
      font-size: 12px;
      line-height: 20px;
      color: currentColor;
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
      height: 20px;
      line-height: 20px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      transform: translateY(1px);
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
      padding: 4px 0;
    }

    #${PANEL_ID} .scc-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 5px;
      padding-top: 6px;
      min-height: 20px;
      border-top: 1px solid var(--scc-border);
    }

    #${PANEL_ID} .scc-link,
    #${PANEL_ID} .scc-link:visited {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--scc-accent);
      font-size: 12px;
      font-weight: 600;
      line-height: 14px;
      height: 14px;
      text-decoration: none;
      opacity: 1;
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
      background: var(--scc-accent);
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
    } else if (existing.nextElementSibling !== placement.reference) {
      placement.parent.insertBefore(existing, placement.reference);
    }

    return existing;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('data-scc-store-panel', '1');

  placement.parent.insertBefore(panel, placement.reference);

  return panel;
}

function renderResponse(response: ShcResponse) {
  if (response.show_panel === false) {
    removePanel();
    return;
  }

  const rows: string[] = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const rowKind = normalizeKind(item);
      const label = safeText(item.label);
      const value = safeText(item.value);
      const icon = getIconHtml(rowKind);
      const valueClass = getValueClass(rowKind);

      if (rowKind === 'info') {
        continue;
      }

      rows.push(`
        <div class="scc-row">
          <div class="scc-label">
            <span class="scc-label-wrap">
              <span class="scc-row-icon ${icon.className}">
                ${icon.html}
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

export function bootStorePanel() {
  log('webkit boot', window.location.href);

  installHistoryHooks();
  installDomObserver();

  scheduleUpdate('boot');

  window.setInterval(() => {
    scheduleUpdate('interval');
  }, 1500);
}