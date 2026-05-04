import { bootStorePanel } from './lib/storePanel';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootStorePanel, { once: true });
} else {
  bootStorePanel();
}