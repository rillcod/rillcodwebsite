'use client';

import { useState, useEffect, type ReactNode } from 'react';
import ParentClaim from './ParentClaim';

/**
 * The single result gate shared by every scan surface (/verify and /result-check).
 * Shows the result when the child's real parent is already captured, the viewer is
 * logged-in staff, or they complete the parent claim in-session; otherwise it gates the
 * result behind the self-service parent claim. Consolidates what used to be copy-pasted
 * per page (staff bypass, unlock state, protected notice, ParentClaim).
 */
export default function ResultGate({ code, captured, recordGaps, onClaimLinked, children }: {
  code: string;
  captured: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  onClaimLinked?: () => void;
  children: ReactNode;
}) {
  const [claimUnlocked, setClaimUnlocked] = useState(false);
  const [staffUnlocked, setStaffUnlocked] = useState(false);

  // Logged-in staff (admin/teacher/school) bypass the gate — verified via their session.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const role = j?.profile?.role;
        if (!cancelled && role && ['admin', 'teacher', 'school'].includes(role)) setStaffUnlocked(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (captured || claimUnlocked || staffUnlocked) {
    return (
      <>
        {staffUnlocked && !captured && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Staff view — result shown without the parent gate</p>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-amber-500/30 rounded-2xl p-5 text-center">
        <p className="text-sm font-black text-foreground">🔒 Result protected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Confirm you’re the parent or guardian below to unlock this result. Once verified, it opens instantly every time.
        </p>
      </div>
      <ParentClaim code={code} recordGaps={recordGaps} onLinked={() => { setClaimUnlocked(true); onClaimLinked?.(); }} />
    </div>
  );
}
