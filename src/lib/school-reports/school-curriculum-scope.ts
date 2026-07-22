import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CourseCatalogRow,
  classNameMatchesCourseHint,
  matchCourseFromClassName,
  matchCourseInScope,
  normalizeProgrammeLabel,
  programmeCourseKey,
  resolveClassCourseForScope,
  resolveProgrammeForCourseEvidence,
  resolveProgressReportCourseEvidence,
  type ProgressReportCourseContext,
  type ResolvedProgressReportCourse,
} from '@/lib/courses/class-course-resolution';
import type { SchoolRosterRow } from './loaders/roster';
import type { SchoolReportSnapshot } from './types';

export {
  classNameMatchesCourseHint,
  matchCourseFromClassName,
  matchCourseInScope,
  normalizeProgrammeLabel,
  programmeCourseKey,
  resolveClassCourseForScope,
  resolveProgrammeForCourseEvidence,
  resolveProgressReportCourseEvidence,
  type ProgressReportCourseContext,
  type ResolvedProgressReportCourse,
};

type AnyClient = SupabaseClient<any>;

type CourseRow = CourseCatalogRow & {
  programs?: { name?: string } | Array<{ name?: string }> | null;
};

export type SchoolProgrammeCourse = {
  programme: string;
  course: string;
  courseId: string | null;
  programmeId: string | null;
  enrolledStudents: number;
  classIds: string[];
  classNames: string[];
};

export type SchoolCourseDetection = {
  programme: string;
  course: string;
  enrolledStudents: number;
  hasSyllabus: boolean;
  trackedWeeks: number;
  inReportRange: boolean;
};

function programmeNameFromCourse(course: CourseRow): string {
  const progRel = Array.isArray(course.programs) ? course.programs[0] : course.programs;
  return normalizeProgrammeLabel(String(progRel?.name || ''));
}

function isActiveCourse(course: CourseRow | null | undefined): course is CourseRow {
  return Boolean(course?.id && course.is_active !== false);
}

/** Course ids for active programme/courses that currently have enrolled learners at the school. */
export function activeEnrolledCourseIds(scope: SchoolProgrammeCourse[]): Set<string> {
  return new Set(scope.map((row) => row.courseId).filter(Boolean) as string[]);
}

function joinedCourseIsActive(curriculum: {
  courses?: { is_active?: boolean | null } | Array<{ is_active?: boolean | null }> | null;
}): boolean {
  const rel = Array.isArray(curriculum.courses) ? curriculum.courses[0] : curriculum.courses;
  return rel?.is_active !== false;
}

/** Keep syllabi that belong to active, enrolled school courses only. */
export function scopeCurriculaForSchool<T extends {
  school_id?: string | null;
  course_id?: string | null;
  courses?: { is_active?: boolean | null } | Array<{ is_active?: boolean | null }> | null;
}>(
  curricula: T[],
  schoolId: string,
  scope: SchoolProgrammeCourse[],
): T[] {
  return scopeCurriculaForReport(curricula, schoolId, scope);
}

/** Keep syllabi for live scope plus any report-resolved course ids (snapshot fallback). */
export function scopeCurriculaForReport<T extends {
  school_id?: string | null;
  course_id?: string | null;
  courses?: { is_active?: boolean | null } | Array<{ is_active?: boolean | null }> | null;
}>(
  curricula: T[],
  schoolId: string,
  scope: SchoolProgrammeCourse[],
  extraCourseIds: Iterable<string> = [],
): T[] {
  const schoolCourseIds = activeEnrolledCourseIds(scope);
  for (const courseId of extraCourseIds) {
    if (courseId) schoolCourseIds.add(String(courseId));
  }
  return curricula.filter(
    (row) =>
      curriculaAppliesToSchool(row, schoolId, schoolCourseIds) && joinedCourseIsActive(row),
  );
}

type ScopeAccumulatorEntry = SchoolProgrammeCourse & { learnerIds: Set<string> };

