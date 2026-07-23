'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import ParentClaim from './ParentClaim';
import { PortalAccessBar, type PortalAccessProps } from './PortalAccessBar';

/**
 * Result gate for /result-check.
 * Linked parents and logged-in parents with matching records go straight through.
 * ParentClaim is only for visitors who still need to link and verify details.
 */
export default function ResultGate({
  code,
  captured,
  sessionAutoLinked,
  recordGaps,
  portalAccess,
  onClaimLinked,
  children,
}: {
  code: string;
  captured: boolean;
  sessionAutoLinked?: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  portalAccess?: PortalAccessProps | null;
  onClaimLinked?: () => void;
  children: ReactNode;
}) {
  const [claimUnlocked, setClaimUnlocked] = useState(false);
  const [staffUnlocked, setStaffUnlocked] = useState(false);
  const [loggedInParent, setLoggedInParent] = useState(false);
  const [access, setAccess] = useState(portalAccess ?? null);

  useEffect(() => {
    setAccess(portalAccess ?? null);
  }, [portalAccess]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled) return;
        const role = j?.profile?.role;
        if (role && ['admin', 'teacher', 'school'].includes(role)) setStaffUnlocked(true);
        if (role === 'parent') setLoggedInParent(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const gateOpen = captured || claimUnlocked || staffUnlocked;

  if (gateOpen) {
    return (
      <>
        {sessionAutoLinked && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              Welcome back — your account is linked. Result unlocked.
            </p>
          </div>
        )}
        {staffUnlocked && !captured && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
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
      <div className="rounded-[1.5rem] border border-amber-500/25 bg-amber-500/10 p-5 text-center sm:p-6">
        <p className="rc-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
          One-time parent setup to unlock result
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {loggedInParent
            ? 'Your parent account is not linked to this student yet. Complete the one-time setup below — your child will be linked automatically and login details sent to your email.'
            : 'Your student number is correct. Set up once below — we verify you by email, link your child automatically, and send login details. Your teacher does not enter anything for you.'}
        </p>
        {!loggedInParent && (
          <Link
            href={`/login?redirect=${encodeURIComponent(`/result-check/${encodeURIComponent(code)}`)}`}
            className="mt-3 inline-flex text-xs font-bold text-primary underline underline-offset-2"
          >
            Already have a parent account? Log in first
          </Link>
        )}
      </div>
      <ParentClaim
        code={code}
        recordGaps={recordGaps}
        onLinked={() => { setClaimUnlocked(true); onClaimLinked?.(); }}
      />
    </div>
  );
}
