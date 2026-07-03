import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Resolve a student's portal_users.id from a verification code — accepts either a
 * report code (student_progress_reports.verification_code) or an ID-card code
 * (identity_cards.verification_code for a student holder). One entry point so every
 * scan (result card OR access card) funnels through the same identity resolution.
 */
export async function resolveStudentFromCode(admin: AnySupabase, code: string): Promise<string | null> {
  const c = (code || '').trim().toUpperCase();
  if (!c) return null;

  const { data: rep } = await admin
    .from('student_progress_reports').select('student_id').eq('verification_code', c).maybeSingle();
  if (rep?.student_id) return rep.student_id as string;

  const { data: card } = await admin
    .from('identity_cards').select('holder_id, holder_type').eq('verification_code', c).maybeSingle();
  if (card?.holder_id && card.holder_type === 'student') return card.holder_id as string;

  return null;
}
