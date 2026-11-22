'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ArrowLeftIcon, ShieldCheckIcon, XMarkIcon } from '@/lib/icons';
import ParentClaim from '@/components/verify/ParentClaim';

const SESSION_DONE_KEY = 'rillcod:parent-contact-gate:done';

/**
 * Mirrors the existing RC Result-Check ParentClaim gateway inside the authenticated
 * Student Portal. Reuses <ParentClaim /> directly so parent account creation,
 * sibling linking, OTP/Google verification, and CRM contact capture stay 100% unified.
 * Never activates for non-students and never interrupts live exam (/take) pages.
 */
export default function ParentContactGate() {
  const { profile, loading: authLoading } = useAuth();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [rcCode, setRcCode] = useState('');
  const [rcCodeDisplay, setRcCodeDisplay] = useState('');
  const [recordGaps, setRecordGaps] = useState<{ needsGender?: boolean; needsAge?: boolean }>({});

  const isOnExamTake = Boolean(pathname && /\/take(\/|$)/.test(pathname));

  useEffect(() => {
    if (authLoading || !profile || profile.role !== 'student' || isOnExamTake) return;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(`${SESSION_DONE_KEY}:${profile.id}`) === '1') {
      return;
    }

    let cancelled = false;
    fetch('/api/students/parent-contact', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.needsParentContact && data.rcCode) {
          setStudentName(data.studentName || profile.full_name || 'Student');
          setRcCode(data.rcCode);
          setRcCodeDisplay(data.rcCodeDisplay || data.rcCode);
          setRecordGaps(data.recordGaps || {});
          setOpen(true);
        } else if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(`${SESSION_DONE_KEY}:${profile.id}`, '1');
        }
      })
      .catch(() => {
        // Non-blocking on transient network errors
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, profile, isOnExamTake]);

  const dismissForSession = useCallback(() => {
    if (typeof window !== 'undefined' && profile?.id) {
      window.sessionStorage.setItem(`${SESSION_DONE_KEY}:${profile.id}`, '1');
    }
    setOpen(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissForSession();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismissForSession]);

  if (!open || !rcCode || isOnExamTake) return null;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissForSession();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-contact-gate-title"
        className="w-full max-w-lg rounded-2xl border border-primary/30 bg-card shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        <div className="border-b border-border bg-primary/10 px-4 sm:px-5 py-3.5 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheckIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Parent / Guardian Link Required
              </p>
              <h2 id="parent-contact-gate-title" className="text-sm sm:text-base font-black text-foreground leading-snug">
                Connect Parent Contact for {studentName}
              </h2>
              {rcCodeDisplay && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Student RC Number: <span className="font-mono font-bold text-primary">{rcCodeDisplay}</span>
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={dismissForSession}
            aria-label="Close parent link modal and return"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/80 text-foreground hover:bg-muted transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 flex-1">
          <ParentClaim
            code={rcCode}
            recordGaps={recordGaps}
            autoOpen
            onLinked={dismissForSession}
          />
        </div>

        <div className="border-t border-border bg-muted/40 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={dismissForSession}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background text-xs font-bold text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Portal
          </button>
          <span className="text-[11px] text-muted-foreground text-right">
            You can finish linking later
          </span>
        </div>
      </div>
    </div>
  );
}
