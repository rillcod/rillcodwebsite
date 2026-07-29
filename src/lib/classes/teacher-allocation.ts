type DbClient = { from: (table: string) => any };

export type TeacherCandidate = {
  id: string;
  full_name?: string | null;
  school_id?: string | null;
  is_active?: boolean | null;
  is_deleted?: boolean | null;
};

export function chooseLeastLoadedTeacher(
  candidates: TeacherCandidate[],
  classLoads: Record<string, number>,
): TeacherCandidate | null {
  return [...candidates]
    .filter((teacher) => teacher.is_active !== false && teacher.is_deleted !== true)
    .sort((a, b) => {
      const byLoad = (classLoads[a.id] ?? 0) - (classLoads[b.id] ?? 0);
      if (byLoad) return byLoad;
      const byName = String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''));
      return byName || a.id.localeCompare(b.id);
    })[0] ?? null;
}

/**
 * Deterministic, load-aware teacher allocation. Manual class ownership always wins;
 * this is only used when a class genuinely has no valid owner.
 */
export async function selectAutomaticClassTeacher(
  db: DbClient,
  schoolId: string,
): Promise<TeacherCandidate | null> {
  const [{ data: assignments, error: assignmentError }, { data: primary, error: primaryError }] =
    await Promise.all([
      db.from('teacher_schools').select('teacher_id').eq('school_id', schoolId),
      db.from('portal_users')
        .select('id,full_name,school_id,is_active,is_deleted')
        .eq('role', 'teacher')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .eq('is_deleted', false),
    ]);
  if (assignmentError) throw new Error(`Could not read teacher assignments: ${assignmentError.message}`);
  if (primaryError) throw new Error(`Could not read school teachers: ${primaryError.message}`);

  const assignedIds = (assignments ?? []).map((row: any) => row.teacher_id).filter(Boolean);
  const { data: assignedTeachers, error: teachersError } = assignedIds.length
    ? await db.from('portal_users')
        .select('id,full_name,school_id,is_active,is_deleted')
        .in('id', assignedIds)
        .eq('role', 'teacher')
        .eq('is_active', true)
        .eq('is_deleted', false)
    : { data: [], error: null };
  if (teachersError) throw new Error(`Could not verify assigned teachers: ${teachersError.message}`);

  const byId = new Map<string, TeacherCandidate>();
  for (const teacher of [...(primary ?? []), ...(assignedTeachers ?? [])]) byId.set(teacher.id, teacher);
  const candidates = [...byId.values()];
  if (!candidates.length) return null;

  const { data: owned, error: loadError } = await db
    .from('classes')
    .select('teacher_id')
    .in('teacher_id', candidates.map((teacher) => teacher.id))
    .or('status.is.null,status.neq.archived');
  if (loadError) throw new Error(`Could not calculate teacher workload: ${loadError.message}`);

  const loads: Record<string, number> = {};
  for (const row of owned ?? []) {
    if (row.teacher_id) loads[row.teacher_id] = (loads[row.teacher_id] ?? 0) + 1;
  }
  return chooseLeastLoadedTeacher(candidates, loads);
}
