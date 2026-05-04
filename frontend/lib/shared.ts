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

export type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
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

export function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function parseAppId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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

export function parseRgb(value: string): Rgba | null {
  const match = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);

  if (!match) {
    return null;
  }

  return {
    r: Math.max(0, Math.min(255, Number(match[1]))),
    g: Math.max(0, Math.min(255, Number(match[2]))),
    b: Math.max(0, Math.min(255, Number(match[3]))),
    a: match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4]))),
  };
}

export function rgbaString(color: Rgba, alpha?: number): string {
  const a = alpha === undefined ? color.a : alpha;

  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.max(
    0,
    Math.min(1, a)
  )})`;
}

export function mixRgb(a: Rgba, b: Rgba, amount: number, alpha = 1): string {
  const t = Math.max(0, Math.min(1, amount));

  return rgbaString(
    {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: alpha,
    },
    alpha
  );
}

export function colorLooksUseful(value: string): boolean {
  const color = value.trim().toLowerCase();

  if (!color || color === 'transparent') {
    return false;
  }

  if (color === 'rgba(0, 0, 0, 0)' || color === 'rgba(0,0,0,0)') {
    return false;
  }

  const rgb = parseRgb(color);

  if (rgb && rgb.a <= 0.03) {
    return false;
  }

  return color.startsWith('rgb') || color.startsWith('#');
}

export function isTooGenericDark(value: string): boolean {
  const rgb = parseRgb(value);

  if (!rgb) {
    return false;
  }

  return rgb.r < 18 && rgb.g < 22 && rgb.b < 28;
}

export function getUsefulStyleColor(
  style: CSSStyleDeclaration | null,
  properties: string[]
): string | null {
  if (!style) {
    return null;
  }

  for (const property of properties) {
    const value = style.getPropertyValue(property).trim();

    if (colorLooksUseful(value)) {
      return value;
    }
  }

  return null;
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

export function responseHasAchievementRows(response: ShcResponse): boolean {
  if (!Array.isArray(response.items)) {
    return false;
  }

  return response.items.some((item) => {
    const kind = normalizeKind(item);

    return (
      kind === 'median_completion' ||
      kind === 'players_perfected' ||
      kind === 'perfected_by_starters' ||
      kind === 'broken' ||
      kind === 'conditional' ||
      kind === 'unobtainable' ||
      kind === 'restricted'
    );
  });
}