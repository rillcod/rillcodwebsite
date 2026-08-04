'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children on document.body so `position: fixed` is never trapped by
 * a transformed / filtered / overflow ancestor (e.g. .app-page-main enter
 * animation, .app-shell-scroll).
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** Lock body + dashboard shell scroll while an overlay is open. */
export function useOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const shell = document.querySelector('.app-shell-scroll') as HTMLElement | null;
    const previousBody = document.body.style.overflow;
    const previousShell = shell?.style.overflow ?? '';
    document.body.style.overflow = 'hidden';
    if (shell) shell.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBody;
      if (shell) shell.style.overflow = previousShell;
    };
  }, [active]);
}
