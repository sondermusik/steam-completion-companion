import { callable } from '@steambrew/client';
import { getSettings, subscribeSettings } from './settings';
import {
  CompletionCompanionResponse,
  IpcParams,
  parseCompletionCompanionResponse,
  stringifyUnknownError,
} from '../../shared/steamCompletionCompanionCore';
import {
  getGameName,
  getLibraryAppId,
  getLibraryContainer,
  getSteamLibraryPathname,
} from './libraryDetection';
import { LIBRARY_PANEL_ID, removeLibraryPanel } from './libraryDom';
import { applyLibraryPanelPosition } from './libraryPosition';
import {
  renderLibraryError,
  renderLibraryLoading,
  renderLibraryResponse,
} from './libraryRender';

const NS = '[SCC_LIBRARY]';

const sccJsonBridge = callable<[params: IpcParams], string>('shc_json_bridge');

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

/**
 * Main library update pipeline:
 * detect active app, find the library container, fetch backend data, then render.
 */
async function updateLibraryPanel(doc: Document, reasonFromCaller: string) {
  if (!getSettings().showInLibrary) {
    lastAppId = null;
    processingAppId = null;
    removeLibraryPanel(doc);
    return;
  }

  const detection = getLibraryAppId();

  if (detection.appId === null) {
    lastAppId = null;
    removeLibraryPanel(doc);
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

  const existing = doc.getElementById(LIBRARY_PANEL_ID);
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

  renderLibraryLoading(doc);

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

    const response = parseCompletionCompanionResponse(String(raw)) as CompletionCompanionResponse;

    renderLibraryResponse(doc, container, response);
  } catch (error) {
    warn('backend call failed', error);
    renderLibraryError(doc, container, appId, detection.reason, stringifyUnknownError(error));
  } finally {
    if (processingAppId === appId) {
      processingAppId = null;
    }
  }
}

/**
 * Debounces library page updates because Steam mutates the library DOM frequently.
 */
function scheduleLibraryUpdate(doc: Document, reason: string) {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    updateLibraryPanel(doc, reason);
  }, 250);
}

/**
 * Stops active observers and timers for the current Steam library window.
 */
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

  observer = null;
  refreshTimer = null;
  libraryIntervalId = null;
  unsubscribeSettings = null;
  lastAppId = null;
  processingAppId = null;
}

/**
 * Removes panel DOM without touching observers.
 */
export function cleanupLibraryPanel(doc: Document) {
  removeLibraryPanel(doc);
}

/**
 * Attaches DOM, focus, click, interval, and settings listeners for one Steam library window.
 */
export function setupLibraryObserver(doc: Document) {
  disconnectLibraryObserver();

  currentDocument = doc;

  unsubscribeSettings = subscribeSettings((settings: { showInLibrary: boolean }) => {
    if (!settings.showInLibrary) {
      removeLibraryPanel(doc);
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