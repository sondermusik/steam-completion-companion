import React, { useEffect, useState } from 'react';
import {
  definePlugin,
  Field,
  IconsModule,
  Millennium,
} from '@steambrew/client';

import {
  PLUGIN_TITLE,
  SteamCompletionCompanionSettings,
} from '../shared/steamCompletionCompanionCore';
import {
  cleanupLibraryPanel,
  disconnectLibraryObserver,
  setupLibraryObserver,
} from './lib/libraryPanel';
import {
  getSettings,
  initSettings,
  saveSettings,
  subscribeSettings,
} from './lib/settings';

const NS = '[SCC_FRONTEND]';

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

function SettingsContent() {
  const [settings, setSettings] = useState<SteamCompletionCompanionSettings>(getSettings());

  useEffect(() => {
    initSettings();

    return subscribeSettings(setSettings);
  }, []);

  async function setShowInLibrary(showInLibrary: boolean) {
    const nextSettings = {
      ...settings,
      showInLibrary,
    };

    setSettings(nextSettings);

    try {
      await saveSettings(nextSettings);
    } catch (error) {
      console.warn(NS, 'failed to save setting', error);
    }
  }

  async function setShowOnStorePages(showOnStorePages: boolean) {
    const nextSettings = {
      ...settings,
      showOnStorePages,
    };

    setSettings(nextSettings);

    try {
      await saveSettings(nextSettings);
    } catch (error) {
      console.warn(NS, 'failed to save setting', error);
    }
  }

async function setVisibleContent(
  key: keyof SteamCompletionCompanionSettings['visibleContent'],
  value: boolean
) {
  const nextSettings = {
    ...settings,
    visibleContent: {
      ...settings.visibleContent,
      [key]: value,
    },
  };

  setSettings(nextSettings);

  try {
    await saveSettings(nextSettings);
  } catch (error) {
    console.warn(NS, 'failed to save setting', error);
  }
}

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('style', null, `
      .DialogToggleField_Control {
        width: 42px;
        height: 22px;
        border-radius: 999px;
        position: relative;
        cursor: pointer;
        background: rgba(255,255,255,0.22);
        transition: background 120ms ease;
      }

      .DialogToggleField_Control.On {
        background: linear-gradient(90deg, #06bfff 0%, #2d73ff 100%);
      }

      .DialogToggleField_Option {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #fff;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 120ms ease;
      }

      .DialogToggleField_Control.On .DialogToggleField_Option {
        transform: translateX(20px);
      }

      .scc-settings-header {
        margin: 16px 0 8px;
        padding: 0 0 6px 6px; /* shift right */
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .scc-settings-header-secondary {
        margin-top: 24px;
        margin-bottom: 4px;
        padding-bottom: 3px;
      }
    `),

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

export default definePlugin(() => {
  console.log(NS, 'plugin factory loaded');

  initSettings();

  const steamMillennium = Millennium as unknown as {
    AddWindowCreateHook?: (callback: (context: any) => void) => void;
  };

  let currentDocument: Document | null = null;

  steamMillennium.AddWindowCreateHook?.((context: any) => {
    const windowName = String(context?.m_strName || '');

    if (!windowName.startsWith('SP ')) {
      return;
    }

    const doc = context?.m_popup?.document as Document | undefined;

    if (!doc?.body) {
      return;
    }

    console.log(NS, 'Steam window hook fired', {
      windowName,
      docTitle: doc.title,
    });

    if (currentDocument && currentDocument !== doc) {
      cleanupLibraryPanel(currentDocument);
      disconnectLibraryObserver();
    }

    currentDocument = doc;
    setupLibraryObserver(doc);
  });

  return {
    title: PLUGIN_TITLE,
    icon: <IconsModule.Settings />,
    content: <SettingsContent />,
  };
});