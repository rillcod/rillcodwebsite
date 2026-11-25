'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FinanceModalPortalProps {
  children: ReactNode;
  onEscape?: () => void;
}

/**
 * Portals Finance modals directly to `document.body` so ancestor `backdrop-blur`,
 * `transform`, `overflow-x-clip`, or sticky shell bars (`DesktopTopNavbar`,
 * `MobileHeader`, `MobileBottomNav`, `FinanceStickyActions`) can never trap
 * modal z-index or cover primary CTAs.
 */
export function FinanceModalPortal({ children, onEscape }: FinanceModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default FinanceModalPortal;
