// @ts-nocheck
// webkit/lib/storePanel.ts
import { callable } from '@steambrew/webkit';
import {
  escapeHtml,
  getCompletionCompanionIconHtml,
  getCompletionCompanionValueClass,
  normalizeResponseItemKind,
  parseCompletionCompanionResponse,
  parsePositiveInteger,
} from '../../shared/steamCompletionCompanionCore';

const NS = '[SCC_WEBKIT]';

const sccJsonBridge = callable('shc_json_bridge');

const PANEL_ID = 'scc-store-panel';
const STYLE_ID = 'scc-store-style';
const STORE_APP_PATTERN = /store\.steampowered\.com\/app\/(\d+)/i;

let lastAppId = null;
let refreshTimer = null;

function log(...args) {
  console.log(NS, ...args);
}

function warn(...args) {
  console.warn(NS, ...args);
}

function getStoreAppIdFromUrl() {
  const href = String(window.location.href || '');
  const match = href.match(STORE_APP_PATTERN);

  return parsePositiveInteger(match && match[1] ? match[1] : undefined);
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
      line-height: 1;
      clear: both;

      --scc-accent: #00aeef;
      --scc-text: var(--gpStoreLightGrey, #c7d5e0);
      --scc-muted: rgba(199, 213, 224, 0.78);
      --scc-card-bg: rgba(27, 27, 27, 0.92);
      --scc-border: rgba(255, 255, 255, 0.085);
      --scc-yellow: #ffcc66;
      --scc-orange: #f39c12;
      --scc-red: #ff6b6b;
      --scc-row-height: 24px;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .scc-card {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 12px;
      border-radius: 8px;
      background: var(--scc-card-bg);
      border: 0;
      outline: 0;
      box-shadow: none;
      overflow: hidden;
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
      border-top: 1px solid var(--scc-border);
    }

    #${PANEL_ID} .scc-row:first-child {
      border-top: 0;
    }

    #${PANEL_ID} .scc-footer {
      grid-template-columns: minmax(0, 1fr);
      justify-items: end;
      justify-content: stretch;
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
      column-gap: 6px;
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

    #${PANEL_ID} .scc-footer .scc-link,
    #${PANEL_ID} .scc-footer .scc-link:visited {
      position: relative;
      top: 3px;
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
  `;

  document.documentElement.appendChild(style);
}

function findFeatureMetadataBlock() {
  const directBlockSelectors = [
    '.block.responsive_apppage_details_right',
    '.game_area_details_specs_ctn',
    '.game_area_details_specs',
    '#category_block',
  ];

  for (const selector of directBlockSelectors) {
    const element = document.querySelector(selector);

    if (!element) {
      continue;
    }

    const block = element.closest('.block.responsive_apppage_details_right');

    if (block) {
      return block;
    }

    return element;
  }

  const links = Array.from(document.querySelectorAll('a, div, span'));

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
        element.closest('.block.responsive_apppage_details_right') ||
        element.closest('.game_area_details_specs_ctn') ||
        element.closest('.game_area_details_specs');

      if (block) {
        return block;
      }
    }
  }

  return null;
}

function findStoreInsertionParentAndReference() {
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

function getOrCreatePanel() {
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

function renderResponse(response) {
  if (response.show_panel === false) {
    removePanel();
    return;
  }

  const rows = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const rowKind = normalizeResponseItemKind(item);

      if (rowKind === 'info') {
        continue;
      }

      const label = escapeHtml(item.label);
      const value = escapeHtml(item.value);
      const icon = getCompletionCompanionIconHtml(rowKind);
      const valueClass = getCompletionCompanionValueClass(rowKind);

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
    ? escapeHtml(response.steam_hunters_url)
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

function renderError(message) {
  const panel = getOrCreatePanel();

  if (!panel) {
    return;
  }

  panel.innerHTML = `
    <div class="scc-card">
      <div class="scc-error">${escapeHtml(message)}</div>
    </div>
  `;
}

async function updateStorePanel(reason) {
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
    const raw = await sccJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    const response = parseCompletionCompanionResponse(String(raw));

    renderResponse(response);
  } catch (error) {
    warn('backend call failed', error);
    renderError(error instanceof Error ? error.message : String(error));
  }
}

function scheduleUpdate(reason) {
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

  window.history.pushState = function patchedPushState() {
    const result = Reflect.apply(originalPushState, window.history, arguments);
    scheduleUpdate('push_state');
    return result;
  };

  window.history.replaceState = function patchedReplaceState() {
    const result = Reflect.apply(originalReplaceState, window.history, arguments);
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