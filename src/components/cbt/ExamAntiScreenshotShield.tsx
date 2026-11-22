'use client';

import { useEffect, useState, useMemo } from 'react';
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@/lib/icons';

interface ExamAntiScreenshotShieldProps {
  studentLabel: string;
  examTitle?: string;
  active: boolean;
  onViolation?: (reason: string, totalCount: number) => void;
}

/**
 * Multi-layer exam screen protection for mobile (iOS/Android) & desktop browsers:
 * 1. Personalized dynamic watermark overlay (identifies any camera/phone photo).
 * 2. Instant privacy curtain on app switch, notification-shade pull, split-screen,
 *    window blur, PrintScreen / Cmd+Shift+3/4/5, or 3-finger screenshot gesture.
 * 3. Blocks copy, cut, context-menu, drag, long-press save, and print output.
 */
export default function ExamAntiScreenshotShield({
  studentLabel,
  examTitle,
  active,
  onViolation,
}: ExamAntiScreenshotShieldProps) {
  const [shielded, setShielded] = useState(false);
  const [shieldReason, setShieldReason] = useState('');
  const [violationCount, setViolationCount] = useState(0);
  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Rotate watermark timestamp every 30s so any photo is time-stamped
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setStamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const triggerShield = (reason: string, autoDismissMs?: number) => {
      setShieldReason(reason);
      setShielded(true);
      setViolationCount((prev) => {
        const next = prev + 1;
        onViolation?.(reason, next);
        return next;
      });
      if (autoDismissMs) {
        window.setTimeout(() => {
          if (document.visibilityState === 'visible' && document.hasFocus()) {
            setShielded(false);
          }
        }, autoDismissMs);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        triggerShield('Exam paused — screen capture or app switching is restricted.');
      }
    };

    const onWindowBlur = () => {
      triggerShield('Exam hidden — keep this exam window focused at all times.');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const isPrintScreen = key === 'printscreen' || e.code === 'PrintScreen';
      const isMacShot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(key);
      const isWinSnip = (e.metaKey || e.ctrlKey) && e.shiftKey && key === 's';
      const isPrintOrSave = (e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(key);
      const isCopyKey = (e.ctrlKey || e.metaKey) && ['c', 'x', 'a'].includes(key);

      // Allow Ctrl+C/A inside student's own essay textarea, block everywhere else
      const target = e.target as HTMLElement | null;
      const inEditable = Boolean(target?.closest('textarea, input'));

      if (isPrintScreen || isMacShot || isWinSnip || isPrintOrSave) {
        e.preventDefault();
        e.stopPropagation();
        try {
          void navigator.clipboard?.writeText?.('');
        } catch {
          // Ignore clipboard permission errors
        }
        triggerShield('Screenshot & print shortcuts are blocked during this examination.', 2800);
        return;
      }

      if (isCopyKey && !inEditable) {
        e.preventDefault();
      }
    };

    // Detect 3-finger screenshot gestures on Android / iOS phones
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        e.preventDefault();
        triggerShield('Multi-finger screenshot gesture detected — screen protected.', 2600);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('textarea, input')) {
        e.preventDefault();
      }
    };

    const onCopyOrCut = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('textarea, input')) {
        e.preventDefault();
      }
    };

    const onBeforePrint = () => {
      triggerShield('Printing exam questions is disabled.');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopyOrCut);
    document.addEventListener('cut', onCopyOrCut);
    window.addEventListener('beforeprint', onBeforePrint);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopyOrCut);
      document.removeEventListener('cut', onCopyOrCut);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [active, onViolation]);

  const watermarkCells = useMemo(() => Array.from({ length: 12 }), []);

  if (!active) return null;

  return (
    <>
      {/* Print-blanking & iOS/Android callout/selection protection */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; display: none !important; }
        }
        .cbt-protected-surface {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
        .cbt-protected-surface textarea,
        .cbt-protected-surface input {
          -webkit-user-select: text;
          user-select: text;
          -webkit-touch-callout: default;
        }
      `}</style>

      {/* Subtle personalized watermark tiled across the live exam */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[45] overflow-hidden select-none opacity-[0.055] dark:opacity-[0.07]"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 sm:gap-20 p-6 -rotate-12 scale-110">
          {watermarkCells.map((_, idx) => (
            <div key={idx} className="text-center font-black uppercase tracking-widest text-[11px] sm:text-xs text-foreground whitespace-nowrap">
              {studentLabel} · {stamp}
              {examTitle ? ` · ${examTitle.slice(0, 18)}` : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Instant Privacy Curtain on blur / screenshot / app-switch */}
      {shielded && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Exam screen protected"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-background/98 backdrop-blur-2xl p-6"
        >
          <div className="max-w-sm w-full rounded-3xl border border-amber-500/40 bg-card p-6 text-center shadow-2xl space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-black text-foreground">Exam Screen Protected</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {shieldReason || 'Screenshots, screen recording, and switching away from the exam are restricted.'}
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Security events logged: {violationCount}
            </div>
            <button
              type="button"
              onClick={() => setShielded(false)}
              className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 py-3 text-xs font-black uppercase tracking-wider text-white transition-colors"
            >
              Return to Examination
            </button>
          </div>
        </div>
      )}
    </>
  );
}
