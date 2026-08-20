import type { SupabaseClient } from '@supabase/supabase-js';
import type { YoungToTeenExitGrade } from '@/lib/classes/programme-transition';
import {
  DEFAULT_PROMOTION_RULES,
  type PromotionEvidence,
  type PromotionRules,
} from '@/lib/progression/promotion-intelligence';

export type PromotionSettings = PromotionRules & {
  young_to_teen_exit_grade?: YoungToTeenExitGrade;
};

export function schoolPromotionSettingsKey(schoolId: string): string {
  return `lms.ops.promotion.school.${schoolId}`;
}

export async function loadPromotionRules(db: SupabaseClient): Promise<PromotionSettings> {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'lms.ops.promotion')
    .maybeSingle();
  if (error) throw new Error(`Could not load promotion settings: ${error.message}`);
  if (!data?.value) return DEFAULT_PROMOTION_RULES;
  let settings: PromotionSettings;
  try {
    settings = { ...DEFAULT_PROMOTION_RULES, ...(JSON.parse(data.value) as PromotionSettings) };
  } catch {
    throw new Error('Promotion settings contain invalid JSON.');
  }
  if (
    settings.young_to_teen_exit_grade != null
    && settings.young_to_teen_exit_grade !== 'Basic 5'
    && settings.young_to_teen_exit_grade !== 'Basic 6'
  ) {
    throw new Error('Promotion settings have an invalid Young-to-Teen exit grade.');
  }
  return settings;
}

/** Merge one school's isolated override onto the global promotion rules. */
export async function loadSchoolPromotionSettings(
  db: SupabaseClient,
  schoolId: string,
  globalSettings?: PromotionSettings,
): Promise<PromotionSettings> {
  const global = globalSettings ?? await loadPromotionRules(db);
  if (!schoolId) return global;
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', schoolPromotionSettingsKey(schoolId))
    .maybeSingle();
  if (error) throw new Error(`Could not load this school's promotion policy: ${error.message}`);
  if (!data?.value) return global;
  let override: Partial<PromotionSettings>;
  try {
    override = JSON.parse(data.value) as Partial<PromotionSettings>;
  } catch {
    throw new Error('School promotion policy contains invalid JSON.');
  }
  if (
    override.young_to_teen_exit_grade != null
    && override.young_to_teen_exit_grade !== 'Basic 5'
    && override.young_to_teen_exit_grade !== 'Basic 6'
  ) {
    throw new Error('School promotion policy has an invalid exit grade.');
  }
  return { ...global, ...override };
}

/** Latest published report score + live-term attendance per learner. */
export async function loadPromotionEvidenceByStudent(
  db: SupabaseClient,
  studentIds: string[],
  termId?: string | null,
): Promise<Map<string, PromotionEvidence>> {
  const out = new Map<string, PromotionEvidence>();
  if (studentIds.length === 0) return out;

  for (const id of studentIds) {
    out.set(id, { overall_score: null, overall_grade: null, attendance_pct: null });
  }

  const { data: reports } = await db
    .from('student_progress_reports')
    .select('student_id, overall_score, overall_grade, report_date')
    .in('student_id', studentIds)
    .eq('is_published', true)
    .order('report_date', { ascending: false });

  for (const row of reports ?? []) {
    const sid = row.student_id as string;
    if (!sid || out.get(sid)?.overall_score != null) continue;
    const cur = out.get(sid)!;
    out.set(sid, {
      ...cur,
      overall_score: row.overall_score != null ? Number(row.overall_score) : null,
      overall_grade: row.overall_grade ?? null,
    });
  }

  let attQuery = db
    .from('attendance')
    .select('user_id, status, term_id')
    .in('user_id', studentIds);
  if (termId) {
    attQuery = attQuery.or(`term_id.eq.${termId},term_id.is.null`) as typeof attQuery;
  }
  const { data: attRows } = await attQuery;

  const attByUser = new Map<string, { present: number; total: number }>();
  for (const row of attRows ?? []) {
    const uid = row.user_id as string;
    if (termId && row.term_id && row.term_id !== termId) continue;
    const bucket = attByUser.get(uid) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (String(row.status).toLowerCase() === 'present') bucket.present += 1;
    attByUser.set(uid, bucket);
  }
  for (const [uid, bucket] of attByUser) {
    const cur = out.get(uid);
    if (!cur) continue;
    out.set(uid, {
      ...cur,
      attendance_pct: bucket.total > 0 ? Math.round((bucket.present / bucket.total) * 100) : null,
    });
  }

  return out;
}
