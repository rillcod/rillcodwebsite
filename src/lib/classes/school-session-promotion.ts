import type { SupabaseClient } from '@supabase/supabase-js';
import { summarisePromotionPlan } from '@/lib/classes/class-promotion';
import {
  applyIntelligentPromotionPlan,
  buildSmartPromotionPlan,
  loadPromotionContext,
  parseSmartPromotionOptions,
  resyncSourceClassCount,
} from '@/lib/classes/promotion-server';
import {
  activeSessionTrackIds,
  classEligibleForSessionTrack,
  mergeTrackDue,
  resolveSessionTrack,
  studentDueForSessionTrack,
  type PromotionDueSnapshot,
  type SchoolPromotionDueRow,
  type SchoolTrackDue,
  type SessionPromotionTrackId,
} from '@/lib/classes/promotion-due-intelligence';
import { inferClassGradeAnchor } from '@/lib/classes/class-promotion';
import type { IntelligentClassPromotionPlan, SmartPromotionOptions } from '@/lib/progression/enrich-class-promotion';
import type { PromotionContext } from '@/lib/classes/promotion-server';
import {
  resolveSchoolSessionPromotionPolicy,
  type SchoolSessionPromotionPolicy,
} from '@/lib/classes/session-promotion-policy';
import {
  loadPromotionRules,
  loadSchoolPromotionSettings,
  type PromotionSettings,
} from '@/lib/progression/promotion-settings';

export type SessionPromotionSlice = {
  class_id: string;
  class_name: string;
  due_students: number;
  plan: IntelligentClassPromotionPlan;
  ctx: PromotionContext;
};

export type SchoolSessionPromotionPlan = {
  track_id: SessionPromotionTrackId;
  track_label: string;
  track: ReturnType<typeof resolveSessionTrack>;
  policy: SchoolSessionPromotionPolicy;
  school_id: string;
  school_name: string | null;
  source_classes: Array<{ id: string; name: string | null; due_students: number }>;
  slices: SessionPromotionSlice[];
  total_promotable: number;
  total_skipped: number;
  total_held: number;
  programme_transition_count: number;
  blocked: string[];
};

type ClassRow = {
  id: string;
  name: string | null;
  school_id: string | null;
  program_id: string | null;
  term_id: string | null;
  teacher_id: string | null;
  qa_grade_key: string | null;
  qa_grade_band: string | null;
  current_students: number | null;
  program_name: string | null;
};

async function loadSchoolClasses(admin: SupabaseClient, schoolId: string): Promise<ClassRow[]> {
  const { data: rows } = await admin
    .from('classes')
    .select(
      'id, name, school_id, program_id, term_id, teacher_id, qa_grade_key, qa_grade_band, current_students, status, programs:program_id(name)',
    )
    .eq('school_id', schoolId)
    .neq('status', 'archived');

  return (rows ?? []).map((row) => {
    const prog = (row as { programs?: { name?: string | null } | null }).programs;
    const program_name = prog && typeof prog === 'object' && 'name' in prog ? prog.name ?? null : null;
    return {
      id: row.id,
      name: row.name,
      school_id: row.school_id,
      program_id: row.program_id,
      term_id: row.term_id,
      teacher_id: row.teacher_id,
      qa_grade_key: row.qa_grade_key,
      qa_grade_band: row.qa_grade_band,
      current_students: row.current_students,
      program_name,
    };
  });
}

function mapClassRow(row: ClassRow) {
  return {
    qa_grade_key: row.qa_grade_key,
    qa_grade_band: row.qa_grade_band,
    name: row.name,
    program_name: row.program_name,
  };
}

/** Count learners at exit grade per track — no smart gates. */
export async function scanSchoolPromotionDue(
  admin: SupabaseClient,
  schoolId: string,
  schoolName: string | null,
  preloadedSettings?: PromotionSettings,
): Promise<SchoolPromotionDueRow> {
  const classes = await loadSchoolClasses(admin, schoolId);
  const globalSettings = preloadedSettings ?? await loadPromotionRules(admin);
  const settings = await loadSchoolPromotionSettings(admin, schoolId, globalSettings);
  const policy = resolveSchoolSessionPromotionPolicy(settings);
  const tracks: SchoolTrackDue[] = [];

  for (const trackId of activeSessionTrackIds(policy)) {
    const track = resolveSessionTrack(trackId, policy);
    const candidates = classes.filter((c) => classEligibleForSessionTrack(trackId, mapClassRow(c)));
    let due_count = 0;
    let class_count = 0;

    for (const candidate of candidates) {
      const ctx = await loadPromotionContext(admin, candidate.id, undefined, settings);
      if ('error' in ctx) continue;
      const anchor = inferClassGradeAnchor(ctx.sourceClass);
      const due = ctx.students.filter((s) => studentDueForSessionTrack(trackId, s, anchor, policy));
      if (due.length > 0) {
        due_count += due.length;
        class_count += 1;
      }
    }

    if (due_count > 0) {
      tracks.push({ track_id: trackId, short_label: track.short_label, due_count, class_count });
    }
  }

  return {
    school_id: schoolId,
    school_name: schoolName,
    young_to_teen_exit_grade: policy.young_to_teen_exit_grade,
    tracks,
  };
}

