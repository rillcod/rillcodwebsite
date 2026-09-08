'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  pushRouteToStack,
  performSmartBack,
  isRootTab,
  resolveMobileScreenTitle,
} from '@/lib/navigation/smart-back';

export function useSmartBack(userRole?: string | null) {
  const pathname = usePathname();
  const router = useRouter();

  // Track route visits into stack
  useEffect(() => {
    if (!pathname) return;
    pushRouteToStack(pathname);
  }, [pathname]);

  // Intercept browser / PWA popstate to close transient modals first
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (e: PopStateEvent) => {
      // Check if any open modal/sheet/drawer needs closing first
      const nativeBackEvent = new Event('rillcod:native-back', { cancelable: true });
      window.dispatchEvent(nativeBackEvent);

      if (nativeBackEvent.defaultPrevented) {
        // Stop browser back navigation from leaving the page when a modal was open
        window.history.pushState(null, '', window.location.href);
        return;
      }

      const openDialog = document.querySelector<HTMLElement>(
        '[role="dialog"], dialog[open], [data-state="open"]'
      );
      if (openDialog) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const goBack = useCallback(() => {
    if (!pathname) return;
    performSmartBack(router, pathname);
  }, [router, pathname]);

  const isRoot = isRootTab(pathname || '/', userRole);
  const screenTitle = resolveMobileScreenTitle(pathname || '/');

  return {
    goBack,
    isRoot,
    screenTitle,
    pathname: pathname || '/',
  };
}
