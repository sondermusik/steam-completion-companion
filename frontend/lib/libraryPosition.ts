import { getSettings } from './settings';

const BASE_LIBRARY_HORIZONTAL_OFFSET = 16;
const BASE_LIBRARY_VERTICAL_OFFSET = 16;

export function applyLibraryPanelPosition(panel: HTMLElement) {
  const settings = getSettings();

  const userHorizontalOffset = Number.isFinite(settings.libraryPanelHorizontalOffset)
    ? settings.libraryPanelHorizontalOffset
    : 0;

  const userVerticalOffset = Number.isFinite(settings.libraryPanelVerticalOffset)
    ? settings.libraryPanelVerticalOffset
    : 0;

  const horizontalOffset = BASE_LIBRARY_HORIZONTAL_OFFSET + userHorizontalOffset;
  const verticalOffset = BASE_LIBRARY_VERTICAL_OFFSET + userVerticalOffset;

  panel.style.left = 'auto';
  panel.style.right = 'auto';
  panel.style.top = 'auto';
  panel.style.bottom = 'auto';

  if (settings.libraryPanelPosition === 'topLeft') {
    panel.style.left = `${horizontalOffset}px`;
    panel.style.top = `${verticalOffset}px`;
    return;
  }

  if (settings.libraryPanelPosition === 'topRight') {
    panel.style.right = `${horizontalOffset}px`;
    panel.style.top = `${verticalOffset}px`;
    return;
  }

  if (settings.libraryPanelPosition === 'bottomLeft') {
    panel.style.left = `${horizontalOffset}px`;
    panel.style.bottom = `${verticalOffset}px`;
    return;
  }

  panel.style.right = `${horizontalOffset}px`;
  panel.style.bottom = `${verticalOffset}px`;
}