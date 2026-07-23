import type { SupabaseClient } from '@supabase/supabase-js';
import { accessCardCodeMatchesStudent, isStudentPortalUuid, normalizeAccessCardCode } from '@/lib/access-card-code';

type AnySupabase = SupabaseClient<any>;

/** Hash-scan fallback when result_access_codes cache is cold. */
async function resolveStudentByAccessCodeHash(admin: AnySupabase, normalizedRc: string): Promise<string | null> {
  const matches: string[] = [];
  for (let from = 0; matches.length < 2; from += 1000) {
    const { data, error } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'student')
      .neq('is_deleted', true)
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const row of data) {
      const id = String(row.id);
      if (accessCardCodeMatchesStudent(normalizedRc, id)) matches.push(id);
      if (matches.length > 1) return null;
    }
    if (data.length < 1000) break;
  }
  return matches.length === 1 ? matches[0] : null;
}

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

  // Oldest cards: QR encoded the student's portal UUID directly (/verify/<uuid>).
  const portalUuid = isStudentPortalUuid(code);
  if (portalUuid) {
    const { data: student } = await admin
      .from('portal_users')
      .select('id')
      .eq('id', portalUuid)
      .eq('role', 'student')
      .neq('is_deleted', true)
      .maybeSingle();
    if (student?.id) return student.id as string;
  }

  const { data: rep } = await admin
    .from('student_progress_reports').select('student_id').eq('verification_code', c).maybeSingle();
  if (rep?.student_id) return rep.student_id as string;

  const { data: card } = await admin
    .from('identity_cards').select('holder_id, holder_type').eq('verification_code', c).maybeSingle();
  if (card?.holder_id && card.holder_type === 'student') return card.holder_id as string;

  const { data: cardByNumber } = await admin
    .from('identity_cards').select('holder_id, holder_type').eq('card_number', c).maybeSingle();
  if (cardByNumber?.holder_id && cardByNumber.holder_type === 'student') return cardByNumber.holder_id as string;

  const rc = normalizeAccessCardCode(code);
  if (rc && rc.startsWith('RC-')) {
    const { data: rac } = await admin
      .from('result_access_codes').select('student_id, access_code').eq('access_code', rc).maybeSingle();
    if (rac?.student_id) return rac.student_id as string;

    // Cache may still hold legacy code while user typed new numeric — try hash match.
    const viaHash = await resolveStudentByAccessCodeHash(admin, rc);
    if (viaHash) return viaHash;
  }

  return null;
}
