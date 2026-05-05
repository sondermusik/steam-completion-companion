// @ts-nocheck

import { findStoreInsertionParentAndReference } from './storeDetection';

export const STORE_PANEL_ID = 'scc-store-panel';

const STORE_STYLE_ID = 'scc-store-style';

/**
 * Removes the injected Steam Store panel.
 */
export function removeStorePanel() {
  const existing = document.getElementById(STORE_PANEL_ID);

  if (existing) {
    existing.remove();
  }
}

/**
 * Injects the Store panel CSS once.
 */
export function ensureStoreStyle() {
  if (document.getElementById(STORE_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STORE_STYLE_ID;
  style.textContent = `
    #${STORE_PANEL_ID} {
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

    #${STORE_PANEL_ID} * {
      box-sizing: border-box;
    }

    #${STORE_PANEL_ID} .scc-card {
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

    #${STORE_PANEL_ID} .scc-row,
    #${STORE_PANEL_ID} .scc-footer {
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

    #${STORE_PANEL_ID} .scc-row:first-child {
      border-top: 0;
    }

    #${STORE_PANEL_ID} .scc-footer {
      grid-template-columns: minmax(0, 1fr);
      justify-items: end;
      justify-content: stretch;
    }

    #${STORE_PANEL_ID} .scc-label,
    #${STORE_PANEL_ID} .scc-value,
    #${STORE_PANEL_ID} .scc-link {
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
    }

    #${STORE_PANEL_ID} .scc-label {
      color: var(--scc-muted);
      min-width: 0;
      overflow: hidden;
      font-weight: 500;
    }

    #${STORE_PANEL_ID} .scc-label-wrap {
      display: grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 6px;
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
    }

    #${STORE_PANEL_ID} .scc-label-wrap span:last-child {
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    #${STORE_PANEL_ID} .scc-row-icon {
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

    #${STORE_PANEL_ID} .scc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
      flex: 0 0 auto;
    }

    #${STORE_PANEL_ID} .scc-row-icon-restricted svg {
      width: 12px;
      height: 12px;
    }

    #${STORE_PANEL_ID} .scc-row-icon-normal,
    #${STORE_PANEL_ID} .scc-row-icon-muted {
      color: var(--scc-muted);
    }

    #${STORE_PANEL_ID} .scc-row-icon-yellow {
      color: var(--scc-yellow);
    }

    #${STORE_PANEL_ID} .scc-row-icon-orange {
      color: var(--scc-orange);
    }

    #${STORE_PANEL_ID} .scc-row-icon-red {
      color: var(--scc-red);
    }

    #${STORE_PANEL_ID} .scc-value {
      color: var(--scc-text);
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      justify-content: flex-end;
    }

    #${STORE_PANEL_ID} .scc-value-yellow {
      color: var(--scc-yellow);
    }

    #${STORE_PANEL_ID} .scc-value-orange {
      color: var(--scc-orange);
    }

    #${STORE_PANEL_ID} .scc-value-red {
      color: var(--scc-red);
    }

    #${STORE_PANEL_ID} .scc-error {
      color: #ffb4b4;
    }

    #${STORE_PANEL_ID} .scc-link,
    #${STORE_PANEL_ID} .scc-link:visited {
      gap: 5px;
      color: var(--scc-accent);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      opacity: 1;
    }

    #${STORE_PANEL_ID} .scc-footer .scc-link,
    #${STORE_PANEL_ID} .scc-footer .scc-link:visited {
      position: relative;
      top: 3px;
    }

    #${STORE_PANEL_ID} .scc-link:hover {
      color: #ffffff;
      opacity: 1;
      text-decoration: none;
    }

    #${STORE_PANEL_ID} .scc-link-icon,
    #${STORE_PANEL_ID} .scc-link-icon-fallback {
      width: 14px;
      height: 14px;
      min-width: 14px;
      max-width: 14px;
      min-height: 14px;
      max-height: 14px;
      flex: 0 0 14px;
      border-radius: 3px;
    }

    #${STORE_PANEL_ID} .scc-link-icon {
      display: block;
    }

    #${STORE_PANEL_ID} .scc-link-icon-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--scc-accent);
      color: #0b141d;
      font-size: 7px;
      font-weight: 800;
      line-height: 1;
    }

    #${STORE_PANEL_ID} .scc-link-icon-fallback-hidden {
      display: none;
    }
  `;

  document.documentElement.appendChild(style);
}

/**
 * Returns the existing panel or creates it before the Store metadata block.
 */
export function getOrCreateStorePanel() {
  ensureStoreStyle();

  const placement = findStoreInsertionParentAndReference();

  if (!placement) {
    return null;
  }

  const existing = document.getElementById(STORE_PANEL_ID);

  if (existing) {
    if (existing.parentElement !== placement.parent) {
      placement.parent.insertBefore(existing, placement.reference);
    } else if (existing.nextElementSibling !== placement.reference) {
      placement.parent.insertBefore(existing, placement.reference);
    }

    return existing;
  }

  const panel = document.createElement('div');
  panel.id = STORE_PANEL_ID;
  panel.setAttribute('data-scc-store-panel', '1');

  placement.parent.insertBefore(panel, placement.reference);

  return panel;
}