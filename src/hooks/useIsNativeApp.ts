'use client';

import { useEffect, useState } from 'react';
import { isCapacitorNative } from '@/lib/capacitor/platform';

/** Stable client-side native flag for Play-policy-sensitive UI. */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isCapacitorNative());
  }, []);

  return native;
}