import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Canonical student login generator — `mike123@rillcod.com` style.
 *
 * Single source of truth for student portal logins across every flow
 * (manual activation, student approval, summer-school onboarding). Matches the
 * `bulk-register` tool's `makeEmail` convention: first name + 3 random digits,
 * but DB-backed so uniqueness is guaranteed against `portal_users`.
 *
 * Idempotency note: the address is non-deterministic, so callers must persist
 * the result (e.g. onto `students.student_email`) and reuse it on re-runs rather
 * than regenerating — otherwise a second run would mint a new account.
 */

type AnySupabase = SupabaseClient<any>;

const STUDENT_EMAIL_DOMAIN = 'rillcod.com';

/** First-name slug used as the email base (lowercased, alphanumeric only). */
export function studentEmailBase(fullName: string | null | undefined): string {
  return (fullName || 'student').trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'student';
}

export async function generateUniqueStudentLoginEmail(
  admin: AnySupabase,
  fullName: string | null | undefined,
): Promise<string> {
  const base = studentEmailBase(fullName);
  for (let attempt = 0; attempt < 12; attempt++) {
    const digits = Math.floor(100 + Math.random() * 900); // 3-digit suffix
    const candidate = `${base}${digits}@${STUDENT_EMAIL_DOMAIN}`;
    const { data } = await admin.from('portal_users').select('id').eq('email', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely fallback — timestamp tail guarantees uniqueness.
  return `${base}${Date.now().toString().slice(-6)}@${STUDENT_EMAIL_DOMAIN}`;
}
