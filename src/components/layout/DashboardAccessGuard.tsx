'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';

/**
 * Redirects students and parents away from staff-only dashboard routes.
 * Defence in depth alongside nav hiding and API checks.
 */
export default function DashboardAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, profileLoading } = useAuth();
  const lastRedirectRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || profileLoading || !profile?.role) return;
    if (!pathname?.startsWith('/dashboard')) return;

    if (!isDashboardPathBlockedForRole(pathname, profile.role)) {
      lastRedirectRef.current = null;
      return;
    }

    const target = '/dashboard';
    if (lastRedirectRef.current === pathname) return;
    lastRedirectRef.current = pathname;
    router.replace(target);
  }, [pathname, profile?.role, loading, profileLoading, router]);

  if (!loading && !profileLoading && profile?.role && isDashboardPathBlockedForRole(pathname, profile.role)) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" aria-hidden />
        <p className="text-sm text-muted-foreground">Opening your dashboard…</p>
      </div>
    );
  }

  return <>{children}</>;
}
