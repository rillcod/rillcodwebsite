'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';
import ParentClaim from '@/components/verify/ParentClaim';
import { formatAccessCardCodeInput, resolveResultCheckTarget } from '@/lib/access-card-code';

function ParentClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialCode = searchParams.get('code') || '';
  const [code, setCode] = useState(formatAccessCardCodeInput(initialCode));
  const [activeCode, setActiveCode] = useState(resolveResultCheckTarget(initialCode) || '');
  const [error, setError] = useState('');

  function handleStartClaim(e: React.FormEvent) {
    e.preventDefault();
    const resolved = resolveResultCheckTarget(code);
    if (!resolved) {
      setError('Please enter a valid RC student number (e.g. RC-1234-5678).');
      return;
    }
    setError('');
    setActiveCode(resolved);
  }

  return (
    <ResultCheckShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-2">
            <UserIcon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="rc-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Parent Account &amp; Record Linking
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Fill in your parent details below to automatically link your child&apos;s academic record and receive portal login credentials.
          </p>
        </div>

        {!activeCode ? (
          <form onSubmit={handleStartClaim} className="rc-panel rounded-[1.75rem] p-5 sm:p-7 space-y-4">
            <label htmlFor="student-code" className="block text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Enter your child&apos;s RC student number
            </label>
            <div className="relative flex items-center overflow-hidden rounded-2xl border border-border bg-background focus-within:border-primary">
              <span className="pointer-events-none shrink-0 pl-4 text-lg font-black tracking-wider text-primary">
                RC-
              </span>
              <input
                id="student-code"
                value={code}
                onChange={(e) => {
                  setCode(formatAccessCardCodeInput(e.target.value));
                  setError('');
                }}
                placeholder="1234-5678"
                maxLength={9}
                className="w-full border-0 bg-transparent px-3 py-4 text-center text-xl font-bold tracking-[0.25em] outline-none placeholder:tracking-normal"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              className="rc-cta rc-cta-pulse w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold tracking-wide"
            >
              Continue to Parent Details Form <ArrowRightIcon className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Student Record</p>
                <p className="text-base font-black text-foreground">RC-{activeCode}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCode('')}
                className="text-xs font-bold text-muted-foreground hover:text-foreground underline"
              >
                Change Code
              </button>
            </div>

            <ParentClaim
              code={activeCode}
              onLinked={() => {
                setTimeout(() => {
                  router.push(`/result-check/${encodeURIComponent(activeCode)}`);
                }, 2000);
              }}
            />
          </div>
        )}

        <div className="text-center pt-2">
          <Link href="/result-check" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            ← Return to Result Check Homepage
          </Link>
        </div>
      </div>
    </ResultCheckShell>
  );
}

export default function ParentClaimPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading parent setup form…</p>
      </div>
    }>
      <ParentClaimContent />
    </Suspense>
  );
}
