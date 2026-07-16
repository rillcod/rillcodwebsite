'use client';

import { useLayoutEffect, useState } from 'react';
import { isCapacitorNative } from '@/lib/capacitor/platform';

/** Stable client-side native flag for Play-policy-sensitive UI. */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);

  useLayoutEffect(() => {
    const previewNative =
      ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
      new URLSearchParams(window.location.search).get('platform') === 'native';

    setNative(previewNative || isCapacitorNative());
  }, []);

  return native;
}