function mergeScopeEntry(
  byKey: Map<string, ScopeAccumulatorEntry>,
  input: {
    programme: string;
    course: string;
    courseId: string;
    programmeId: string | null;
    learnerIds?: Iterable<string>;
    classId?: string | null;
    className?: string | null;
  },
) {
  const key = programmeCourseKey(input.programme, input.course);
  const incomingLearners = [...(input.learnerIds ?? [])].filter(Boolean);
  const existing = byKey.get(key);
  if (existing) {
    for (const learnerId of incomingLearners) existing.learnerIds.add(learnerId);
    existing.enrolledStudents = Math.max(existing.enrolledStudents, existing.learnerIds.size);
    if (input.classId && !existing.classIds.includes(input.classId)) {
      existing.classIds.push(input.classId);
      existing.classNames.push(String(input.className || 'Class'));
    }
    if (!existing.courseId) existing.courseId = input.courseId;
    if (!existing.programmeId && input.programmeId) existing.programmeId = input.programmeId;
    return;
  }
  byKey.set(key, {
    programme: input.programme,
    course: input.course,
    courseId: input.courseId,
    programmeId: input.programmeId,
    enrolledStudents: incomingLearners.length,
    classIds: input.classId ? [input.classId] : [],
    classNames: input.className ? [input.className] : [],
    learnerIds: new Set(incomingLearners),
  });
}

function finalizeScopeEntries(byKey: Map<string, ScopeAccumulatorEntry>): SchoolProgrammeCourse[] {
  return [...byKey.values()]
    .map(({ learnerIds, ...row }) => ({
      ...row,
      enrolledStudents: Math.max(row.enrolledStudents, learnerIds.size),
    }))
    .filter((row) => row.enrolledStudents > 0 && row.courseId)
    .sort((a, b) => a.programme.localeCompare(b.programme) || a.course.localeCompare(b.course));
}

/** Add programme/course rows from published learner evidence when class mapping missed them. */
export function supplementProgrammeScopeFromEvidence(
  scope: SchoolProgrammeCourse[],
  evidence: Array<{
    studentId?: string | null;
    courseId?: string | null;
    courseName?: string | null;
    programme?: string | null;
  }>,
): SchoolProgrammeCourse[] {
  const byKey = new Map<string, ScopeAccumulatorEntry>();
  for (const row of scope) {
    byKey.set(programmeCourseKey(row.programme, row.course), {
      ...row,
      learnerIds: new Set<string>(),
    });
  }

  for (const row of evidence) {
    const studentId = row.studentId ? String(row.studentId) : '';
    const course = String(row.courseName || '').trim();
    const programme = normalizeProgrammeLabel(String(row.programme || 'Programme'));
    if (!studentId || !course) continue;
    const courseId = row.courseId
      ? String(row.courseId)
      : `evidence:${programmeCourseKey(programme, course)}`;
    mergeScopeEntry(byKey, {
      programme,
      course,
      courseId,
      programmeId: null,
      learnerIds: [studentId],
    });
  }

  return finalizeScopeEntries(byKey);
}

