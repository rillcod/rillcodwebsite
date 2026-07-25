import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type StaffBypassResult = {
  bypass: boolean;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
};

const NONE: StaffBypassResult = { bypass: false, actorId: null, actorName: null, actorRole: null };

/** Logged-in admin / teacher / school staff may bypass the public parent result gate. */
export async function resolveStaffResultBypass(db: AnySupabase): Promise<StaffBypassResult> {
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NONE;
    const { data: profile } = await db
      .from('portal_users')
      .select('role, is_active, full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.is_active) return NONE;
    const role = String(profile.role || '');
    if (!['admin', 'teacher', 'school'].includes(role)) return NONE;
    return {
      bypass: true,
      actorId: user.id,
      actorName: (profile.full_name || '').trim() || null,
      actorRole: role,
    };
  } catch {
    return NONE;
  }
}
