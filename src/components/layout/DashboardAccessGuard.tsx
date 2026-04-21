'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';
import RouteDeniedNotice from '@/components/access/RouteDeniedNotice';

/**
 * Redirects students, parents, and partner schools away from routes their role must not use.
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
        title={isSchool ? 'Partner school access only' : 'This area is not available for your account'}
        body={
          isSchool
            ? 'This page is for Rillcod platform staff or teachers. Your workspace is limited to your school’s students, classes, schedules, and billing. Use the sidebar or return to your dashboard.'
            : 'You were redirected because this page is reserved for a different role. Use the menu or go back to your dashboard.'
        }
      />
    );
  }

  return <>{children}</>;
}
