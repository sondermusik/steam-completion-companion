// @ts-nocheck

import { parsePositiveInteger } from '../../shared/steamCompletionCompanionCore';

const STORE_APP_PATTERN = /store\.steampowered\.com\/app\/(\d+)/i;

/**
 * Reads the Steam app id from the current Store URL.
 */
export function getStoreAppIdFromUrl() {
  const href = String(window.location.href || '');
  const match = href.match(STORE_APP_PATTERN);

  return parsePositiveInteger(match && match[1] ? match[1] : undefined);
}

/**
 * Finds the Steam Store metadata block used as insertion anchor.
 */
export function findFeatureMetadataBlock() {
  const directBlockSelectors = [
    '.block.responsive_apppage_details_right',
    '.game_area_details_specs_ctn',
    '.game_area_details_specs',
    '#category_block',
  ];

  for (const selector of directBlockSelectors) {
    const element = document.querySelector(selector);

    if (!element) continue;

    const block = element.closest('.block.responsive_apppage_details_right');

    return block || element;
  }

  const links = Array.from(document.querySelectorAll('a, div, span'));

  for (const element of links) {
    const text = String(element.textContent || '').trim().toLowerCase();

    if (
      text.includes('singleplayer') ||
      text.includes('einzelspieler') ||
      text.includes('steam achievements') ||
      text.includes('steam-errungenschaften') ||
      text.includes('steam cloud')
    ) {
      const block =
        element.closest('.block.responsive_apppage_details_right') ||
        element.closest('.game_area_details_specs_ctn') ||
        element.closest('.game_area_details_specs');

      if (block) return block;
    }
  }

  return null;
}

/**
 * Returns where the store panel should be inserted.
 */
export function findStoreInsertionParentAndReference() {
  const featureBlock = findFeatureMetadataBlock();

  if (!featureBlock || !featureBlock.parentElement) {
    return null;
  }

  return {
    parent: featureBlock.parentElement,
    reference: featureBlock,
  };
}