export async function scanPromotionDueForSchools(
  admin: SupabaseClient,
  schoolIds: string[],
): Promise<PromotionDueSnapshot> {
  const rows: SchoolPromotionDueRow[] = [];
  const settings = await loadPromotionRules(admin);
  for (const schoolId of schoolIds) {
    const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
    rows.push(await scanSchoolPromotionDue(admin, schoolId, school?.name ?? null, settings));
  }
  return mergeTrackDue(rows);
}

export async function buildSchoolSessionPromotionPlan(
  admin: SupabaseClient,
  schoolId: string,
  trackId: SessionPromotionTrackId,
  smartOpts: SmartPromotionOptions,
): Promise<SchoolSessionPromotionPlan | { error: string }> {
  let settings: PromotionSettings;
  try {
    const globalSettings = await loadPromotionRules(admin);
    settings = await loadSchoolPromotionSettings(admin, schoolId, globalSettings);
  } catch {
    return { error: 'Promotion policy is unavailable. No learner was moved.' };
  }
  const policy = resolveSchoolSessionPromotionPolicy(settings);
  if (!activeSessionTrackIds(policy).includes(trackId)) {
    return { error: 'This promotion track is not used by this school.' };
  }
  const track = resolveSessionTrack(trackId, policy);
  const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
  if (!school) return { error: 'School not found' };

  const classes = await loadSchoolClasses(admin, schoolId);
  const candidates = classes.filter((c) => classEligibleForSessionTrack(trackId, mapClassRow(c)));

  if (!candidates.length) {
    return {
      track_id: trackId,
      track_label: track.label,
      track,
      policy,
      school_id: schoolId,
      school_name: school.name ?? null,
      source_classes: [],
      slices: [],
      total_promotable: 0,
      total_skipped: 0,
      total_held: 0,
      programme_transition_count: 0,
      blocked: [`No ${track.short_label} classes at this school.`],
    };
  }

  const slices: SessionPromotionSlice[] = [];
  const blocked = new Set<string>();

  for (const candidate of candidates) {
    const ctx = await loadPromotionContext(admin, candidate.id, undefined, settings);
    if ('error' in ctx) continue;

    const classAnchor = inferClassGradeAnchor(ctx.sourceClass);
    const dueStudents = ctx.students.filter((s) =>
      studentDueForSessionTrack(trackId, s, classAnchor, policy),
    );
    if (!dueStudents.length) continue;

    const filteredCtx = { ...ctx, students: dueStudents };
    const plan = await buildSmartPromotionPlan(admin, filteredCtx, null, smartOpts);
    for (const reason of plan.blocked) blocked.add(reason);
    if (plan.promotable_count === 0) continue;

    slices.push({
      class_id: candidate.id,
      class_name: candidate.name ?? 'Class',
      due_students: dueStudents.length,
      plan,
      ctx: filteredCtx,
    });
  }

  const total_promotable = slices.reduce((n, s) => n + s.plan.promotable_count, 0);
  const total_skipped = slices.reduce((n, s) => n + s.plan.skipped_count, 0);
  const programme_transition_count = slices.reduce((n, s) => n + s.plan.programme_transition_count, 0);
  const total_held = slices.reduce((n, s) => n + (s.plan.intelligence?.hold ?? 0), 0);

  if (!slices.length) {
    blocked.add(`No ${track.exit_grade} learners ready for ${track.short_label} at this school.`);
  }

  return {
    track_id: trackId,
    track_label: track.label,
    track,
    policy,
    school_id: schoolId,
    school_name: school.name ?? null,
    source_classes: slices.map((s) => ({
      id: s.class_id,
      name: s.class_name,
      due_students: s.due_students,
    })),
    slices,
    total_promotable,
    total_skipped,
    total_held,
    programme_transition_count,
    blocked: [...blocked],
  };
}

export function summariseSessionPromotionPlan(plan: SchoolSessionPromotionPlan) {
  return {
    track_id: plan.track_id,
    school_id: plan.school_id,
    source_class_count: plan.source_classes.length,
    total_promotable: plan.total_promotable,
    total_held: plan.total_held,
    programme_transitions: plan.programme_transition_count,
  };
}

export async function applySchoolSessionPromotionPlan(
  admin: SupabaseClient,
  plan: SchoolSessionPromotionPlan,
  caller: { id: string; role: string },
) {
  const results: Array<{
    class_id: string;
    class_name: string;
    promoted: number;
    failed: Array<{ student_id: string; error?: string }>;
  }> = [];

  for (const slice of plan.slices) {
    if (slice.plan.promotable_count === 0) continue;
    const outcome = await applyIntelligentPromotionPlan(admin, slice.ctx, slice.plan, caller, {
      forceCrossTeacher: true,
    });
    await resyncSourceClassCount(admin, slice.class_id);
    results.push({
      class_id: slice.class_id,
      class_name: slice.class_name,
      promoted: outcome.filter((r) => r.ok).length,
      failed: outcome.filter((r) => !r.ok).map((r) => ({ student_id: r.student_id, error: r.error })),
    });
  }

  return results;
}

export { summarisePromotionPlan };
