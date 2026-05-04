import { useEffect, useState } from 'react';
import {
  definePlugin,
  Field,
  DialogButton,
  callable,
  IconsModule,
  Millennium,
} from '@steambrew/client';

import { IPCParams, stringifyError } from './lib/shared';
import {
  cleanupLibraryPanel,
  disconnectLibraryObserver,
  setupLibraryObserver,
} from './lib/libraryPanel';

const NS = '[SHC_FRONTEND]';

const shcJsonBridge = callable<[params: IPCParams], string>('shc_json_bridge');

async function callBackendFromSettings(): Promise<string> {
  const payload = {
    type: 'settings_probe',
    source: 'plugin_settings',
    page_kind: 'settings',
    app_id: 0,
    href: String(window.location.href || ''),
    time: new Date().toISOString(),
  };

  try {
    const result = await shcJsonBridge({
      payload_json: JSON.stringify(payload),
    });

    return String(result);
  } catch (err) {
    return `FAILED:${stringifyError(err)}`;
  }
}

function ProbeContent() {
  const [status, setStatus] = useState<string>('not tested yet');

  async function runProbe() {
    setStatus('calling backend...');

    const result = await callBackendFromSettings();

    setStatus(result);
  }

  useEffect(() => {
    console.log(NS, 'settings React content mounted');
    runProbe();
  }, []);

  return (
    <Field
      label="SteamHunters Companion Probe"
      description={status}
      bottomSeparator="standard"
    >
      <DialogButton onClick={runProbe}>
        Run Backend Probe
      </DialogButton>
    </Field>
  );
}

export default definePlugin(() => {
  console.log(NS, 'plugin factory loaded');

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
    title: 'Steam Completion Companion',
    icon: <IconsModule.Settings />,
    content: <ProbeContent />,
  };
});