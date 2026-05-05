import React, { useEffect, useState } from 'react';
import { Field } from '@steambrew/client';

import { SteamCompletionCompanionSettings } from '../../shared/steamCompletionCompanionCore';
import {
  getSettings,
  initSettings,
  saveSettings,
  subscribeSettings,
} from './settings';
import { SETTINGS_CSS } from './settingsStyles';

const NS = '[SCC_SETTINGS]';

const LIBRARY_POSITION_OPTIONS = [
  { value: 'bottomRight', label: 'Bottom Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'topLeft', label: 'Top Left' },
];

function SettingsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return React.createElement(
    'div',
    {
      className: `DialogToggleField_Control Panel Focusable ${checked ? 'On' : ''}`,
      role: 'switch',
      'aria-checked': checked,
      tabIndex: 0,
      onClick: () => onChange(!checked),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(!checked);
        }
      },
    },
    React.createElement('div', {
      className: 'DialogToggleField_Option',
    })
  );
}

function SettingsHeader({
  title,
  secondary = false,
}: {
  title: string;
  secondary?: boolean;
}) {
  return React.createElement(
    'div',
    {
      className: `scc-settings-header ${secondary ? 'scc-settings-header-secondary' : ''}`,
    },
    title
  );
}

/**
 * Plugin settings UI.
 * Uses local state for native select/input controls so values update immediately
 * inside Steam's settings window while still persisting to settings.json.
 */
