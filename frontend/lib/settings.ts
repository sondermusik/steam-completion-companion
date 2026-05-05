import { callable } from '@steambrew/client';
import {
    DEFAULT_SETTINGS,
    SteamCompletionCompanionSettings,
    stringifyUnknownError,
} from '../../shared/steamCompletionCompanionCore';

const getBackendSettings = callable<[], string>('GetSettings');
const saveBackendSettings = callable<[params: { settings_json: string }], string>('SaveSettings');

let cachedSettings: SteamCompletionCompanionSettings = { ...DEFAULT_SETTINGS };

const subscribers = new Set<(settings: SteamCompletionCompanionSettings) => void>();

function normalizeSettings(value: unknown): SteamCompletionCompanionSettings {
    const raw = value as Partial<SteamCompletionCompanionSettings> | null;
    const rawVisible =
        (raw?.visibleContent || {}) as Partial<SteamCompletionCompanionSettings['visibleContent']>;

    return {
        ...DEFAULT_SETTINGS,
        showInLibrary:
            typeof raw?.showInLibrary === 'boolean'
                ? raw.showInLibrary
                : DEFAULT_SETTINGS.showInLibrary,
        showOnStorePages:
            typeof raw?.showOnStorePages === 'boolean'
                ? raw.showOnStorePages
                : DEFAULT_SETTINGS.showOnStorePages,

        libraryPanelPosition:
            raw?.libraryPanelPosition === 'topLeft' ||
                raw?.libraryPanelPosition === 'topRight' ||
                raw?.libraryPanelPosition === 'bottomLeft' ||
                raw?.libraryPanelPosition === 'bottomRight'
                ? raw.libraryPanelPosition
                : DEFAULT_SETTINGS.libraryPanelPosition,

        libraryPanelHorizontalOffset:
            typeof raw?.libraryPanelHorizontalOffset === 'number'
                ? raw.libraryPanelHorizontalOffset
                : DEFAULT_SETTINGS.libraryPanelHorizontalOffset,

        libraryPanelVerticalOffset:
            typeof raw?.libraryPanelVerticalOffset === 'number'
                ? raw.libraryPanelVerticalOffset
                : DEFAULT_SETTINGS.libraryPanelVerticalOffset,

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

function emitSettings() {
    for (const subscriber of subscribers) {
        subscriber(cachedSettings);
    }
}

export function getSettings(): SteamCompletionCompanionSettings {
    return cachedSettings;
}

export async function initSettings(): Promise<SteamCompletionCompanionSettings> {
    try {
        const raw = await getBackendSettings();
        const parsed = JSON.parse(String(raw));

        cachedSettings = normalizeSettings(parsed.settings);
        emitSettings();

        return cachedSettings;
    } catch (error) {
        console.warn('[SCC_SETTINGS]', 'initSettings failed', stringifyUnknownError(error));

        cachedSettings = { ...DEFAULT_SETTINGS };
        emitSettings();

        return cachedSettings;
    }
}

export async function saveSettings(
    nextSettings: SteamCompletionCompanionSettings
): Promise<SteamCompletionCompanionSettings> {
    cachedSettings = normalizeSettings(nextSettings);
    emitSettings();

    const raw = await saveBackendSettings({
        settings_json: JSON.stringify(cachedSettings),
    });
const parsed = JSON.parse(String(raw));

if (parsed.ok !== true) {
  throw new Error(String(parsed.error || 'SaveSettings failed'));
}

cachedSettings = normalizeSettings(parsed.settings);
emitSettings();

return cachedSettings;
}

export function subscribeSettings(
    callback: (settings: SteamCompletionCompanionSettings) => void
): () => void {
    subscribers.add(callback);

    return () => {
        subscribers.delete(callback);
    };
}