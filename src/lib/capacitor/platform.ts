/**
 * Tiny helpers for Capacitor vs browser / PWA.
 * Safe to import from client components — guards all native calls.
 */
import { Capacitor } from '@capacitor/core';

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}