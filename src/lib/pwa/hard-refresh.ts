/**
 * Force the browser onto the latest deploy by dropping the service worker
 * and caches, then navigating with a cache-busting query param.
 */
export async function hardRefreshApp(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // continue
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // continue
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_refresh', String(Date.now()));
  window.location.replace(url.toString());
}
