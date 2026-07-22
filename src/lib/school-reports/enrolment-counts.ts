export type SchoolProgrammeEnrolment = {
  programme: string;
  course: string;
  enrolledStudents?: number;
};

export type ProgrammePerformanceEnrolment = SchoolProgrammeEnrolment & {
  students?: number;
};

export function reconcileSchoolReportEnrolments(input: {
  schoolProgrammes?: SchoolProgrammeEnrolment[] | null;
  programmeCoursePerformance?: ProgrammePerformanceEnrolment[] | null;
  learnerIds?: Array<string | null | undefined> | null;
  activeStudents?: number;
}) {
  const enrolmentByProgrammeCourse = new Map<string, number>();
  const addCourse = (row: ProgrammePerformanceEnrolment) => {
    const key = `${String(row.programme || '').trim().toLowerCase()}::${String(row.course || '').trim().toLowerCase()}`;
    if (key === '::') return;
    enrolmentByProgrammeCourse.set(
      key,
      Math.max(
        enrolmentByProgrammeCourse.get(key) || 0,
        Number(row.students || 0),
        Number(row.enrolledStudents || 0),
      ),
    );
  };

  for (const row of input.schoolProgrammes || []) addCourse(row);
  for (const row of input.programmeCoursePerformance || []) addCourse(row);

  const programmeEnrolments = [...enrolmentByProgrammeCourse.values()].reduce((sum, count) => sum + count, 0);
  const uniqueLearnerIds = new Set((input.learnerIds || []).filter(Boolean));
  const totalStudents = uniqueLearnerIds.size || Number(input.activeStudents || 0);

  return {
    programmeEnrolments: programmeEnrolments || totalStudents,
    totalStudents,
  };
}