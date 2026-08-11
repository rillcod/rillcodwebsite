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
  portalLabel = 'Official Result Portal',
}: {
  children: ReactNode;
  /** Tighter top padding when content is dense (report view). */
  compact?: boolean;
  /** Reuse the secure public shell without leaking result-specific wording. */
  portalLabel?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground transition-colors">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />
      <div className="pointer-events-none absolute top-[20%] -right-24 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

      <div className={`relative mx-auto w-full max-w-4xl px-4 sm:px-6 ${compact ? 'py-6 sm:py-10' : 'py-8 sm:py-14'}`}>
        <header className="mb-8 flex items-center justify-between gap-3 sm:mb-10">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-md ring-1 ring-border transition group-hover:scale-105">
              <Image src="/images/logo.png" alt="Rillcod" width={36} height={36} className="h-8 w-8 object-contain" priority />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-tight text-foreground sm:text-xl">
                RILLCOD TECHNOLOGIES
              </p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-red-accent animate-ping" />
                <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-foreground">
                  {portalLabel}
                </p>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400 sm:flex">
              <ShieldCheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Verified &amp; Secure
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
