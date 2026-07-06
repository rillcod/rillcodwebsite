'use client';

import { useState, useEffect, type ReactNode } from 'react';
import ParentClaim from './ParentClaim';

/**
 * The single result gate shared by every scan surface (/verify and /result-check).
 * Parents link their account to unlock the result. Consent forms are optional and
 * never block the report once the parent gate is satisfied.
 */
export default function ResultGate({
  code,
  captured,
  recordGaps,
  onClaimLinked,
  children,
}: {
  code: string;
  captured: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  onClaimLinked?: () => void;
  children: ReactNode;
}) {
  const [claimUnlocked, setClaimUnlocked] = useState(false);
  const [staffUnlocked, setStaffUnlocked] = useState(false);

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

  const gateOpen = captured || claimUnlocked || staffUnlocked;

  if (gateOpen) {
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
          Confirm you’re the parent or guardian below to link your account and unlock this result.
          Once verified, future scans open instantly.
        </p>
      </div>
      <ParentClaim
        code={code}
        recordGaps={recordGaps}
        onLinked={() => { setClaimUnlocked(true); onClaimLinked?.(); }}
      />
    </div>
  );
}
