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
  if (!cls.school_id || !assignedSchoolIds.includes(cls.school_id)) return false;
  return includeAllAssignedClasses || cls.teacher_id === teacherId || cls.teacher_id === null;
}

/**
 * Resolve the teacher's class boundary once for every consuming API.
 * Isolation ON: owned classes plus unowned classes in assigned schools.
 * Isolation OFF: every class in assigned schools.
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
  if (assignedSchoolIds.length === 0) {
    return { assignedSchoolIds, classIds: [], classNames: [] };
  }

  const { data, error: classError } = await admin
    .from('classes')
    .select('id, name, teacher_id, school_id')
    .in('school_id', assignedSchoolIds);
  if (classError) throw classError;
  const classes = ((data ?? []) as ScopedClass[]).filter((cls) =>
    isTeacherClassVisible(cls, teacherId, assignedSchoolIds, includeAllAssignedClasses)
  );

  return {
    assignedSchoolIds,
    classIds: classes.map((row) => row.id),
    classNames: classes.map((row) => row.name).filter(Boolean) as string[],
  };
}
