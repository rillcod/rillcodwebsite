'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { useOverlayScrollLock } from '@/components/ui/BodyPortal';

type MobileBottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dialog (required for screen readers). */
  label: string;
  /** When false, drag-to-dismiss and scrim tap are disabled. */
  dismissible?: boolean;
  className?: string;
  zIndexClassName?: string;
  /** Show on all breakpoints; default is phones only. */
  showOnDesktop?: boolean;
};

function lightTap() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(6);
    }
  } catch {
    // Ignore.
  }
}

/**
 * Bottom sheet aligned with Material Design 3 + iOS sheet conventions:
 * - Scrim without heavy blur
 * - Large top corner radius (~28dp)
 * - Drag handle only (content scrolls freely)
 * - Velocity / distance dismiss with immediate snap-back
 * - prefers-reduced-motion support
 * - Safe-area padding
 * - Focus moved into the sheet while open
 */
export default function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  label,
  dismissible = true,
  className = '',
  zIndexClassName = 'z-[110]',
  showOnDesktop = false,
}: MobileBottomSheetProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(false);
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 360], [1, 0.25]);
  const closingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Block taps for the open animation so the gesture that opened the sheet
  // cannot land on footer actions (Sign out) — a common mobile click-through.
  const [interactive, setInteractive] = useState(false);

  const openMs = reduceMotion ? 0.01 : 0.16;
  const closeMs = reduceMotion ? 0.01 : 0.12;
  const snapMs = reduceMotion ? 0.01 : 0.1;

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayScrollLock(rendered);

  useLayoutEffect(() => {
    if (!isOpen) return;
    closingRef.current = false;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setInteractive(false);
    setRendered(true);
  }, [isOpen]);

  useEffect(() => {
    if (!rendered || !isOpen) {
      setInteractive(false);
      return;
    }
    const delayMs = reduceMotion ? 40 : Math.round(openMs * 1000) + 120;
    const timer = window.setTimeout(() => setInteractive(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [rendered, isOpen, reduceMotion, openMs]);

  useLayoutEffect(() => {
    if (!rendered || !isOpen || closingRef.current) return;
    const height = sheetRef.current?.offsetHeight ?? 520;
    y.set(reduceMotion ? 0 : height);
    if (!reduceMotion) {
      void animate(y, 0, {
        type: 'tween',
        duration: openMs,
        ease: [0.2, 0, 0, 1],
      });
    }
    requestAnimationFrame(() => {
      sheetRef.current?.focus();
    });
    void lightTap();
  }, [rendered, isOpen, y, reduceMotion, openMs]);

  const finishClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    void lightTap();
    const height = sheetRef.current?.offsetHeight ?? 520;
    await animate(y, reduceMotion ? 0 : height + 24, {
      type: 'tween',
      duration: closeMs,
      ease: [0.3, 0, 1, 1],
    });
    onClose();
    setRendered(false);
    y.set(0);
    closingRef.current = false;
    previouslyFocused.current?.focus?.();
  }, [onClose, y, reduceMotion, closeMs]);

  const finishCloseRef = useRef(finishClose);
  finishCloseRef.current = finishClose;

  // Parent closed the sheet (route change, X, native back) — animate out only.
  useEffect(() => {
    if (isOpen || !rendered || closingRef.current) return;
    closingRef.current = true;
    const height = sheetRef.current?.offsetHeight ?? 520;
    void animate(y, reduceMotion ? 0 : height + 24, {
      type: 'tween',
      duration: closeMs,
      ease: [0.3, 0, 1, 1],
    }).then(() => {
      setRendered(false);
      y.set(0);
      closingRef.current = false;
      previouslyFocused.current?.focus?.();
    });
  }, [isOpen, rendered, y, reduceMotion, closeMs]);

  useEffect(() => {
    if (!rendered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        void finishCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rendered, dismissible]);

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (!dismissible || closingRef.current) return;
      const height = sheetRef.current?.offsetHeight ?? 520;
      const shouldClose =
        info.velocity.y > 500 ||
        info.offset.y > Math.max(56, height * 0.2);
      if (shouldClose) {
        void finishClose();
        return;
      }
      void animate(y, 0, {
        type: 'tween',
        duration: snapMs,
        ease: [0.2, 0, 0, 1],
      });
    },
    [dismissible, finishClose, y, snapMs],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (!dismissible || closingRef.current || reduceMotion) return;
      if (event.button !== 0) return;
      dragControls.start(event);
    },
    [dismissible, dragControls, reduceMotion],
  );

  if (!mounted || !rendered) return null;

  return createPortal(
    <div className={`fixed inset-0 ${showOnDesktop ? '' : 'md:hidden'} ${zIndexClassName}`}>
      <motion.button
        type="button"
        aria-label="Dismiss"
        style={{ opacity: backdropOpacity }}
        className={`absolute inset-0 h-full w-full bg-black/32 dark:bg-black/50 ${interactive ? '' : 'pointer-events-none'}`}
        onClick={() => {
          if (dismissible && interactive) void finishClose();
        }}
      />

      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ y }}
        drag={dismissible && !reduceMotion ? 'y' : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.06 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        className={`absolute bottom-0 left-0 right-0 flex max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-[1.75rem] border-t border-border bg-card shadow-[0_-8px_32px_rgba(15,23,42,0.12)] outline-none ${interactive ? '' : 'pointer-events-none'} ${className}`}
      >
        <div
          className="flex shrink-0 flex-col items-center"
          onPointerDown={startDrag}
          style={{ touchAction: 'none' }}
          aria-hidden={!dismissible}
        >
          {/* Material 3 drag handle: 32×4dp visual, 44pt hit target */}
          <div className="flex min-h-11 w-full items-center justify-center pt-2">
            <div className="h-1 w-8 rounded-full bg-muted-foreground/35" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

export { lightTap };
