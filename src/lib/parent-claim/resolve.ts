import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAccessCardCode } from '@/lib/access-card-code';

type AnySupabase = SupabaseClient<any>;

/**
 * Resolve a student's portal_users.id from any scannable code — a report code
 * (student_progress_reports.verification_code), an ID-card code
 * (identity_cards.verification_code), OR a result-access code (RC-… via
 * result_access_codes). One entry point so every QR funnels through the same identity
 * resolution and the parent claim works from every surface.
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

  // Backward-compat: OLDER cards printed the card_number (CARD-…) as their scannable code
  // instead of the verification_code. Resolve those too so legacy cards still open results.
  const { data: cardByNumber } = await admin
    .from('identity_cards').select('holder_id, holder_type').eq('card_number', c).maybeSingle();
  if (cardByNumber?.holder_id && cardByNumber.holder_type === 'student') return cardByNumber.holder_id as string;

  // Result-access (RC-…) code — resolves the scanned child on the /result-check page.
  const rc = normalizeAccessCardCode(code);
  if (rc) {
    const { data: rac } = await admin
      .from('result_access_codes').select('student_id').eq('access_code', rc).maybeSingle();
    if (rac?.student_id) return rac.student_id as string;
  }

  return null;
}
