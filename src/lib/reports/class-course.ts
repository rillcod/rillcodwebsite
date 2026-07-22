/**
 * Report-facing helpers: server reconciliation + re-exports from canonical resolution.
 */
import {
  type ClassCourseLinkInput,
  type CourseCatalogRow,
  courseConflictsWithClassSection,
  reconcileCourseWithClassSection,
  resolveClassLinkedCourse,
  resolveLinkedCourseForClass,
} from '@/lib/courses/class-course-resolution';

export type ReportCourseOption = CourseCatalogRow;
export type { ClassCourseLinkInput };
export {
  courseConflictsWithClassSection,
  reconcileCourseWithClassSection,
  resolveClassLinkedCourse,
  resolveLinkedCourseForClass,
};

type AnyAdmin = {
  from: (table: string) => any;
};

export async function loadActiveCoursesForProgram(
  admin: AnyAdmin,
  programId?: string | null,
): Promise<CourseCatalogRow[]> {
  let query = admin.from('courses').select('id, title, program_id, is_active, programs(name)').eq('is_active', true);
  if (programId) query = query.eq('program_id', String(programId));
  const { data } = await query;
  return (data ?? []) as CourseCatalogRow[];
}

/** Server-side guard: align stale course fields with the learner's registered class. */
export async function reconcileReportCourseFromClassContext(
  admin: AnyAdmin,
  payload: {
    course_id?: string | null;
    course_name?: string | null;
    section_class?: string | null;
    student_id?: string | null;
    class_id?: string | null;
  },
): Promise<{ course_id?: string | null; course_name?: string | null }> {
  let classRow: ClassCourseLinkInput | null = null;
  const sectionClass = String(payload.section_class || '').trim();

  if (payload.class_id) {
    const { data: cls } = await admin
      .from('classes')
      .select('name, program_id, current_course_id, programs(name)')
      .eq('id', String(payload.class_id))
      .maybeSingle();
    if (cls) classRow = cls as ClassCourseLinkInput;
  } else if (payload.student_id) {
    const { data: student } = await admin
      .from('portal_users')
      .select('class_id')
      .eq('id', String(payload.student_id))
      .maybeSingle();
    const studentClassId = (student as { class_id?: string | null } | null)?.class_id;
    if (studentClassId) {
      const { data: cls } = await admin
        .from('classes')
        .select('name, program_id, current_course_id, programs(name)')
        .eq('id', String(studentClassId))
        .maybeSingle();
      if (cls) classRow = cls as ClassCourseLinkInput;
    }
  }

  if (!classRow && sectionClass) {
    classRow = { name: sectionClass };
  }
  if (!classRow) {
    return { course_id: payload.course_id ?? null, course_name: payload.course_name ?? null };
  }

  const programId = classRow.program_id
    || (payload.course_id
      ? (await admin.from('courses').select('program_id').eq('id', String(payload.course_id)).maybeSingle())
          .data?.program_id
      : null);
  const catalog = await loadActiveCoursesForProgram(admin, programId as string | null);
  const reconciled = reconcileCourseWithClassSection(
    {
      course_id: payload.course_id ?? null,
      course_name: payload.course_name ?? null,
    },
    sectionClass || classRow.name,
    catalog,
    classRow,
  );
  return {
    course_id: reconciled.course_id ?? null,
    course_name: reconciled.course_name ?? null,
  };
}
