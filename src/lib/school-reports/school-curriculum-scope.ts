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

function resolveClassCourse(cls: any): { programme: string; course: string; courseId: string | null; programmeId: string | null } {
  const progRel = Array.isArray(cls.programs) ? cls.programs[0] : cls.programs;
  const courseRel = Array.isArray(cls.courses) ? cls.courses[0] : cls.courses;
  const courseProgRel = Array.isArray(courseRel?.programs) ? courseRel.programs[0] : courseRel?.programs;

  let programme = String(progRel?.name || courseProgRel?.name || '').trim();
  let course = String(courseRel?.title || '').trim();
  const courseId = cls.current_course_id || courseRel?.id || null;
  const programmeId = cls.program_id || null;

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
    .select('id, name, program_id, current_course_id, programs(id, name), courses(id, title, programs(name))')
    .eq('school_id', schoolId)
    .limit(1000);
  const studentIds = studentRows.map((row) => row.id);
  const { data: programmeEnrollments } = studentIds.length
    ? await admin
        .from('enrollments')
        .select('user_id,program_id,programs(id,name,courses(id,title,is_active))')
        .in('user_id', studentIds)
        .eq('status', 'active')
    : { data: [] };

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

  const studentsByClass = new Map<string, number>();
  for (const student of studentRows) {
    if (!student.class_id) continue;
    studentsByClass.set(student.class_id, (studentsByClass.get(student.class_id) || 0) + 1);
  }

  const byKey = new Map<string, SchoolProgrammeCourse>();
  for (const cls of classes ?? []) {
    const enrolled = studentsByClass.get(cls.id) || 0;
    const resolved = resolveClassCourse(cls);
    if (!resolved.courseId && cls.program_id) {
      const fallback = defaultCourseByProgram.get(String(cls.program_id));
      if (fallback) {
        resolved.courseId = fallback.id;
        if (!resolved.course || resolved.course === resolved.programme) resolved.course = fallback.title;
        if (!resolved.programme || resolved.programme === 'Programme') resolved.programme = fallback.programme;
      }
    }
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

  const learnersByProgramme = new Map<string, Set<string>>();
  for (const enrollment of (programmeEnrollments ?? []) as any[]) {
    if (!enrollment.program_id || !enrollment.user_id) continue;
    const learners = learnersByProgramme.get(String(enrollment.program_id)) || new Set<string>();
    learners.add(String(enrollment.user_id));
    learnersByProgramme.set(String(enrollment.program_id), learners);
  }
  for (const enrollment of (programmeEnrollments ?? []) as any[]) {
    const programme = Array.isArray(enrollment.programs) ? enrollment.programs[0] : enrollment.programs;
    const programmeName = normalizeProgrammeLabel(String(programme?.name || 'Programme'));
    const enrolledStudents = learnersByProgramme.get(String(enrollment.program_id))?.size || 0;
    for (const course of (Array.isArray(programme?.courses) ? programme.courses : [])) {
      if (course.is_active === false) continue;
      const key = programmeCourseKey(programmeName, String(course.title || 'Course'));
      const existing = byKey.get(key);
      if (existing) existing.enrolledStudents = Math.max(existing.enrolledStudents, enrolledStudents);
      else byKey.set(key, { programme: programmeName, course: String(course.title || 'Course'), courseId: String(course.id), programmeId: String(enrollment.program_id), enrolledStudents, classIds: [], classNames: [] });
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
  if (curriculum.school_id === schoolId) return true;
  if (curriculum.school_id == null && curriculum.course_id && schoolCourseIds.has(String(curriculum.course_id))) {
    return true;
  }
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
