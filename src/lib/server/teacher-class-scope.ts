import type { SupabaseClient } from '@supabase/supabase-js';

export type TeacherClassScope = {
  assignedSchoolIds: string[];
  classIds: string[];
  classNames: string[];
};

type ScopedClass = { id: string; name: string | null; teacher_id: string | null; school_id: string | null };

export function isTeacherClassVisible(
  cls: Pick<ScopedClass, 'teacher_id' | 'school_id'>,
  teacherId: string,
  assignedSchoolIds: string[],
  includeAllAssignedClasses = false,
): boolean {
  // Ownership always wins — even when school_id is missing or outside teacher_schools.
  // Otherwise newly created sections disappear from mine=true pickers.
  if (cls.teacher_id === teacherId) return true;

  if (!includeAllAssignedClasses) return false;
  if (!cls.school_id || !assignedSchoolIds.includes(cls.school_id)) return false;
  return true;
}

/**
 * Resolve the teacher's class boundary once for every consuming API.
 * Isolation ON: only classes owned by the teacher.
 * Isolation OFF: every class in assigned schools, plus any class they own.
 */
export async function getTeacherClassScope(
  admin: SupabaseClient<any>,
  teacherId: string,
  primarySchoolId?: string | null,
  includeAllAssignedClasses = false,
): Promise<TeacherClassScope> {
  const schoolIds = new Set<string>();
  if (primarySchoolId) schoolIds.add(primarySchoolId);

  const { data: assignments, error: assignmentError } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  if (assignmentError) throw assignmentError;
  for (const row of assignments ?? []) if (row.school_id) schoolIds.add(row.school_id);

  const assignedSchoolIds = [...schoolIds];
  const byId = new Map<string, ScopedClass>();

  if (assignedSchoolIds.length > 0) {
    const { data, error: classError } = await admin
      .from('classes')
      .select('id, name, teacher_id, school_id')
      .in('school_id', assignedSchoolIds);
    if (classError) throw classError;
    for (const row of (data ?? []) as ScopedClass[]) {
      if (row.id) byId.set(row.id, row);
    }
  }

  // Always include every class this teacher owns (null/other school_id included).
  const { data: owned, error: ownedError } = await admin
    .from('classes')
    .select('id, name, teacher_id, school_id')
    .eq('teacher_id', teacherId);
  if (ownedError) throw ownedError;
  for (const row of (owned ?? []) as ScopedClass[]) {
    if (row.id) byId.set(row.id, row);
  }

  const classes = [...byId.values()].filter((cls) =>
    isTeacherClassVisible(cls, teacherId, assignedSchoolIds, includeAllAssignedClasses),
  );

  return {
    assignedSchoolIds,
    classIds: classes.map((row) => row.id),
    classNames: classes.map((row) => row.name).filter(Boolean) as string[],
  };
}
