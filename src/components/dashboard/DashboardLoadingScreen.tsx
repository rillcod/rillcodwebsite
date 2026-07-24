'use client';

import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

type Props = {
  message?: string;
  variant?: 'fullscreen' | 'inline' | 'skeleton';
};

/** Shared dashboard loading UI — auth, profile, and route transitions. */
export default function DashboardLoadingScreen({
  message = 'Loading your dashboard…',
  variant = 'fullscreen',
}: Props) {
  if (variant === 'skeleton') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="h-28 rounded-xl bg-muted/40 border border-border animate-pulse" />
        <DashboardSkeleton />
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin shrink-0" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="relative">
          <div className="w-14 h-14 border-4 border-border border-t-primary rounded-full animate-spin" />
          <img
            src="/images/logo.png"
            alt=""
            aria-hidden
            className="absolute inset-0 m-auto w-6 h-6 object-contain opacity-80"
          />
        </div>
        <div className="space-y-1">
          <p className="text-foreground text-sm font-bold">{message}</p>
          <p className="text-muted-foreground text-xs">Preparing your workspace…</p>
        </div>
      </div>
    </div>
  );
}
