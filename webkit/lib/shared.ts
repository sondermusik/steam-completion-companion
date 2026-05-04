export type IPCValue = string | number | boolean | null;
export type IPCParams = Record<string, IPCValue>;

export type ShcResponseItem = {
  label?: string;
  value?: string;
  kind?: string;
};

export type ShcResponse = {
  ok?: boolean;
  show_panel?: boolean;
  type?: string;
  has_app?: boolean;
  app_id?: number;
  page_kind?: string;
  title?: string;
  summary?: string;
  restricted_count?: number;
  steam_hunters_url?: string;
  items?: ShcResponseItem[];
  error?: string;
};

export function safeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function parseBackendResponse(raw: string): ShcResponse {
  try {
    return JSON.parse(raw) as ShcResponse;
  } catch {
    return {
      ok: false,
      type: 'parse_error',
      title: 'Steam Completion Companion',
      summary: 'Backend returned non JSON response.',
      restricted_count: 0,
      items: [],
      error: raw,
    };
  }
}

export function normalizeKind(item: ShcResponseItem): string {
  const kind = String(item.kind || '').toLowerCase();
  const label = String(item.label || '').toLowerCase();

  if (kind === 'paid_dlc' || label.includes('paid dlc')) return 'paid_dlc';
  if (kind === 'broken' || label.includes('broken but obtainable')) return 'broken';
  if (kind === 'conditional' || label.includes('conditionally obtainable')) return 'conditional';
  if (kind === 'unobtainable' || label.includes('unobtainable')) return 'unobtainable';
  if (kind === 'restricted' || label.includes('restricted')) return 'restricted';
  if (kind === 'players_perfected' || label.includes('players perfected')) return 'players_perfected';
  if (kind === 'median_completion' || label.includes('median completion')) return 'median_completion';
  if (kind === 'perfected_by_starters' || label.includes('perfected by starters')) return 'perfected_by_starters';
  if (kind === 'error' || label.includes('error')) return 'error';

  return 'info';
}