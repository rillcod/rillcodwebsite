'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import ParentClaim from './ParentClaim';
import { PortalAccessBar, type PortalAccessProps } from './PortalAccessBar';
import type { ParentClaimLinkedResult } from '@/lib/parent-claim/linked-result';

type Role = 'admin' | 'teacher' | 'school' | 'parent' | string | null;

function roleLabel(role: Role): string {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Teacher';
  if (role === 'school') return 'School Staff';
  return 'Staff';
}

function roleColor(role: Role): string {
  if (role === 'admin') return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400';
  if (role === 'teacher') return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
  if (role === 'school') return 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400';
  return 'border-primary/20 bg-primary/5 text-primary';
}

/**
 * Result gate for /result-check.
 * - Linked parents and logged-in parents with matching records go straight through.
 * - Staff (admin/teacher/school) bypass the parent gate and see a named identity banner.
 * - ParentClaim is only for visitors who still need to link and verify details.
 */
export default function ResultGate({
  code,
  captured,
  sessionAutoLinked,
  recordGaps,
  portalAccess,
  staffRole,
  staffName,
  onClaimLinked,
  children,
}: {
  code: string;
  captured: boolean;
  sessionAutoLinked?: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  portalAccess?: PortalAccessProps | null;
  /** Role from the API (admin / teacher / school) — only set when staff is logged in */
  staffRole?: string | null;
  /** Full name of the logged-in staff member */
  staffName?: string | null;
  onClaimLinked?: (result: ParentClaimLinkedResult) => void;
  children: ReactNode;
}) {
  const [claimUnlocked, setClaimUnlocked] = useState(false);
  // Client-side staff detection (fallback if API doesn't include staffRole yet)
  const [clientStaffRole, setClientStaffRole] = useState<string | null>(null);
  const [clientStaffName, setClientStaffName] = useState<string | null>(null);
  const [access, setAccess] = useState(portalAccess ?? null);

  useEffect(() => {
    setAccess(portalAccess ?? null);
  }, [portalAccess]);

  // Detect logged-in staff from /api/auth/me (client-side fallback)
  useEffect(() => {
    if (staffRole) return; // Already resolved server-side
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (cancelled) return;
        const role = j?.profile?.role;
        const name = (j?.profile?.full_name || '').trim() || null;
        if (role && ['admin', 'teacher', 'school'].includes(role)) {
          setClientStaffRole(role);
          setClientStaffName(name);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [staffRole]);

  const resolvedStaffRole = staffRole || clientStaffRole || null;
  const resolvedStaffName = staffName || clientStaffName || null;
  const staffUnlocked = !!resolvedStaffRole;

  const gateOpen = captured || claimUnlocked || staffUnlocked;

  if (gateOpen) {
    return (
      <>
        {/* ── Staff identity banner ─────────────────────────────────────────── */}
        {staffUnlocked && !captured && (
          <div className={`rounded-2xl border px-5 py-3 ${roleColor(resolvedStaffRole)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em]">
                  {roleLabel(resolvedStaffRole)} Access
                  {resolvedStaffName ? ` · ${resolvedStaffName}` : ''}
                </p>
                <p className="text-[10px] mt-0.5 opacity-70">
                  Viewing as staff — parent setup gate bypassed for this session
                </p>
              </div>
              <span className="rounded-full border border-current/20 bg-current/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest opacity-70">
                Staff View
              </span>
            </div>
          </div>
        )}

        {/* ── Returning linked parent banner ───────────────────────────────── */}
        {sessionAutoLinked && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              Welcome back — your account is linked. Result unlocked.
            </p>
          </div>
        )}

        {/* ── Portal access bar (for newly linked parent) ──────────────────── */}
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

  // ── Gate: not yet linked ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Locked notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75A4.5 4.5 0 0 0 7.5 6.75v3.75m-.75 0h10.5a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V11.25a.75.75 0 0 1 .75-.75Z" />
        </svg>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Parent setup required
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Your code is valid. Fill in the form below once — it unlocks this report and saves your parent account for next time.
          </p>
          <Link
            href="/login?type=parent"
            className="mt-2 inline-block text-[11px] font-bold text-primary hover:underline"
          >
            Already have a parent account? Log in →
          </Link>
        </div>
      </div>

      <ParentClaim
        code={code}
        recordGaps={recordGaps}
        autoOpen
        onLinked={(result) => {
          setClaimUnlocked(true);
          onClaimLinked?.(result);
        }}
      />
    </div>
  );
}
