import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type OfficeAdminActor = {
  user: { id: string };
  profile: { id: string; role: 'admin'; is_active: boolean; is_deleted: boolean };
  admin: ReturnType<typeof createAdminClient>;
};

/** Authenticated active platform administrator for Office Center routes. */
export async function getOfficeAdminActor(): Promise<OfficeAdminActor | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id,role,is_active,is_deleted')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.is_deleted || profile.role !== 'admin') return null;

  return {
    user,
    profile: profile as OfficeAdminActor['profile'],
    admin,
  };
}

export function officeAdminForbiddenResponse() {
  return { error: 'This page is for the office administrator.', status: 403 as const };
}

export function officeAdminUnauthorizedResponse() {
  return { error: 'Please sign in.', status: 401 as const };
}
