// @ts-nocheck

import { callable } from '@steambrew/webkit';
import { getSettings, initSettings } from './settings';
import {
  parseCompletionCompanionResponse,
} from '../../shared/steamCompletionCompanionCore';
import {
  findStoreInsertionParentAndReference,
  getStoreAppIdFromUrl,
} from './storeDetection';
import { removeStorePanel, STORE_PANEL_ID } from './storeDom';
import { renderStoreError, renderStoreResponse } from './storeRender';

const NS = '[SCC_WEBKIT]';

const sccJsonBridge = callable('shc_json_bridge');

let lastAppId = null;
let refreshTimer = null;

function log(...args) {
  console.log(NS, ...args);
}

function warn(...args) {
  console.warn(NS, ...args);
}

/**
 * Updates the Steam Store panel for the active app page.
 */
async function updateStorePanel(reason) {
  await initSettings();

  if (!getSettings().showOnStorePages) {
    lastAppId = null;
    removeStorePanel();
    return;
  }

  const appId = getStoreAppIdFromUrl();

  if (appId === null) {
    lastAppId = null;
    removeStorePanel();
    return;
  }

  const existing = document.getElementById(STORE_PANEL_ID);

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

  removeStorePanel();

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

    const rendered = renderStoreResponse(response);

    if (rendered === false) {
      log('store insertion target missing');
    }
  } catch (error) {
    warn('backend call failed', error);
    renderStoreError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Debounces Store page changes and DOM mutations.
 */
function scheduleUpdate(reason) {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    updateStorePanel(reason);
  }, 250);
}

/**
 * Hooks single-page navigation used by Steam Store web pages.
 */
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

/**
 * Watches late-loading Store metadata blocks.
 */
function installDomObserver() {
  const observer = new MutationObserver(() => {
    scheduleUpdate('dom_mutation');
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * Boots the webkit-side Store integration.
 */
export function bootStorePanel() {
  log('webkit boot', window.location.href);

  installHistoryHooks();
  installDomObserver();

  scheduleUpdate('boot');

  window.setInterval(() => {
    scheduleUpdate('interval');
  }, 1500);
}