export function SettingsContent() {
  const [settings, setSettings] = useState<SteamCompletionCompanionSettings>(getSettings());

  const [libraryPanelPosition, setLibraryPanelPositionState] = useState<
    SteamCompletionCompanionSettings['libraryPanelPosition']
  >(getSettings().libraryPanelPosition);

  const [libraryPanelHorizontalOffset, setLibraryPanelHorizontalOffsetState] = useState(
    String(getSettings().libraryPanelHorizontalOffset)
  );

  const [libraryPanelVerticalOffset, setLibraryPanelVerticalOffsetState] = useState(
    String(getSettings().libraryPanelVerticalOffset)
  );

  useEffect(() => {
    initSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      setLibraryPanelPositionState(loadedSettings.libraryPanelPosition);
      setLibraryPanelHorizontalOffsetState(String(loadedSettings.libraryPanelHorizontalOffset));
      setLibraryPanelVerticalOffsetState(String(loadedSettings.libraryPanelVerticalOffset));
    });

    return subscribeSettings((nextSettings) => {
      setSettings(nextSettings);
    });
  }, []);

  async function saveNextSettings(nextSettings: SteamCompletionCompanionSettings) {
    setSettings(nextSettings);

    try {
      await saveSettings(nextSettings);
    } catch (error) {
      console.warn(NS, 'failed to save setting', error);
    }
  }

  async function setShowInLibrary(showInLibrary: boolean) {
    await saveNextSettings({
      ...settings,
      showInLibrary,
    });
  }

  async function setShowOnStorePages(showOnStorePages: boolean) {
    await saveNextSettings({
      ...settings,
      showOnStorePages,
    });
  }

  async function onLibraryPanelPositionChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value as SteamCompletionCompanionSettings['libraryPanelPosition'];

    setLibraryPanelPositionState(value);

    try {
      await saveSettings({
        ...getSettings(),
        libraryPanelPosition: value,
      });
    } catch (error) {
      console.warn(NS, 'failed to save setting', error);
    }
  }

  async function onLibraryPanelHorizontalOffsetChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const parsed = Number.parseInt(value, 10);

    setLibraryPanelHorizontalOffsetState(value);

    if (!Number.isNaN(parsed)) {
      try {
        await saveSettings({
          ...getSettings(),
          libraryPanelHorizontalOffset: parsed,
        });
      } catch (error) {
        console.warn(NS, 'failed to save setting', error);
      }
    }
  }

  async function onLibraryPanelVerticalOffsetChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const parsed = Number.parseInt(value, 10);

    setLibraryPanelVerticalOffsetState(value);

    if (!Number.isNaN(parsed)) {
      try {
        await saveSettings({
          ...getSettings(),
          libraryPanelVerticalOffset: parsed,
        });
      } catch (error) {
        console.warn(NS, 'failed to save setting', error);
      }
    }
  }

  async function setVisibleContent(
    key: keyof SteamCompletionCompanionSettings['visibleContent'],
    value: boolean
  ) {
    await saveNextSettings({
      ...settings,
      visibleContent: {
        ...settings.visibleContent,
        [key]: value,
      },
    });
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('style', null, SETTINGS_CSS),

    React.createElement(SettingsHeader, {
      title: 'Panel Visibility',
    }),

    React.createElement(
      Field,
      {
        label: 'Show in Library',
        description: 'Show Steam Completion Companion on Steam library app pages.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.showInLibrary,
        onChange: setShowInLibrary,
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Show on Store Pages',
        description: 'Show Steam Completion Companion on Steam store app pages.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.showOnStorePages,
        onChange: setShowOnStorePages,
      })
    ),

    React.createElement(SettingsHeader, {
      title: 'Library Position',
      secondary: true,
    }),

    React.createElement(
      Field,
      {
        label: 'Panel Position',
        description: 'Choose where the library panel is anchored.',
        bottomSeparator: 'standard',
      },
      React.createElement(
        'select',
        {
          className: 'scc-settings-select',
          value: libraryPanelPosition,
          onChange: onLibraryPanelPositionChange,
        },
        LIBRARY_POSITION_OPTIONS.map((option) =>
          React.createElement(
            'option',
            {
              key: option.value,
              value: option.value,
            },
            option.label
          )
        )
      )
    ),

    React.createElement(
      Field,
      {
        label: 'Horizontal Offset',
        description: 'Additional horizontal offset in pixels.',
        bottomSeparator: 'standard',
      },
      React.createElement('input', {
        className: 'scc-settings-input',
        type: 'number',
        value: libraryPanelHorizontalOffset,
        onChange: onLibraryPanelHorizontalOffsetChange,
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Vertical Offset',
        description: 'Additional vertical offset in pixels.',
        bottomSeparator: 'standard',
      },
      React.createElement('input', {
        className: 'scc-settings-input',
        type: 'number',
        value: libraryPanelVerticalOffset,
        onChange: onLibraryPanelVerticalOffsetChange,
      })
    ),

    React.createElement(SettingsHeader, {
      title: 'Displayed Content',
      secondary: true,
    }),

    React.createElement(
      Field,
      {
        label: 'Median Completion',
        description: 'Show the median SteamHunters completion time.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.medianCompletion,
        onChange: (value: boolean) => setVisibleContent('medianCompletion', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Players Perfected',
        description: 'Show how many SteamHunters players perfected the game.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.playersPerfected,
        onChange: (value: boolean) => setVisibleContent('playersPerfected', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Perfected by Starters',
        description: 'Show the percentage of starters who perfected the game.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.perfectedByStarters,
        onChange: (value: boolean) => setVisibleContent('perfectedByStarters', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Paid DLC',
        description: 'Show whether the game has paid DLC.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.paidDlc,
        onChange: (value: boolean) => setVisibleContent('paidDlc', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Restricted',
        description: 'Show whether the game is restricted on SteamHunters.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.restricted,
        onChange: (value: boolean) => setVisibleContent('restricted', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Broken but Obtainable',
        description: 'Show broken but still obtainable achievement count.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.broken,
        onChange: (value: boolean) => setVisibleContent('broken', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Conditionally Obtainable',
        description: 'Show conditionally obtainable achievement count.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.conditional,
        onChange: (value: boolean) => setVisibleContent('conditional', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'Unobtainable',
        description: 'Show unobtainable achievement count.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.unobtainable,
        onChange: (value: boolean) => setVisibleContent('unobtainable', value),
      })
    ),

    React.createElement(
      Field,
      {
        label: 'SteamHunters Link',
        description: 'Show the “View on SteamHunters” footer link.',
        bottomSeparator: 'standard',
      },
      React.createElement(SettingsToggle, {
        checked: settings.visibleContent.steamHuntersLink,
        onChange: (value: boolean) => setVisibleContent('steamHuntersLink', value),
      })
    )
  );
}