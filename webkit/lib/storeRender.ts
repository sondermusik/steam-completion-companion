// @ts-nocheck

import { getSettings } from './settings';
import {
  escapeHtml,
  getCompletionCompanionIconHtml,
  getCompletionCompanionValueClass,
  normalizeResponseItemKind,
} from '../../shared/steamCompletionCompanionCore';
import { getOrCreateStorePanel, removeStorePanel } from './storeDom';

function shouldShowRowKind(kind) {
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
 * Renders SteamHunters data into the Steam Store sidebar panel.
 */
export function renderStoreResponse(response) {
  if (response.show_panel === false) {
    removeStorePanel();
    return;
  }

  const rows = [];

  if (Array.isArray(response.items)) {
    for (const item of response.items) {
      const rowKind = normalizeResponseItemKind(item);

      if (rowKind === 'info') {
        continue;
      }

      if (!shouldShowRowKind(rowKind)) {
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
    removeStorePanel();
    return;
  }

  const panel = getOrCreateStorePanel();

  if (!panel) {
    return false;
  }

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
    <div class="scc-card">
      ${rows.join('')}
      ${footer}
    </div>
  `;

  return true;
}

/**
 * Shows a compact backend error inside the Store panel.
 */
export function renderStoreError(message) {
  const panel = getOrCreateStorePanel();

  if (!panel) {
    return;
  }

  panel.innerHTML = `
    <div class="scc-card">
      <div class="scc-error">${escapeHtml(message)}</div>
    </div>
  `;
}