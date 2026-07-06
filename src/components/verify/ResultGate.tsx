'use client';

import { useState, useEffect, type ReactNode } from 'react';
import ParentClaim from './ParentClaim';

/**
 * The single result gate shared by every scan surface (/verify and /result-check).
 * Parents can link their account even when consent is still pending; the report
 * itself stays hidden until consent is complete (resultsLocked).
 */
export default function ResultGate({
  code,
  captured,
  recordGaps,
  consentNudge,
  resultsLocked,
  onClaimLinked,
  children,
}: {
  code: string;
  captured: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  consentNudge?: { formUrl?: string | null; formTitle?: string | null };
  resultsLocked?: boolean;
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

  const canViewResults = !resultsLocked || staffUnlocked;
  const gateOpen = captured || claimUnlocked || staffUnlocked;

  if (gateOpen) {
    return (
      <>
        {staffUnlocked && !captured && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Staff view — result shown without the parent gate</p>
          </div>
        )}
        {resultsLocked && (captured || claimUnlocked) && !staffUnlocked && consentNudge?.formUrl && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
            <p className="text-sm font-black text-foreground">Account linked — one more step</p>
            <p className="text-xs text-muted-foreground">
              Your parent portal is ready. Complete the one-time school form to view the full result here.
            </p>
            <a
              href={consentNudge.formUrl}
              className="inline-flex px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90"
            >
              Complete {consentNudge.formTitle || 'consent form'}
            </a>
          </div>
        )}
        {canViewResults ? children : null}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-amber-500/30 rounded-2xl p-5 text-center">
        <p className="text-sm font-black text-foreground">🔒 Result protected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Confirm you’re the parent or guardian below to link your account
          {resultsLocked ? ' and receive portal logins' : ' and unlock this result'}.
          Once verified, future scans open instantly.
        </p>
      </div>
      <ParentClaim
        code={code}
        recordGaps={recordGaps}
        consentNudge={consentNudge}
        onLinked={() => { setClaimUnlocked(true); onClaimLinked?.(); }}
      />
    </div>
  );
}
