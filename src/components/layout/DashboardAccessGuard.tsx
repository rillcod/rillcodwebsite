'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';
import RouteDeniedNotice from '@/components/access/RouteDeniedNotice';

/**
 * Redirects students, parents, and school users away from routes their role must not use.
 * Defence in depth alongside nav hiding, middleware, and API / RLS.
 * Also blocks mid-session access when school/class structure is missing.
 */
export default function DashboardAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, profileLoading } = useAuth();
  const lastRedirectRef = useRef<string | null>(null);
  const hasLoggedSessionRef = useRef(false);

  const needsSchool =
    !!profile &&
    ['student', 'parent', 'teacher', 'school'].includes(profile.role) &&
    !profile.school_id;
  const needsClass = !!profile && profile.role === 'student' && !profile.class_id;
  const pendingPlacement = needsSchool || needsClass;
  const structureBlocked = !!profile && (!profile.is_active || pendingPlacement);
  const profileMissing = !loading && !profileLoading && !profile;

  useEffect(() => {
    if (loading || profileLoading || !profile?.id || structureBlocked) return;
    if (hasLoggedSessionRef.current) return;
    hasLoggedSessionRef.current = true;

    // Track active session (inside dashboard) for logged-in users
    (async () => {
      try {
        const { isCapacitorNative } = await import('@/lib/capacitor/platform');
        const isNative = isCapacitorNative();
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();

        // 1. Log session activity in crm_interactions
        await supabase.from('crm_interactions').insert({
          contact_id:   profile.id,
          contact_name: profile.full_name || profile.email || 'User',
          contact_type: profile.role === 'parent' ? 'parent' : profile.role === 'student' ? 'student' : 'staff',
          type:         'session_active',
          direction:    'inbound',
          content:      isNative
            ? 'Opened the dashboard from the native Android mobile application.'
            : 'Opened the dashboard from the web browser.',
          created_at:   new Date().toISOString(),
        });

        // 2. Update user profile metadata. Merged in the database rather than
        // read-modify-written from `profile`, whose metadata snapshot predates the
        // login page's write — spreading it here wiped the login keys every time.
        const activePlatform = isNative ? 'Android App' : 'Web Browser';
        await supabase.rpc('merge_my_metadata' as never, {
          patch: {
            last_active_platform: activePlatform,
            last_active_at: new Date().toISOString(),
          },
          increment_keys: [isNative ? 'app_session_count' : 'web_session_count'],
        } as never);

      } catch (err) {
        console.error('Failed to log active session audit:', err);
      }
    })();
  }, [profile, loading, profileLoading, structureBlocked]);

  useEffect(() => {
    if (loading || profileLoading || !profile?.role || structureBlocked) return;
    if (!pathname?.startsWith('/dashboard')) return;

    if (!isDashboardPathBlockedForRole(pathname, profile.role)) {
      lastRedirectRef.current = null;
      return;
    }

    const target = '/dashboard';
    if (lastRedirectRef.current === pathname) return;
    lastRedirectRef.current = pathname;
    router.replace(target);
  }, [pathname, profile?.role, loading, profileLoading, router, structureBlocked]);

  if (profileMissing) {
    return (
      <RouteDeniedNotice
        title="Account details unavailable"
        body="We could not safely confirm your account and permissions. Sign in again; if this continues, contact your school or Rillcod support."
        homeHref="/login?clear=1"
        actionLabel="Return to sign in"
      />
    );
  }

  if (!loading && !profileLoading && structureBlocked) {
    return (
      <RouteDeniedNotice
        title={pendingPlacement ? 'Account pending placement' : 'Account deactivated'}
        body={
          needsClass
            ? 'Your account needs a class assignment before you can use the portal. Ask your school or teacher to place you in a class.'
            : needsSchool
              ? 'Your account needs a school assignment before you can use the portal. Ask your school or admin to assign your school.'
              : 'Your account has been deactivated. Please contact support.'
        }
      />
    );
  }

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