/** Active programmes/courses at a school from real class + learner course signals. */
export async function loadSchoolProgrammeScope(
  admin: AnyClient,
  schoolId: string,
  studentRows: SchoolRosterRow[],
): Promise<SchoolProgrammeCourse[]> {
  const { data: classes } = await admin
    .from('classes')
    .select('id, name, program_id, current_course_id, programs(id, name)')
    .eq('school_id', schoolId)
    .limit(1000);

  const programIds = [
    ...new Set((classes ?? []).map((cls: any) => String(cls.program_id || '')).filter(Boolean)),
  ];
  const courseIdsFromClasses = [
    ...new Set((classes ?? []).map((cls: any) => String(cls.current_course_id || '')).filter(Boolean)),
  ];

  const [coursesByIdResult, coursesByProgramResult] = await Promise.all([
    courseIdsFromClasses.length
      ? admin
          .from('courses')
          .select('id, title, program_id, is_active, programs(name)')
          .in('id', courseIdsFromClasses)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as CourseRow[] }),
    programIds.length
      ? admin
          .from('courses')
          .select('id, title, program_id, is_active, programs(name)')
          .in('program_id', programIds)
          .eq('is_active', true)
          .order('level_order', { ascending: true })
      : Promise.resolve({ data: [] as CourseRow[] }),
  ]);

  const courseById = new Map<string, CourseRow>();
  for (const course of [...(coursesByIdResult.data ?? []), ...(coursesByProgramResult.data ?? [])] as CourseRow[]) {
    if (!isActiveCourse(course)) continue;
    courseById.set(String(course.id), course);
  }

  const coursesByProgram = new Map<string, CourseRow[]>();
  for (const course of (coursesByProgramResult.data ?? []) as CourseRow[]) {
    if (!isActiveCourse(course) || !course.program_id) continue;
    const programId = String(course.program_id);
    const list = coursesByProgram.get(programId) || [];
    list.push(course);
    coursesByProgram.set(programId, list);
  }

  const studentsByClass = new Map<string, string[]>();
  for (const student of studentRows) {
    if (!student.class_id) continue;
    const list = studentsByClass.get(student.class_id) || [];
    list.push(student.id);
    studentsByClass.set(student.class_id, list);
  }

  const byKey = new Map<string, ScopeAccumulatorEntry>();
  for (const cls of classes ?? []) {
    const classLearners = studentsByClass.get(cls.id) || [];
    if (!classLearners.length) continue;
    const resolved = resolveClassCourseForScope(cls, courseById, coursesByProgram);
    if (!resolved?.courseId) continue;
    mergeScopeEntry(byKey, {
      programme: resolved.programme,
      course: resolved.course,
      courseId: resolved.courseId,
      programmeId: resolved.programmeId,
      learnerIds: classLearners,
      classId: cls.id,
      className: String(cls.name || 'Class'),
    });
  }

  const studentIds = studentRows.map((row) => row.id);
  if (studentIds.length) {
    const { data: levelEnrollments } = await admin
      .from('student_level_enrollments')
      .select('student_id, course_id, program_id, courses(id, title, program_id, is_active, programs(name))')
      .eq('school_id', schoolId)
      .in('student_id', studentIds)
      .eq('status', 'active');

    const learnersByCourse = new Map<string, Set<string>>();
    for (const row of (levelEnrollments ?? []) as any[]) {
      if (!row.course_id || !row.student_id) continue;
      const courseRel = Array.isArray(row.courses) ? row.courses[0] : row.courses;
      if (!isActiveCourse(courseRel)) continue;
      courseById.set(String(courseRel.id), courseRel as CourseRow);
      const learners = learnersByCourse.get(String(row.course_id)) || new Set<string>();
      learners.add(String(row.student_id));
      learnersByCourse.set(String(row.course_id), learners);
    }

    for (const [courseId, learners] of learnersByCourse) {
      const course = courseById.get(courseId) || null;
      if (!isActiveCourse(course)) continue;
      mergeScopeEntry(byKey, {
        programme: programmeNameFromCourse(course),
        course: String(course.title || 'Course'),
        courseId: String(course.id),
        programmeId: course.program_id ? String(course.program_id) : null,
        learnerIds: [...learners],
      });
    }
  }

  return finalizeScopeEntries(byKey);
}

export function curriculaAppliesToSchool(
  curriculum: { school_id?: string | null; course_id?: string | null },
  schoolId: string,
  schoolCourseIds: Set<string>,
): boolean {
  const courseId = curriculum.course_id ? String(curriculum.course_id) : '';
  if (!courseId || !schoolCourseIds.has(courseId)) return false;
  if (curriculum.school_id === schoolId) return true;
  if (curriculum.school_id == null) return true;
  return false;
}

export function buildSchoolCourseDetections(input: {
  scope: SchoolProgrammeCourse[];
  curricula: Array<{ id: string; course_id?: string | null; school_id?: string | null }>;
  trackingRows: Array<{ curriculum_id: string; term_number: number; week_number: number; status: string }>;
  academicTermNumber: number;
  inRange: (term: number, week: number) => boolean;
}): SchoolCourseDetection[] {
  const syllabusByCourseId = new Set(
    input.curricula.map((row) => String(row.course_id || '')).filter(Boolean),
  );

  const trackingByCurriculum = new Map<string, number>();
  for (const row of input.trackingRows) {
    if (Number(row.term_number) !== input.academicTermNumber) continue;
    if (!['completed', 'in_progress', 'skipped'].includes(String(row.status || '').toLowerCase())) continue;
    if (!input.inRange(Number(row.term_number), Number(row.week_number))) continue;
    trackingByCurriculum.set(
      row.curriculum_id,
      (trackingByCurriculum.get(row.curriculum_id) || 0) + 1,
    );
  }

  const curriculumIdsByCourseId = new Map<string, string[]>();
  for (const row of input.curricula) {
    if (!row.course_id) continue;
    const list = curriculumIdsByCourseId.get(String(row.course_id)) || [];
    list.push(row.id);
    curriculumIdsByCourseId.set(String(row.course_id), list);
  }

  return input.scope.map((item) => {
    const curriculumIds = item.courseId ? curriculumIdsByCourseId.get(item.courseId) || [] : [];
    const trackedWeeks = curriculumIds.reduce((sum, id) => sum + (trackingByCurriculum.get(id) || 0), 0);
    return {
      programme: item.programme,
      course: item.course,
      enrolledStudents: item.enrolledStudents,
      hasSyllabus: item.courseId ? syllabusByCourseId.has(item.courseId) : false,
      trackedWeeks,
      inReportRange: trackedWeeks > 0,
    };
  });
}

