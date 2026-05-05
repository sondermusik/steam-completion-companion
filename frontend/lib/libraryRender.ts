import { getSettings } from './settings';
import {
  CompletionCompanionResponse,
  escapeHtml,
  getCompletionCompanionIconHtml,
  getCompletionCompanionValueClass,
  normalizeResponseItemKind,
  responseHasCompletionRows,
} from '../../shared/steamCompletionCompanionCore';
import { applyLibraryPanelPosition } from './libraryPosition';
import { getOrCreateLibraryPanel, removeLibraryPanel } from './libraryDom';

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

/**
 * Loading currently removes the panel so Steam page transitions stay clean.
 */
export function renderLibraryLoading(doc: Document) {
  removeLibraryPanel(doc);
}

/**
 * Renders SteamHunters completion data into the library panel.
 */
export function renderLibraryResponse(
  doc: Document,
  container: HTMLElement,
  response: CompletionCompanionResponse
) {
  if (response.show_panel === false || !responseHasCompletionRows(response)) {
    removeLibraryPanel(doc);
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
    removeLibraryPanel(doc);
    return;
  }

  const panel = getOrCreateLibraryPanel(doc, container);

  const steamHuntersUrl = response.steam_hunters_url
    ? escapeHtml(response.steam_hunters_url)
    : '';

  const footer =
    steamHuntersUrl && getSettings().visibleContent.steamHuntersLink
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
}

/**
 * Shows a compact diagnostic row when the backend request fails.
 */
export function renderLibraryError(
  doc: Document,
  container: HTMLElement,
  appId: number,
  reason: string,
  message: string
) {
  const panel = getOrCreateLibraryPanel(doc, container);

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