import type { SupabaseClient } from '@supabase/supabase-js';
import { inferProgramme } from '@/lib/classes/naming';
import type { SchoolRosterRow } from './loaders/roster';

type AnyClient = SupabaseClient<any>;

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

/** Canonical programme labels so Young Innov / Young Innovators merge cleanly. */
export function normalizeProgrammeLabel(label: string): string {
  const lower = String(label || '').trim().toLowerCase();
  if (!lower) return 'Programme';
  if (/young\s*innov/.test(lower)) return 'Young Innovators';
  if (/teen\s*dev/.test(lower)) return 'Teen Developers';
  if (/web\s*dev/.test(lower)) return 'Web Development Bootcamp';
  if (/data\s*anal/.test(lower)) return 'Data Analysis with Python';
  return String(label).trim();
}

export function programmeCourseKey(programme: string, course: string): string {
  const prog = normalizeProgrammeLabel(programme).toLowerCase();
  const courseLabel = String(course || programme || 'Course').trim().toLowerCase();
  return `${prog}::${courseLabel}`;
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
  const schoolCourseIds = activeEnrolledCourseIds(scope);
  return curricula.filter(
    (row) =>
      curriculaAppliesToSchool(row, schoolId, schoolCourseIds) && joinedCourseIsActive(row),
  );
}

function resolveClassCourse(cls: any): { programme: string; course: string; courseId: string | null; programmeId: string | null } {
  const progRel = Array.isArray(cls.programs) ? cls.programs[0] : cls.programs;
  const courseRel = Array.isArray(cls.courses) ? cls.courses[0] : cls.courses;
  const courseProgRel = Array.isArray(courseRel?.programs) ? courseRel.programs[0] : courseRel?.programs;

  let programme = String(progRel?.name || courseProgRel?.name || '').trim();
  let course = String(courseRel?.title || '').trim();
  let courseId = cls.current_course_id || courseRel?.id || null;
  const programmeId = cls.program_id || null;

  if (courseRel?.is_active === false) {
    course = '';
    courseId = null;
  }

  if (!programme) programme = inferProgramme(cls.name);
  if (!course) course = programme;

  return {
    programme: normalizeProgrammeLabel(programme),
    course: course.trim() || programme,
    courseId: courseId ? String(courseId) : null,
    programmeId: programmeId ? String(programmeId) : null,
  };
}

/** Active programmes/courses at a school from class roster — source of truth for report scope. */
export async function loadSchoolProgrammeScope(
  admin: AnyClient,
  schoolId: string,
  studentRows: SchoolRosterRow[],
): Promise<SchoolProgrammeCourse[]> {
  const { data: classes } = await admin
    .from('classes')
    .select('id, name, program_id, current_course_id, programs(id, name), courses(id, title, is_active, programs(name))')
    .eq('school_id', schoolId)
    .limit(1000);

  const programIdsNeedingCourse = [
    ...new Set(
      (classes ?? [])
        .filter((cls: any) => !cls.current_course_id && cls.program_id)
        .map((cls: any) => String(cls.program_id)),
    ),
  ];
  const defaultCourseByProgram = new Map<string, { id: string; title: string; programme: string }>();
  if (programIdsNeedingCourse.length) {
    const { data: programCourses } = await admin
      .from('courses')
      .select('id, title, program_id, programs(name)')
      .in('program_id', programIdsNeedingCourse)
      .eq('is_active', true)
      .order('level_order', { ascending: true });
    for (const course of programCourses ?? []) {
      const programId = String((course as any).program_id || '');
      if (!programId || defaultCourseByProgram.has(programId)) continue;
      const progRel = Array.isArray((course as any).programs) ? (course as any).programs[0] : (course as any).programs;
      defaultCourseByProgram.set(programId, {
        id: String((course as any).id),
        title: String((course as any).title || 'Course'),
        programme: normalizeProgrammeLabel(String(progRel?.name || '')),
      });
    }
  }

  const referencedCourseIds = [
    ...new Set(
      (classes ?? [])
        .flatMap((cls: any) => {
          const courseRel = Array.isArray(cls.courses) ? cls.courses[0] : cls.courses;
          return [cls.current_course_id, courseRel?.id].filter(Boolean);
        })
        .map((id: string) => String(id)),
    ),
  ];
  const activeCourseIds = new Set<string>([...defaultCourseByProgram.values()].map((row) => row.id));
  if (referencedCourseIds.length) {
    const { data: activeCourses } = await admin
      .from('courses')
      .select('id')
      .in('id', referencedCourseIds)
      .eq('is_active', true);
    for (const course of activeCourses ?? []) activeCourseIds.add(String((course as any).id));
  }

  const studentsByClass = new Map<string, number>();
  for (const student of studentRows) {
    if (!student.class_id) continue;
    studentsByClass.set(student.class_id, (studentsByClass.get(student.class_id) || 0) + 1);
  }

  const byKey = new Map<string, SchoolProgrammeCourse>();
  for (const cls of classes ?? []) {
    const enrolled = studentsByClass.get(cls.id) || 0;
    if (enrolled <= 0) continue;
    const resolved = resolveClassCourse(cls);
    if (!resolved.courseId && cls.program_id) {
      const fallback = defaultCourseByProgram.get(String(cls.program_id));
      if (fallback) {
        resolved.courseId = fallback.id;
        if (!resolved.course || resolved.course === resolved.programme) resolved.course = fallback.title;
        if (!resolved.programme || resolved.programme === 'Programme') resolved.programme = fallback.programme;
      }
    }
    if (!resolved.courseId || !activeCourseIds.has(resolved.courseId)) continue;
    const key = programmeCourseKey(resolved.programme, resolved.course);
    const existing = byKey.get(key);
    if (existing) {
      existing.enrolledStudents += enrolled;
      existing.classIds.push(cls.id);
      existing.classNames.push(String(cls.name || 'Class'));
      if (!existing.courseId && resolved.courseId) existing.courseId = resolved.courseId;
      if (!existing.programmeId && resolved.programmeId) existing.programmeId = resolved.programmeId;
    } else {
      byKey.set(key, {
        programme: resolved.programme,
        course: resolved.course,
        courseId: resolved.courseId,
        programmeId: resolved.programmeId,
        enrolledStudents: enrolled,
        classIds: [cls.id],
        classNames: [String(cls.name || 'Class')],
      });
    }
  }

  return [...byKey.values()]
    .filter((row) => row.enrolledStudents > 0)
    .sort(
    (a, b) => a.programme.localeCompare(b.programme) || a.course.localeCompare(b.course),
  );
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
