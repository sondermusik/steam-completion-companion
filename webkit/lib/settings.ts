// @ts-nocheck

import { callable } from '@steambrew/webkit';
import {
  DEFAULT_SETTINGS,
} from '../../shared/steamCompletionCompanionCore';

const getBackendSettings = callable('GetSettings');

let cachedSettings = { ...DEFAULT_SETTINGS };

function normalizeSettings(value) {
  const raw = value || {};
  const rawVisible = raw.visibleContent || {};

  return {
    ...DEFAULT_SETTINGS,
    showInLibrary:
      typeof raw.showInLibrary === 'boolean'
        ? raw.showInLibrary
        : DEFAULT_SETTINGS.showInLibrary,
    showOnStorePages:
      typeof raw.showOnStorePages === 'boolean'
        ? raw.showOnStorePages
        : DEFAULT_SETTINGS.showOnStorePages,
    visibleContent: {
      ...DEFAULT_SETTINGS.visibleContent,
      medianCompletion:
        typeof rawVisible.medianCompletion === 'boolean'
          ? rawVisible.medianCompletion
          : DEFAULT_SETTINGS.visibleContent.medianCompletion,
      playersPerfected:
        typeof rawVisible.playersPerfected === 'boolean'
          ? rawVisible.playersPerfected
          : DEFAULT_SETTINGS.visibleContent.playersPerfected,
      perfectedByStarters:
        typeof rawVisible.perfectedByStarters === 'boolean'
          ? rawVisible.perfectedByStarters
          : DEFAULT_SETTINGS.visibleContent.perfectedByStarters,
      paidDlc:
        typeof rawVisible.paidDlc === 'boolean'
          ? rawVisible.paidDlc
          : DEFAULT_SETTINGS.visibleContent.paidDlc,
      restricted:
        typeof rawVisible.restricted === 'boolean'
          ? rawVisible.restricted
          : DEFAULT_SETTINGS.visibleContent.restricted,
      broken:
        typeof rawVisible.broken === 'boolean'
          ? rawVisible.broken
          : DEFAULT_SETTINGS.visibleContent.broken,
      conditional:
        typeof rawVisible.conditional === 'boolean'
          ? rawVisible.conditional
          : DEFAULT_SETTINGS.visibleContent.conditional,
      unobtainable:
        typeof rawVisible.unobtainable === 'boolean'
          ? rawVisible.unobtainable
          : DEFAULT_SETTINGS.visibleContent.unobtainable,
      steamHuntersLink:
        typeof rawVisible.steamHuntersLink === 'boolean'
          ? rawVisible.steamHuntersLink
          : DEFAULT_SETTINGS.visibleContent.steamHuntersLink,
    },
  };
}

export function getSettings() {
  return cachedSettings;
}

export async function initSettings() {
  try {
    const raw = await getBackendSettings();
    const parsed = JSON.parse(String(raw));

    cachedSettings = normalizeSettings(parsed.settings);
    return cachedSettings;
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
    return cachedSettings;
  }
}