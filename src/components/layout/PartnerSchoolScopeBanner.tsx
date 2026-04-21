'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { BuildingOffice2Icon } from '@/lib/icons';

const FULLSCREEN_PATHS = ['/dashboard/inbox', '/dashboard/messages', '/dashboard/school-teacher-messages'];

/**
 * Explains partner-school scope: their dashboard is their school’s operational
 * slice, not Rillcod platform administration.
 */
export default function PartnerSchoolScopeBanner() {
  const pathname = usePathname();
  const { profile, loading, profileLoading } = useAuth();

  if (loading || profileLoading || profile?.role !== 'school') return null;
  if (!pathname?.startsWith('/dashboard')) return null;
  if (FULLSCREEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="mb-4 rounded-none border border-orange-500/25 bg-orange-500/[0.06] px-4 py-3 flex gap-3 items-start">
      <div className="mt-0.5 shrink-0 text-orange-400">
        <BuildingOffice2Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="text-left space-y-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-orange-400/90">Partner school workspace</p>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          You are signed in as a <span className="text-foreground font-semibold">school partner</span>. This portal shows{' '}
          <span className="text-foreground font-semibold">your school’s</span> students, classes, billing, and
          schedules. Platform-wide tools (all schools, teachers directory, approvals, analytics, and finance console)
          stay with Rillcod staff only.
        </p>
      </div>
    </div>
  );
}
