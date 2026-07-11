'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheckIcon } from '@/lib/icons';
import type { ReactNode } from 'react';

/**
 * Atmospheric shell for /result-check — brand-first, theme-aware, mobile-safe.
 */
export default function ResultCheckShell({
  children,
  compact,
}: {
  children: ReactNode;
  /** Tighter top padding when content is dense (report view). */
  compact?: boolean;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background" />
      <div className="pointer-events-none absolute inset-0 -z-10 rc-mesh" />
      <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl rc-breeze" />
      <div className="pointer-events-none absolute top-[28%] -right-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl rc-breeze-delay" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl rc-breeze-slow" />

      <div className={`relative mx-auto w-full max-w-4xl px-4 sm:px-6 ${compact ? 'py-6 sm:py-10' : 'py-8 sm:py-14'}`}>
        <header className="rc-fade-up mb-8 flex items-center justify-between gap-3 sm:mb-10">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition group-hover:scale-[1.03]">
              <Image src="/images/logo.png" alt="Rillcod" width={36} height={36} className="h-8 w-8 object-contain" priority />
            </span>
            <div className="min-w-0">
              <p className="truncate rc-display text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
                RILLCOD
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Result Checker
              </p>
            </div>
          </Link>
          <div className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400 sm:flex">
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            Verified
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
