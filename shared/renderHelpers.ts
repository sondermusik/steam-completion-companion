import { CSS_PREFIX, PLUGIN_TITLE } from './core';
import {
  CompletionCompanionResponse,
  CompletionCompanionResponseItem,
  IconHtmlResult,
} from './core';

export function escapeHtml(value: unknown): string {
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

export function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function parseCompletionCompanionResponse(raw: string): CompletionCompanionResponse {
  try {
    return JSON.parse(raw) as CompletionCompanionResponse;
  } catch {
    return {
      ok: false,
      type: 'parse_error',
      title: PLUGIN_TITLE,
      summary: 'Backend returned non JSON response.',
      restricted_count: 0,
      items: [],
      error: raw,
    };
  }
}

export function normalizeResponseItemKind(item: CompletionCompanionResponseItem): string {
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

export function responseHasCompletionRows(response: CompletionCompanionResponse): boolean {
  if (!Array.isArray(response.items)) {
    return false;
  }

  return response.items.some((item) => {
    const kind = normalizeResponseItemKind(item);

    return (
      kind === 'median_completion' ||
      kind === 'players_perfected' ||
      kind === 'perfected_by_starters' ||
      kind === 'broken' ||
      kind === 'conditional' ||
      kind === 'unobtainable' ||
      kind === 'restricted' ||
      kind === 'paid_dlc'
    );
  });
}

export function getSteamHuntersIconFontCss(_scopeSelector: string): string {
  return '';
}

export function getCompletionCompanionIconSvg(kind: string): string {
  if (kind === 'restricted') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Z"/>
      </svg>
    `;
  }

  if (kind === 'dlc') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18.5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2Zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2ZM6.2 6l.7 3h9.7c.8 0 1.5.7 1.5 1.5 0 .2 0 .4-.1.6l-1.3 3.8c-.2.6-.8 1.1-1.4 1.1H8.1c-.7 0-1.3-.5-1.5-1.2L4.4 4.5H2V3h3.6l.7 3Z"/>
      </svg>
    `;
  }

  if (kind === 'broken') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M11 10h2v7h-2z" stroke="none"/>
        <circle cx="12" cy="7" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'conditional') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 22 20H2L12 3Z" fill="none" stroke-width="2" stroke-linejoin="round"/>
        <path d="M11 9h2v5h-2z" stroke="none"/>
        <circle cx="12" cy="17" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'unobtainable') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M11 6h2v8h-2z" stroke="none"/>
        <circle cx="12" cy="17.5" r="1.2" stroke="none"/>
      </svg>
    `;
  }

  if (kind === 'star') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.8-4.6 6.6-1L12 2.5Z"/>
      </svg>
    `;
  }

  if (kind === 'clock') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
        <path d="M12 7v5l3.2 2" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  if (kind === 'percent') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18 18 6" fill="none" stroke-width="2" stroke-linecap="round"/>
        <circle cx="7.5" cy="7.5" r="2.2" fill="none" stroke-width="2"/>
        <circle cx="16.5" cy="16.5" r="2.2" fill="none" stroke-width="2"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/>
      <path d="M11 10h2v7h-2z" stroke="none"/>
      <circle cx="12" cy="7" r="1.2" stroke="none"/>
    </svg>
  `;
}

export function getCompletionCompanionIconHtml(rowKind: string): IconHtmlResult {
  if (rowKind === 'restricted') {
    return {
      html: getCompletionCompanionIconSvg('restricted'),
      className: `${CSS_PREFIX}-row-icon-yellow ${CSS_PREFIX}-row-icon-restricted`,
    };
  }

  if (rowKind === 'paid_dlc') {
    return { html: getCompletionCompanionIconSvg('dlc'), className: `${CSS_PREFIX}-row-icon-yellow` };
  }

  if (rowKind === 'broken') {
    return { html: getCompletionCompanionIconSvg('broken'), className: `${CSS_PREFIX}-row-icon-yellow` };
  }

  if (rowKind === 'conditional') {
    return { html: getCompletionCompanionIconSvg('conditional'), className: `${CSS_PREFIX}-row-icon-orange` };
  }

  if (rowKind === 'unobtainable') {
    return { html: getCompletionCompanionIconSvg('unobtainable'), className: `${CSS_PREFIX}-row-icon-red` };
  }

  if (rowKind === 'players_perfected') {
    return { html: getCompletionCompanionIconSvg('star'), className: `${CSS_PREFIX}-row-icon-normal` };
  }

  if (rowKind === 'median_completion') {
    return { html: getCompletionCompanionIconSvg('clock'), className: `${CSS_PREFIX}-row-icon-normal` };
  }

  if (rowKind === 'perfected_by_starters') {
    return { html: getCompletionCompanionIconSvg('percent'), className: `${CSS_PREFIX}-row-icon-normal` };
  }

  return { html: getCompletionCompanionIconSvg('info'), className: `${CSS_PREFIX}-row-icon-muted` };
}

export function getCompletionCompanionValueClass(rowKind: string): string {
  if (rowKind === 'broken' || rowKind === 'paid_dlc' || rowKind === 'restricted') {
    return `${CSS_PREFIX}-value-yellow`;
  }

  if (rowKind === 'conditional') {
    return `${CSS_PREFIX}-value-orange`;
  }

  if (rowKind === 'unobtainable') {
    return `${CSS_PREFIX}-value-red`;
  }

  return '';
}