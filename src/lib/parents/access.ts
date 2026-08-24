import type { SupabaseClient, User } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type ActiveParentProfile = {
  id: string;
  role: 'parent';
  email: string | null;
  full_name: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
};

export type ParentAccessFailureCode =
  | 'authentication_required'
  | 'session_unavailable'
  | 'account_unavailable'
  | 'parent_required'
  | 'account_inactive';

export type ParentAccessResult =
  | { ok: true; user: User; profile: ActiveParentProfile }
  | { ok: false; code: ParentAccessFailureCode; error: string; status: 401 | 403 | 503 };

/**
 * Canonical server-side entrance gate for every signed-in parent experience.
 *
 * Authentication is always verified with the request-bound client. The profile
 * may be read through an admin client so an RLS/configuration problem cannot
 * masquerade as a missing parent, but the lookup remains scoped to the verified
 * auth user id.
 */
export async function requireActiveParent(
  authClient: AnySupabase,
  profileClient: AnySupabase = authClient,
): Promise<ParentAccessResult> {
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: 'authentication_required',
      error: 'Please sign in to continue.',
      status: 401,
    };
  }
  if (authError) {
    console.error('[parent-access] session verification failed:', authError);
    return {
      ok: false,
      code: 'session_unavailable',
      error: 'Your account could not be verified right now. Please try again.',
      status: 503,
    };
  }

  const { data: profile, error: profileError } = await profileClient
    .from('portal_users')
    .select('id,role,email,full_name,is_active,is_deleted')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[parent-access] profile verification failed:', profileError);
    return {
      ok: false,
      code: 'account_unavailable',
      error: 'Your parent account could not be checked right now. Please try again.',
      status: 503,
    };
  }
  if (!profile || profile.role !== 'parent') {
    return {
      ok: false,
      code: 'parent_required',
      error: 'This area is for parent accounts.',
      status: 403,
    };
  }
  if (profile.is_active === false || profile.is_deleted === true) {
    return {
      ok: false,
      code: 'account_inactive',
      error: 'This parent account is not active. Contact your school for help.',
      status: 403,
    };
  }

  return {
    ok: true,
    user,
    profile: profile as ActiveParentProfile,
  };
}
