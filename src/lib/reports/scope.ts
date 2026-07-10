export type ReportCourseScopeInput = {
  actorId: string;
  courseTeacherId?: string | null;
  courseProgramId?: string | null;
  courseSchoolId?: string | null;
  ownedClasses: Array<{ current_course_id?: string | null; program_id?: string | null; school_id?: string | null }>;
  courseId: string;
};

export function teacherCanReportCourse(input: ReportCourseScopeInput): boolean {
  if (input.courseTeacherId) return input.courseTeacherId === input.actorId;
  return input.ownedClasses.some(cls =>
    cls.current_course_id === input.courseId
    || (!!input.courseProgramId && cls.program_id === input.courseProgramId
      && (!input.courseSchoolId || cls.school_id === input.courseSchoolId)),
  );
}

export async function assertTeacherReportCourseScope(admin: any, actorId: string, courseId: string, ownedClassIds: string[]): Promise<boolean> {
  if (!courseId || ownedClassIds.length === 0) return false;
  const [{ data: course }, { data: classes }] = await Promise.all([
    admin.from('courses').select('id, teacher_id, program_id, school_id').eq('id', courseId).maybeSingle(),
    admin.from('classes').select('id, current_course_id, program_id, school_id').in('id', ownedClassIds),
  ]);
  if (!course) return false;
  return teacherCanReportCourse({
    actorId, courseId, courseTeacherId: course.teacher_id, courseProgramId: course.program_id,
    courseSchoolId: course.school_id, ownedClasses: classes ?? [],
  });
}