export type DeliveryCourseRef = {
  id: string;
  title: string;
  programme: string;
};

/** Resolve tickable courses for manual delivery — live scope first, then frozen report snapshot. */
function matchCourseRowsToNamedPairs(
  courses: any[],
  pairs: Array<{ programme: string; course: string }>,
): DeliveryCourseRef[] {
  const byId = new Map<string, DeliveryCourseRef>();
  for (const pair of pairs) {
    const progKey = normalizeProgrammeLabel(pair.programme).toLowerCase();
    const courseKey = pair.course.toLowerCase();
    const match =
      courses.find((course: any) => {
        const progRel = Array.isArray(course.programs) ? course.programs[0] : course.programs;
        const prog = normalizeProgrammeLabel(String(progRel?.name || '')).toLowerCase();
        return prog === progKey && String(course.title || '').trim().toLowerCase() === courseKey;
      }) ||
      courses.find((course: any) => String(course.title || '').trim().toLowerCase() === courseKey);
    if (match?.id) {
      const progRel = Array.isArray(match.programs) ? match.programs[0] : match.programs;
      byId.set(String(match.id), {
        id: String(match.id),
        title: String(match.title),
        programme: normalizeProgrammeLabel(String(progRel?.name || pair.programme)),
      });
    }
  }
  return [...byId.values()];
}

export async function resolveDeliveryCoursesForReport(
  admin: AnyClient,
  schoolId: string,
  studentRows: SchoolRosterRow[],
  snapshot?: Partial<
    Pick<SchoolReportSnapshot, 'programmeCoursePerformance' | 'curriculum' | 'schoolProgrammes'>
  > | null,
): Promise<DeliveryCourseRef[]> {
  const scope = await loadSchoolProgrammeScope(admin, schoolId, studentRows);
  const byKey = new Map<string, DeliveryCourseRef>();

  const addRef = (ref: DeliveryCourseRef) => {
    const key = programmeCourseKey(ref.programme, ref.title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ref);
      return;
    }
    if (!existing.id && ref.id) byKey.set(key, ref);
  };

  for (const row of scope) {
    if (row.courseId && row.enrolledStudents > 0) {
      addRef({ id: row.courseId, title: row.course, programme: row.programme });
    }
  }

  const namedPairs: Array<{ programme: string; course: string }> = [];
  for (const row of snapshot?.programmeCoursePerformance || []) {
    const course = String(row.course || '').trim();
    if (!course || course === 'Unassigned course') continue;
    namedPairs.push({ programme: String(row.programme || 'Programme'), course });
  }
  for (const row of snapshot?.curriculum?.courses || []) {
    const course = String(row.course || '').trim();
    if (!course) continue;
    namedPairs.push({ programme: String(row.programme || 'Programme'), course });
  }
  for (const row of snapshot?.schoolProgrammes || []) {
    const course = String(row.course || '').trim();
    if (!course) continue;
    namedPairs.push({ programme: String(row.programme || 'Programme'), course });
  }

  const deduped = [
    ...new Map(namedPairs.map((pair) => [programmeCourseKey(pair.programme, pair.course), pair])).values(),
  ];

  const unresolved = deduped.filter(
    (pair) => !byKey.has(programmeCourseKey(pair.programme, pair.course)),
  );

  if (unresolved.length) {
    const { data: classes } = await admin.from('classes').select('program_id').eq('school_id', schoolId);
    const programIds = [...new Set((classes ?? []).map((cls: any) => String(cls.program_id || '')).filter(Boolean))];

    let courseRows: any[] = [];
    if (programIds.length) {
      const { data: courses } = await admin
        .from('courses')
        .select('id, title, is_active, programs(name)')
        .in('program_id', programIds)
        .eq('is_active', true);
      courseRows = courses ?? [];
    }
    if (!courseRows.length) {
      const { data: courses } = await admin
        .from('courses')
        .select('id, title, is_active, programs(name)')
        .eq('is_active', true)
        .limit(1000);
      courseRows = courses ?? [];
    }
    for (const match of matchCourseRowsToNamedPairs(courseRows, unresolved)) {
      addRef(match);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.programme.localeCompare(b.programme) || a.title.localeCompare(b.title),
  );
}
