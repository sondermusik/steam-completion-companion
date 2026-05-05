import { getSteamHuntersIconFontCss } from '../../shared/steamCompletionCompanionCore';
import { applyLibraryPanelPosition } from './libraryPosition';

export const LIBRARY_PANEL_ID = 'scc-companion-library-panel';

const LIBRARY_STYLE_ID = 'scc-companion-library-style';

export function removeLibraryPanel(doc: Document) {
    const existing = doc.getElementById(LIBRARY_PANEL_ID);

    if (existing) {
        existing.remove();
    }
}

export function ensureLibraryPanelStyle(doc: Document) {
    if (doc.getElementById(LIBRARY_STYLE_ID)) {
        return;
    }

    const style = doc.createElement('style');
    style.id = LIBRARY_STYLE_ID;
    style.textContent = `
    #${LIBRARY_PANEL_ID} {
      position: absolute;
      right: auto;
      top: auto;
      bottom: auto;
      left: auto;
      z-index: 9999;
      width: 330px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 7px 14px;
      border-radius: 9px;
      color: var(--scc-text, #ffffff);
      background: var(--scc-panel-bg, rgba(14, 20, 27, 0.85));
      border: 0;
      box-shadow: var(--scc-shadow, 0 10px 28px rgba(0, 0, 0, 0.48), -10px 14px 24px rgba(0, 0, 0, 0.34));
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);

      --scc-accent: #00aeef;
      --scc-text: #ffffff;
      --scc-muted: rgba(255, 255, 255, 0.78);
      --scc-panel-bg: rgba(14, 20, 27, 0.85);
      --scc-row-border: rgba(255, 255, 255, 0.105);
      --scc-shadow: 0 10px 28px rgba(0, 0, 0, 0.48), -10px 14px 24px rgba(0, 0, 0, 0.34);
      --scc-yellow: #ffcc66;
      --scc-orange: #f39c12;
      --scc-red: #ff6b6b;
      --scc-row-height: 24px;
    }

    #${LIBRARY_PANEL_ID} * {
      box-sizing: border-box;
    }

    #${LIBRARY_PANEL_ID} .scc-row,
    #${LIBRARY_PANEL_ID} .scc-footer {
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
      border-top: 1px solid var(--scc-row-border);
    }

    #${LIBRARY_PANEL_ID} .scc-row:first-child {
      border-top: 0;
    }

    #${LIBRARY_PANEL_ID} .scc-footer {
      grid-template-columns: minmax(0, 1fr);
      justify-items: end;
      justify-content: stretch;
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      margin: 0;
      padding: 0;
      transform: none;
    }

    #${LIBRARY_PANEL_ID} .scc-footer .scc-link {
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      display: inline-flex;
      align-items: center;
      transform: translateY(3px);
    }

    #${LIBRARY_PANEL_ID} .scc-label,
    #${LIBRARY_PANEL_ID} .scc-value,
    #${LIBRARY_PANEL_ID} .scc-link {
      height: var(--scc-row-height);
      min-height: var(--scc-row-height);
      max-height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
    }

    #${LIBRARY_PANEL_ID} .scc-label {
      color: var(--scc-muted);
      min-width: 0;
      overflow: hidden;
      font-weight: 500;
    }

    #${LIBRARY_PANEL_ID} .scc-label-wrap {
      display: grid;
      grid-template-columns: 14px minmax(0, auto);
      align-items: center;
      column-gap: 7px;
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
    }

    #${LIBRARY_PANEL_ID} .scc-label-wrap span:last-child {
      min-width: 0;
      height: var(--scc-row-height);
      line-height: var(--scc-row-height);
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon {
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

    #${LIBRARY_PANEL_ID} .scc-row-icon svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
      stroke: currentColor;
      flex: 0 0 auto;
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon-restricted svg {
      width: 12px;
      height: 12px;
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon-normal,
    #${LIBRARY_PANEL_ID} .scc-row-icon-muted {
      color: var(--scc-muted);
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon-yellow {
      color: var(--scc-yellow);
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon-orange {
      color: var(--scc-orange);
    }

    #${LIBRARY_PANEL_ID} .scc-row-icon-red {
      color: var(--scc-red);
    }

    #${LIBRARY_PANEL_ID} .scc-value {
      color: var(--scc-text);
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      justify-content: flex-end;
    }

    #${LIBRARY_PANEL_ID} .scc-value-yellow {
      color: var(--scc-yellow);
    }

    #${LIBRARY_PANEL_ID} .scc-value-orange {
      color: var(--scc-orange);
    }

    #${LIBRARY_PANEL_ID} .scc-value-red {
      color: var(--scc-red);
    }

    #${LIBRARY_PANEL_ID} .scc-error {
      color: #ffb4b4;
    }

    #${LIBRARY_PANEL_ID} .scc-link,
    #${LIBRARY_PANEL_ID} .scc-link:visited {
      gap: 5px;
      color: var(--scc-accent);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      opacity: 1;
    }

    #${LIBRARY_PANEL_ID} .scc-link:hover {
      color: #ffffff;
      opacity: 1;
      text-decoration: none;
    }

    #${LIBRARY_PANEL_ID} .scc-link-icon,
    #${LIBRARY_PANEL_ID} .scc-link-icon-fallback {
      width: 14px;
      height: 14px;
      min-width: 14px;
      max-width: 14px;
      min-height: 14px;
      max-height: 14px;
      flex: 0 0 14px;
      border-radius: 3px;
    }

    #${LIBRARY_PANEL_ID} .scc-link-icon {
      display: block;
    }

    #${LIBRARY_PANEL_ID} .scc-link-icon-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--scc-accent);
      color: #0b141d;
      font-size: 7px;
      font-weight: 800;
      line-height: 1;
    }

    #${LIBRARY_PANEL_ID} .scc-link-icon-fallback-hidden {
      display: none;
    }

    @media (max-width: 900px) {
      #${LIBRARY_PANEL_ID} {
        width: 310px;
      }
    }

    ${getSteamHuntersIconFontCss(`#${LIBRARY_PANEL_ID}`)}
  `;

    doc.head?.appendChild(style);
}

export function getOrCreateLibraryPanel(doc: Document, container: HTMLElement): HTMLElement {
    ensureLibraryPanelStyle(doc);

    const existing = doc.getElementById(LIBRARY_PANEL_ID);

    if (existing) {
        if (existing.parentElement !== container) {
            container.appendChild(existing);
        }

        container.style.position = 'relative';
        applyLibraryPanelPosition(existing);
        return existing;
    }

    const panel = doc.createElement('div');
    panel.id = LIBRARY_PANEL_ID;
    panel.setAttribute('data-scc-library-panel', '1');

    container.style.position = 'relative';
    container.appendChild(panel);

    applyLibraryPanelPosition(panel);
    return panel;
}