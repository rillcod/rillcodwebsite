'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ShieldCheckIcon } from '@/lib/icons';
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

  if (!open || !rcCode || isOnExamTake) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-contact-gate-title"
        className="w-full max-w-lg rounded-2xl border border-primary/30 bg-card shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        <div className="border-b border-border bg-primary/10 px-5 py-3.5 flex items-start gap-3 shrink-0">
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

        <div className="overflow-y-auto p-4 sm:p-5">
          <ParentClaim
            code={rcCode}
            recordGaps={recordGaps}
            autoOpen
            onLinked={() => {
              if (typeof window !== 'undefined' && profile?.id) {
                window.sessionStorage.setItem(`${SESSION_DONE_KEY}:${profile.id}`, '1');
              }
              setOpen(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}
