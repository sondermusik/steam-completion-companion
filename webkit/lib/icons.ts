export function iconSvg(kind: string): string {
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

export function getIconHtml(rowKind: string): { html: string; className: string } {
  if (rowKind === 'paid_dlc') return { html: iconSvg('dlc'), className: 'scc-row-icon-yellow' };
  if (rowKind === 'broken') return { html: iconSvg('broken'), className: 'scc-row-icon-yellow' };
  if (rowKind === 'conditional') return { html: iconSvg('conditional'), className: 'scc-row-icon-orange' };
  if (rowKind === 'unobtainable') return { html: iconSvg('unobtainable'), className: 'scc-row-icon-red' };

  if (rowKind === 'restricted') {
    return {
      html: '<i class="icon icon-fw icon-spinner scc-native-icon" aria-hidden="true"></i>',
      className: 'scc-row-icon-yellow',
    };
  }

  if (rowKind === 'players_perfected') return { html: iconSvg('star'), className: 'scc-row-icon-normal' };
  if (rowKind === 'median_completion') return { html: iconSvg('clock'), className: 'scc-row-icon-normal' };
  if (rowKind === 'perfected_by_starters') return { html: iconSvg('percent'), className: 'scc-row-icon-normal' };

  return { html: iconSvg('info'), className: 'scc-row-icon-muted' };
}

export function getValueClass(rowKind: string): string {
  if (rowKind === 'broken' || rowKind === 'paid_dlc' || rowKind === 'restricted') {
    return 'scc-value-yellow';
  }

  if (rowKind === 'conditional') {
    return 'scc-value-orange';
  }

  if (rowKind === 'unobtainable') {
    return 'scc-value-red';
  }

  return '';
}