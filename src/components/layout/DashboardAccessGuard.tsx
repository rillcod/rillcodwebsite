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
  const hasLoggedSessionRef = useRef(false);

  useEffect(() => {
    if (loading || profileLoading || !profile?.id) return;
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

        // 2. Update user profile metadata
        const currentMeta = (profile.metadata as Record<string, any>) || {};
        const activePlatform = isNative ? 'Android App' : 'Web Browser';
        const updatedMeta = {
          ...currentMeta,
          last_active_platform: activePlatform,
          last_active_at: new Date().toISOString(),
          app_session_count: isNative 
            ? (Number(currentMeta.app_session_count || 0) + 1) 
            : Number(currentMeta.app_session_count || 0),
          web_session_count: !isNative 
            ? (Number(currentMeta.web_session_count || 0) + 1) 
            : Number(currentMeta.web_session_count || 0),
        };

        await supabase
          .from('portal_users')
          .update({ metadata: updatedMeta })
          .eq('id', profile.id);

      } catch (err) {
        console.error('Failed to log active session audit:', err);
      }
    })();
  }, [profile, loading, profileLoading]);

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
