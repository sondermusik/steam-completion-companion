import React from 'react';
import {
  definePlugin,
  IconsModule,
  Millennium,
} from '@steambrew/client';

import { PLUGIN_TITLE } from '../shared/steamCompletionCompanionCore';
import {
  cleanupLibraryPanel,
  disconnectLibraryObserver,
  setupLibraryObserver,
} from './lib/libraryPanel';
import { initSettings } from './lib/settings';
import { SettingsContent } from './lib/settingsContent';

const NS = '[SCC_FRONTEND]';

/**
 * Plugin entry point.
 * Keeps registration and Steam window-hook setup separate from settings UI.
 */
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
    icon: React.createElement(IconsModule.Settings),
    content: React.createElement(SettingsContent),
  };
});