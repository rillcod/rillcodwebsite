'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';
import RouteDeniedNotice from '@/components/access/RouteDeniedNotice';

/**
 * Redirects students, parents, and school users away from routes their role must not use.
 * Defence in depth alongside nav hiding, middleware, and API / RLS.
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
    const isSchool = profile.role === 'school';
    return (
      <RouteDeniedNotice
        title={isSchool ? 'School workspace limit' : 'This area is not available for your account'}
        body={
          isSchool
            ? 'This page is for Rillcod platform staff or assigned teachers. Your account is limited to your own school’s students, classes, schedules, delivery tracking, and billing records.'
            : 'You were redirected because this page is reserved for a different role. Use the menu or go back to your dashboard.'
        }
      />
    );
  }

  return <>{children}</>;
}
