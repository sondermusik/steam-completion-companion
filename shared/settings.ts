export type SteamCompletionCompanionLibraryPanelPosition =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

export type SteamCompletionCompanionVisibleContentSettings = {
  medianCompletion: boolean;
  playersPerfected: boolean;
  perfectedByStarters: boolean;
  paidDlc: boolean;
  restricted: boolean;
  broken: boolean;
  conditional: boolean;
  unobtainable: boolean;
  steamHuntersLink: boolean;
};

export type SteamCompletionCompanionSettings = {
  showInLibrary: boolean;
  showOnStorePages: boolean;
  libraryPanelPosition: SteamCompletionCompanionLibraryPanelPosition;
  libraryPanelHorizontalOffset: number;
  libraryPanelVerticalOffset: number;
  visibleContent: SteamCompletionCompanionVisibleContentSettings;
};

export const DEFAULT_SETTINGS: SteamCompletionCompanionSettings = {
  showInLibrary: true,
  showOnStorePages: true,
  libraryPanelPosition: 'bottomRight',
  libraryPanelHorizontalOffset: 0,
  libraryPanelVerticalOffset: 0,
  visibleContent: {
    medianCompletion: true,
    playersPerfected: true,
    perfectedByStarters: true,
    paidDlc: true,
    restricted: true,
    broken: true,
    conditional: true,
    unobtainable: true,
    steamHuntersLink: true,
  },
};