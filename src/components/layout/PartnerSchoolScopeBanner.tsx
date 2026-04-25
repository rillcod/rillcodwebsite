'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { BuildingOffice2Icon } from '@/lib/icons';

const FULLSCREEN_PATHS = ['/dashboard/inbox', '/dashboard/messages', '/dashboard/school-teacher-messages'];

/**
 * Explains school scope without making the workspace feel secondary.
 */
export default function PartnerSchoolScopeBanner() {
  const pathname = usePathname();
  const { profile, loading, profileLoading } = useAuth();

  if (loading || profileLoading || profile?.role !== 'school') return null;
  if (!pathname?.startsWith('/dashboard')) return null;
  if (FULLSCREEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="mb-4 rounded-none border border-primary/25 bg-primary/[0.06] px-4 py-3 flex gap-3 items-start">
      <div className="mt-0.5 shrink-0 text-primary">
        <BuildingOffice2Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="text-left space-y-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary/90">School workspace</p>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          This portal is focused on <span className="text-foreground font-semibold">your school only</span>:
          students, classes, delivery progress, billing, schedules, and records tied to your campus. Platform-wide
          controls stay with Rillcod staff.
        </p>
      </div>
    </div>
  );
}
