import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parentContactCompletionPath,
  parentPortalContactGaps,
} from '@/lib/parents/contact';
import { googleDisplayName } from '@/lib/auth/google-identity';

export type ParentGoogleResolveResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

type GoogleAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/**
 * After Google OAuth, only allow an existing parent portal account (same email / id)
 * with a school assignment. Never create parents from Google alone.
 * Google may backfill name/email only — phone and other key fields stay required.
 */
export async function resolveParentGoogleLogin(
  admin: SupabaseClient,
  authUser: GoogleAuthUser,
  redirectTo = '/dashboard',
): Promise<ParentGoogleResolveResult> {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Google did not return an email. Use a Google account with an email address.' };
  }

  // Prefer exact auth id match (auto-linked identities), then email.
  let { data: portal } = await admin
    .from('portal_users')
    .select('id, role, school_id, is_active, is_deleted, email, full_name, phone')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!portal) {
    const byEmail = await admin
      .from('portal_users')
      .select('id, role, school_id, is_active, is_deleted, email, full_name, phone')
      .eq('email', email)
      .maybeSingle();
    portal = byEmail.data;
  }

  if (!portal || portal.is_deleted) {
    return {
      ok: false,
      error: 'No Rillcod parent account for this Google email. Ask your school to invite this email first.',
    };
  }

  if (portal.role !== 'parent') {
    return {
      ok: false,
      error: `This email is registered as a ${portal.role} account, not a parent. Sign in with the correct role.`,
    };
  }

  if (portal.id !== authUser.id) {
    // Auth email uniqueness should normally auto-link; if IDs diverge, refuse rather than merge blindly.
    return {
      ok: false,
      error:
        'This Google email matches a parent account created with a password. Sign in once with your email and temporary password from your school, then try Google again.',
    };
  }

  if (!portal.school_id) {
    return {
      ok: false,
      error: 'Your parent account is pending school placement. Ask your school or admin to assign your school.',
    };
  }

  if (!portal.is_active) {
    return {
      ok: false,
      error: 'Your parent account is inactive. Please contact support.',
    };
  }

  // Google may fill name only when the school left it blank — never invent phone or other form fields.
  const googleName = googleDisplayName(authUser);
  let fullName = portal.full_name;
  if (googleName && !(fullName ?? '').trim()) {
    await admin
      .from('portal_users')
      .update({ full_name: googleName, updated_at: new Date().toISOString() })
      .eq('id', portal.id);
    fullName = googleName;
  }

  if (parentPortalContactGaps({ full_name: fullName, phone: portal.phone }).length > 0) {
    return { ok: true, redirectTo: parentContactCompletionPath(redirectTo) };
  }

  return { ok: true, redirectTo };
}
