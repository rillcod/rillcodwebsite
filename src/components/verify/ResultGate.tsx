'use client';

import { useState, useEffect, type ReactNode } from 'react';
import ParentClaim from './ParentClaim';
import { PortalAccessBar, type PortalAccessProps } from './PortalAccessBar';

/**
 * The single result gate shared by every scan surface (/verify and /result-check).
 * Parents link their account to unlock the result. Consent forms are optional and
 * never block the report once the parent gate is satisfied.
 */
export default function ResultGate({
  code,
  captured,
  recordGaps,
  portalAccess,
  onClaimLinked,
  children,
}: {
  code: string;
  captured: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  portalAccess?: PortalAccessProps | null;
  onClaimLinked?: () => void;
  children: ReactNode;
}) {
  const [claimUnlocked, setClaimUnlocked] = useState(false);
  const [staffUnlocked, setStaffUnlocked] = useState(false);
  const [access, setAccess] = useState(portalAccess ?? null);

  useEffect(() => {
    setAccess(portalAccess ?? null);
  }, [portalAccess]);

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
          <div className="rounded-2xl border border-[var(--rc-blue)]/20 bg-[var(--rc-blue)]/5 px-5 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--rc-blue)]">
              Staff view — result shown without the parent gate
            </p>
          </div>
        )}
        {access && (captured || claimUnlocked) && (
          <PortalAccessBar
            scanCode={code}
            access={access}
            parentEmailForResend={access.parentEmail ?? undefined}
            compact
            onCredentialsUpdated={creds => setAccess({
              parentLoginUrl: creds.parentLoginUrl,
              studentLoginUrl: creds.studentLoginUrl,
              parentEmail: creds.parentEmail,
              studentEmail: creds.studentEmail,
            })}
          />
        )}
        {children}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-amber-500/25 bg-gradient-to-br from-amber-50/90 to-white/80 p-5 text-center sm:p-6">
        <p className="rc-display text-lg font-bold tracking-tight text-[var(--rc-ink)] sm:text-xl">
          Result protected
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--rc-muted)] sm:text-sm">
          Link your parent account below to unlock this report and receive parent + student portal logins.
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
