/**
 * Tiny helpers for Capacitor vs browser / PWA.
 * Safe to import from client components — guards all native calls.
 */

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Dynamic require pattern avoided — use Capacitor global when present
    const Cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (Cap?.isNativePlatform) return Cap.isNativePlatform();
  } catch {
    // ignore
  }
  return false;
}
