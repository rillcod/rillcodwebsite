import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { determineRolloutStatus } from '@/lib/curriculum/governance';

export type GovernanceActor = {
  id: string;
  role: string;
  school_id: string | null;
};

export async function requireGovernanceActor(): Promise<GovernanceActor | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role ?? '')) return null;
  return data as GovernanceActor;
}

export async function actorSchoolIds(actor: GovernanceActor): Promise<string[]> {
  if (actor.role === 'admin') return [];
  if (actor.role === 'teacher') return getTeacherSchoolIds(actor.id, actor.school_id);
  return actor.school_id ? [actor.school_id] : [];
}

type RolloutSchool = {
  school_id: string;
  school_name: string;
  adoption_id: string | null;
  current_release_id: string | null;
  auto_update: boolean;
  adoption_status: string | null;
  active_plan_count: number;
  rollout_status: 'eligible' | 'skipped' | 'conflict';
  reason: string;
};

export async function previewCurriculumRollout(input: {
  releaseId: string;
  schoolIds?: string[];
}): Promise<{
  release: Record<string, unknown>;
  schools: RolloutSchool[];
  summary: { eligible: number; skipped: number; conflict: number; protected_active_plans: number };
}> {
  const db: any = createAdminClient();
  const { data: release, error } = await db
    .from('academic_curriculum_releases')
    .select('id, course_id, release_number, title, status, courses(program_id, title)')
    .eq('id', input.releaseId)
    .maybeSingle();
  if (error || !release) throw new Error('Published curriculum release not found.');
  if (release.status !== 'published') throw new Error('Only published releases can be rolled out.');

  const course = Array.isArray(release.courses) ? release.courses[0] : release.courses;
  const programId = course?.program_id ?? null;
  const schoolSet = new Set<string>();
  if (programId) {
    const { data: classes } = await db.from('classes').select('school_id').eq('program_id', programId);
    for (const row of classes ?? []) if (row.school_id) schoolSet.add(row.school_id);
  }
  const { data: existingCurricula } = await db
    .from('course_curricula')
    .select('school_id')
    .eq('course_id', release.course_id)
    .not('school_id', 'is', null);
  for (const row of existingCurricula ?? []) if (row.school_id) schoolSet.add(row.school_id);
  const { data: existingAdoptions } = await db
    .from('academic_curriculum_adoptions')
    .select('id, school_id, release_id, auto_update, status')
    .eq('course_id', release.course_id);
  for (const row of existingAdoptions ?? []) if (row.school_id) schoolSet.add(row.school_id);

  const requested = input.schoolIds?.length ? new Set(input.schoolIds) : null;
  const schoolIds = Array.from(schoolSet);
  const [{ data: schools }, { data: activePlans }] = await Promise.all([
    schoolIds.length
      ? db.from('schools').select('id, name').in('id', schoolIds)
      : Promise.resolve({ data: [] }),
    schoolIds.length
      ? db.from('lesson_plans').select('id, school_id').eq('course_id', release.course_id).neq('status', 'archived').in('school_id', schoolIds)
      : Promise.resolve({ data: [] }),
  ]);
  const planCount = new Map<string, number>();
  for (const plan of activePlans ?? []) {
    if (plan.school_id) planCount.set(plan.school_id, (planCount.get(plan.school_id) ?? 0) + 1);
  }
  const adoptionMap = new Map((existingAdoptions ?? []).map((row: any) => [row.school_id, row]));
  const nameMap = new Map<string, string>((schools ?? []).map((row: any) => [String(row.id), String(row.name ?? 'Unnamed school')]));

  const rows: RolloutSchool[] = schoolIds.map((schoolId) => {
    const adoption: any = adoptionMap.get(schoolId);
    const decision = determineRolloutStatus({
      autoUpdate: adoption?.auto_update !== false,
      adoptionStatus: adoption?.status ?? null,
      requested: requested ? requested.has(schoolId) : true,
    });
    return {
      school_id: schoolId,
      school_name: nameMap.get(schoolId) ?? 'Unnamed school',
      adoption_id: adoption?.id ?? null,
      current_release_id: adoption?.release_id ?? null,
      auto_update: adoption?.auto_update !== false,
      adoption_status: adoption?.status ?? null,
      active_plan_count: planCount.get(schoolId) ?? 0,
      rollout_status: decision.status,
      reason: decision.reason,
    };
  }).sort((a, b) => a.school_name.localeCompare(b.school_name));

  return {
    release,
    schools: rows,
    summary: {
      eligible: rows.filter((row) => row.rollout_status === 'eligible').length,
      skipped: rows.filter((row) => row.rollout_status === 'skipped').length,
      conflict: rows.filter((row) => row.rollout_status === 'conflict').length,
      protected_active_plans: rows.reduce((sum, row) => sum + row.active_plan_count, 0),
    },
  };
}

export async function applyCurriculumRollout(input: {
  releaseId: string;
  schoolIds?: string[];
  actorId: string;
}) {
  const db: any = createAdminClient();
  const preview = await previewCurriculumRollout({
    releaseId: input.releaseId,
    schoolIds: input.schoolIds,
  });
  const release = preview.release as { id: string; course_id: string };
  const applied: RolloutSchool[] = [];

  for (const school of preview.schools) {
    if (school.rollout_status !== 'eligible') continue;
    const payload = {
      school_id: school.school_id,
      course_id: release.course_id,
      release_id: release.id,
      previous_release_id: school.current_release_id,
      status: 'active',
      auto_update: true,
      adopted_by: input.actorId,
      adopted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: adoption, error } = await db
      .from('academic_curriculum_adoptions')
      .upsert(payload, { onConflict: 'school_id,course_id' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    await db.from('academic_curriculum_rollout_events').insert({
      release_id: release.id,
      school_id: school.school_id,
      adoption_id: adoption.id,
      previous_release_id: school.current_release_id,
      status: 'applied',
      reason: 'Adopted for future class-term plans; active plans preserved.',
      impact: {
        protected_active_plans: school.active_plan_count,
        changes_existing_plans: false,
      },
      actor_id: input.actorId,
    });
    applied.push(school);
  }
  return { ...preview, applied_count: applied.length };
}
