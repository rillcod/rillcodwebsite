/**
 * Canonical class → programme → course resolution for reports, grading, and school snapshots.
 *
 * Priority order (never trust stale course_id/course_name alone):
 * 1. Class registration label (section_class / roster class name)
 * 2. current_module on progress reports
 * 3. Explicit course keyword in label
 * 4. current_course_id on class row (when consistent)
 * 5. Stored course_name / course_id (when programme agrees)
 */
import { inferProgramme } from '@/lib/classes/naming';
import { homeCourseTitle, schoolProgrammeOf } from '@/lib/courses/school-pathway';

export type CourseCatalogRow = {
  id: string;
  title: string;
  program_id?: string | null;
  is_active?: boolean | null;
  programmes?: { name?: string } | Array<{ name?: string }> | null;
};

export type ClassCourseLinkInput = {
  name?: string | null;
  program_id?: string | null;
  current_course_id?: string | null;
  programmes?: { name?: string } | Array<{ name?: string }> | null;
  programs?: { name?: string } | Array<{ name?: string }> | null;
};

export type ScopeCourseRow = {
  programme: string;
  course: string;
  courseId: string | null;
};

export type ResolvedClassCourse = {
  programme: string;
  course: string;
  courseId: string | null;
  programmeId: string | null;
  source: 'class_label' | 'current_course_id' | 'course_field';
};

export type ProgressReportCourseContext = {
  rosterClassName?: string | null;
};

export type ResolvedProgressReportCourse = {
  programme: string;
  course: string;
  courseId: string | null;
  source: 'section_class' | 'roster_class' | 'current_module' | 'course_field';
};

type ClassCourseHint = {
  classPattern: RegExp;
  coursePattern: RegExp;
  guardPattern?: RegExp;
};

const INTRO_COURSE_PATTERN = /intro(duction)?|hello world|introduction to computers/i;

/** Course named in the class label — wins over the band's default home course. */
const KEYWORD_COURSE_HINTS: ClassCourseHint[] = [
  { classPattern: /scratch/i, coursePattern: /scratch/i },
  { classPattern: /python/i, coursePattern: /python/i },
  { classPattern: /html|css/i, coursePattern: /html|css/i },
  { classPattern: /robot/i, coursePattern: /robot/i },
  { classPattern: /javascript|js\b/i, coursePattern: /javascript|js\b/i },
];

const PROGRAMME_COURSE_HINTS: ClassCourseHint[] = [
  { classPattern: /teen\s*dev/i, coursePattern: /python/i },
  {
    classPattern: /young\s*innov/i,
    coursePattern: /scratch/i,
    guardPattern: /basic|primary|kg|nursery|elem|grade|\bk\b|\bk\s*\d/i,
  },
  { classPattern: /web\s*dev/i, coursePattern: /web/i },
  { classPattern: /data\s*anal/i, coursePattern: /python|data/i },
];

const CLASS_COURSE_HINTS: ClassCourseHint[] = [...KEYWORD_COURSE_HINTS, ...PROGRAMME_COURSE_HINTS];

const STOP_WORDS = new Set([
  'course', 'coding', 'with', 'programme', 'program', 'beginners', 'creative', 'intensive',
]);

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

export function classNameMatchesCourseHint(className: string, hint: ClassCourseHint): boolean {
  const normalized = String(className || '').trim().toLowerCase();
  if (!normalized || !hint.classPattern.test(normalized)) return false;
  if (hint.guardPattern && !hint.guardPattern.test(normalized)) return false;
  return true;
}

function labelMatchesCourseHint(label: string, hint: ClassCourseHint): boolean {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) return false;
  if (classNameMatchesCourseHint(normalized, hint)) return true;
  return hint.coursePattern.test(normalized);
}

export function programmeFromClassLabel(classLabel: string): string | null {
  const label = String(classLabel || '').trim();
  if (!label) return null;
  return normalizeProgrammeLabel(inferProgramme(label));
}

function programmeNameFromCourse(course: CourseCatalogRow): string {
  const progRel = Array.isArray(course.programmes) ? course.programmes[0] : course.programmes;
  return normalizeProgrammeLabel(String(progRel?.name || ''));
}

function programmeNameFromClassInput(cls: ClassCourseLinkInput): string | null {
  const rel = cls.programmes || cls.programs;
  const progRel = Array.isArray(rel) ? rel[0] : rel;
  const name = String(progRel?.name || '').trim();
  if (!name) return null;
  return normalizeProgrammeLabel(name);
}

function firstMatchingHint(
  label: string,
  candidates: CourseCatalogRow[],
  hints: ClassCourseHint[],
): CourseCatalogRow | null {
  const normalized = String(label || '').trim().toLowerCase();
  for (const hint of hints) {
    if (!labelMatchesCourseHint(normalized, hint)) continue;
    const match = candidates.find((course) => hint.coursePattern.test(courseTitle(course)));
    if (match) return match;
  }
  return null;
}

function isActiveCourse<T extends { id?: string | null; is_active?: boolean | null }>(
  course: T | null | undefined,
): course is T {
  return Boolean(course?.id && course.is_active !== false);
}

function courseTitle(row: { title?: string | null; course?: string | null }): string {
  return String(row.title || row.course || '').trim();
}

/** Match any label (class name, module name, course name) against a course catalog. */
export function matchCourseFromCatalog(
  label: string,
  catalog: CourseCatalogRow[],
  opts?: { programmeHint?: string | null },
): CourseCatalogRow | null {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized || !catalog.length) return null;

  let candidates = catalog.filter(isActiveCourse);
  if (opts?.programmeHint) {
    const hint = normalizeProgrammeLabel(opts.programmeHint);
    const scoped = candidates.filter((row) => {
      const programme = (row as CourseCatalogRow & { programme?: string }).programme
        ? normalizeProgrammeLabel(String((row as CourseCatalogRow & { programme?: string }).programme))
        : programmeNameFromCourse(row);
      return programme === hint;
    });
    if (scoped.length) candidates = scoped;
  }

  const keywordMatch = firstMatchingHint(normalized, candidates, KEYWORD_COURSE_HINTS);
  if (keywordMatch) return keywordMatch;

  const homeTitle = homeCourseTitle({
    programme: schoolProgrammeOf(opts?.programmeHint) || programmeFromClassLabel(label),
    className: label,
  });
  if (homeTitle) {
    const home = candidates.find((course) => courseTitle(course) === homeTitle);
    if (home) return home;
  }

  const programmeMatch = firstMatchingHint(normalized, candidates, PROGRAMME_COURSE_HINTS);
  if (programmeMatch) return programmeMatch;

  for (const course of candidates) {
    if (INTRO_COURSE_PATTERN.test(courseTitle(course))) continue;
    const words = courseTitle(course)
      .toLowerCase()
      .split(/[\s:·\-—]+/)
      .filter((word) => word.length > 4 && !STOP_WORDS.has(word));
    if (words.some((word) => normalized.includes(word))) return course;
  }

  for (const course of candidates) {
    const title = courseTitle(course).toLowerCase();
    if (title && (normalized.includes(title) || title.includes(normalized))) return course;
  }

  return null;
}

/** Match a label against programme/course scope rows (school report enrolment evidence). */
export function matchCourseInScope(
  scope: ScopeCourseRow[],
  opts: { programmeHint?: string | null; label?: string | null },
): ScopeCourseRow | null {
  const label = String(opts.label || '').trim();
  if (!label || !scope.length) return null;

  const catalog: Array<CourseCatalogRow & { programme?: string }> = scope.map((row) => ({
    id: row.courseId || `${row.programme}::${row.course}`,
    title: row.course,
    programme: row.programme,
    is_active: true,
  }));

  const match = matchCourseFromCatalog(label, catalog, { programmeHint: opts.programmeHint });
  if (!match) return null;

  const matchedScopeRow = scope.find(
    (row) => row.course === courseTitle(match)
      && (!opts.programmeHint || normalizeProgrammeLabel(row.programme) === normalizeProgrammeLabel(opts.programmeHint)),
  ) || scope.find((row) => row.course === courseTitle(match));

  if (matchedScopeRow) return matchedScopeRow;

  return {
    programme: normalizeProgrammeLabel(String(opts.programmeHint || programmeFromClassLabel(label) || 'Programme')),
    course: courseTitle(match),
    courseId: match.id.includes('::') ? null : match.id,
  };
}

function shouldPreferNameMatchOverCurrent(
  className: string,
  current: CourseCatalogRow,
  nameMatch: CourseCatalogRow,
): boolean {
  if (current.id === nameMatch.id) return false;
  if (INTRO_COURSE_PATTERN.test(courseTitle(current)) && !INTRO_COURSE_PATTERN.test(courseTitle(nameMatch))) {
    return true;
  }
  for (const hint of CLASS_COURSE_HINTS) {
    if (!classNameMatchesCourseHint(className, hint)) continue;
    if (hint.coursePattern.test(courseTitle(nameMatch))) {
      return !hint.coursePattern.test(courseTitle(current));
    }
  }
  return false;
}

/**
 * Resolve the course a class is teaching from its registration label and programme catalog.
 * Never falls back to "first course in programme".
 */
export function resolveClassLinkedCourse(
  cls: ClassCourseLinkInput,
  catalog: CourseCatalogRow[],
): CourseCatalogRow | null {
  const className = String(cls.name || '');
  const programId = cls.program_id ? String(cls.program_id) : null;
  const storedProgramme = programmeNameFromClassInput(cls);
  const labelProgramme = className ? programmeFromClassLabel(className) : null;
  const labelSchool = schoolProgrammeOf(labelProgramme);
  const storedConflicts = Boolean(
    labelSchool && storedProgramme && normalizeProgrammeLabel(storedProgramme) !== labelSchool,
  );
  const programmeHint = (storedConflicts ? labelSchool : null) || storedProgramme || labelProgramme;

  let programCourses = programId
    ? catalog.filter((course) => course.program_id === programId && isActiveCourse(course))
    : catalog.filter(isActiveCourse);
  if (programmeHint && programCourses.length) {
    const scoped = programCourses.filter((course) => programmeNameFromCourse(course) === programmeHint);
    if (scoped.length) programCourses = scoped;
  }

  // Bayflower-style mis-tag: class is Teen Dev but stored under another programme.
  // Look at the whole catalogue when the home course lives outside the stored programme.
  const homeTitle = homeCourseTitle({ programme: labelSchool || programmeHint, className });
  if (
    homeTitle
    && !programCourses.some((course) => courseTitle(course) === homeTitle)
    && catalog.some((course) => isActiveCourse(course) && courseTitle(course) === homeTitle)
  ) {
    programCourses = catalog.filter(isActiveCourse);
  }

  const nameMatch = programCourses.length
    ? matchCourseFromCatalog(className, programCourses, { programmeHint })
    : null;

  let courseRow: CourseCatalogRow | null = null;
  if (cls.current_course_id) {
    courseRow = catalog.find((course) => course.id === cls.current_course_id) || null;
  }
  if (
    nameMatch
    && (!isActiveCourse(courseRow) || shouldPreferNameMatchOverCurrent(className, courseRow!, nameMatch))
  ) {
    courseRow = nameMatch;
  }
  if (!isActiveCourse(courseRow) && nameMatch) {
    courseRow = nameMatch;
  }
  return isActiveCourse(courseRow) ? courseRow : null;
}

/** Full class → programme/course resolution for scope building and APIs. */
export function resolveClassCourseForScope(
  cls: ClassCourseLinkInput,
  courseById: Map<string, CourseCatalogRow>,
  coursesByProgram: Map<string, CourseCatalogRow[]>,
): ResolvedClassCourse | null {
  const programmeId = cls.program_id ? String(cls.program_id) : null;
  const className = String(cls.name || '');
  const labelSchool = schoolProgrammeOf(programmeFromClassLabel(className));
  const homeTitle = homeCourseTitle({ programme: labelSchool, className });
  let catalog = programmeId
    ? coursesByProgram.get(programmeId) || []
    : [...courseById.values()];
  if (
    homeTitle
    && !catalog.some((course) => courseTitle(course) === homeTitle)
    && [...courseById.values()].some((course) => courseTitle(course) === homeTitle)
  ) {
    catalog = [...courseById.values()];
  }
  const linked = resolveClassLinkedCourse(cls, catalog.length ? catalog : [...courseById.values()]);
  if (!linked) return null;

  let programme = programmeNameFromCourse(linked);
  if (!programme || programme === 'Programme') {
    programme = programmeFromClassLabel(className) || programme;
  }

  return {
    programme,
    course: courseTitle(linked),
    courseId: linked.id,
    programmeId: linked.program_id ? String(linked.program_id) : programmeId,
    source: 'class_label',
  };
}

export function resolveProgrammeForCourseEvidence(
  scope: Pick<ScopeCourseRow, 'programme' | 'course'>[],
  courseName: string,
  programmeHint?: string | null,
): string {
  if (programmeHint) return normalizeProgrammeLabel(programmeHint);
  const normalizedCourse = String(courseName || '').trim().toLowerCase();
  if (!normalizedCourse) return normalizeProgrammeLabel('Programme');
  const match = scope.find((row) => row.course.trim().toLowerCase() === normalizedCourse);
  if (match) return normalizeProgrammeLabel(match.programme);
  return normalizeProgrammeLabel('Programme');
}

function labelsConflictWithCourseField(
  programmeFromClass: string | null,
  fieldProgramme: string,
): boolean {
  if (!programmeFromClass) return false;
  return normalizeProgrammeLabel(programmeFromClass) !== normalizeProgrammeLabel(fieldProgramme);
}

function inferProgrammeFromCourseTitle(courseName: string | null | undefined): string | null {
  const lower = String(courseName || '').trim().toLowerCase();
  if (!lower) return null;
  if (/python|javascript|html|css|web|data anal|arduino|prototyping|electronics/.test(lower)) return 'Teen Developers';
  if (/scratch|robot|hello world|digital art|digital citizenship|mini-maker/.test(lower)) return 'Young Innovators';
  return schoolProgrammeOf(lower);
}

export function courseConflictsWithClassSection(input: {
  sectionClass?: string | null;
  courseName?: string | null;
  courseProgramme?: string | null;
}): boolean {
  const classLabel = String(input.sectionClass || '').trim();
  const courseName = String(input.courseName || '').trim();
  if (!classLabel || !courseName) return false;
  const programmeFromClass = programmeFromClassLabel(classLabel);
  const programmeFromCourse = input.courseProgramme
    ? normalizeProgrammeLabel(input.courseProgramme)
    : inferProgrammeFromCourseTitle(courseName);
  if (!programmeFromCourse || !programmeFromClass) return false;
  return programmeFromClass !== programmeFromCourse;
}

/** Resolve programme/course for a published progress report row. */
export function resolveProgressReportCourseEvidence(
  row: {
    student_id?: string | null;
    course_id?: string | null;
    course_name?: string | null;
    section_class?: string | null;
    current_module?: string | null;
  },
  scope: ScopeCourseRow[],
  context?: ProgressReportCourseContext,
  courseMetaById?: Map<string, { course: string; programme: string }>,
  catalog: CourseCatalogRow[] = [],
): ResolvedProgressReportCourse {
  const sectionClass = String(row.section_class || '').trim();
  const rosterClass = String(context?.rosterClassName || '').trim();
  const classLabel = sectionClass || rosterClass;
  const programmeFromClass = classLabel ? programmeFromClassLabel(classLabel) : null;

  let match = classLabel
    ? matchCourseInScope(scope, { programmeHint: programmeFromClass, label: classLabel })
    : null;
  if (!match && classLabel && catalog.length) {
    const catalogMatch = matchCourseFromCatalog(classLabel, catalog, { programmeHint: programmeFromClass });
    if (catalogMatch) {
      match = {
        programme: programmeNameFromCourse(catalogMatch),
        course: courseTitle(catalogMatch),
        courseId: catalogMatch.id,
      };
    }
  }
  if (match) {
    return {
      programme: normalizeProgrammeLabel(match.programme),
      course: match.course,
      courseId: match.courseId,
      source: sectionClass ? 'section_class' : 'roster_class',
    };
  }

  if (row.current_module) {
    match = matchCourseInScope(scope, { programmeHint: programmeFromClass, label: row.current_module });
    if (!match && catalog.length) {
      const catalogMatch = matchCourseFromCatalog(String(row.current_module), catalog, { programmeHint: programmeFromClass });
      if (catalogMatch) {
        match = {
          programme: programmeNameFromCourse(catalogMatch),
          course: courseTitle(catalogMatch),
          courseId: catalogMatch.id,
        };
      }
    }
    if (match) {
      return {
        programme: normalizeProgrammeLabel(match.programme),
        course: match.course,
        courseId: match.courseId,
        source: 'current_module',
      };
    }
  }

  const meta = row.course_id ? courseMetaById?.get(String(row.course_id)) : null;
  const fieldCourse = String(meta?.course || row.course_name || '').trim();
  const fieldProgramme = normalizeProgrammeLabel(
    meta?.programme || resolveProgrammeForCourseEvidence(scope, fieldCourse),
  );

  if (fieldCourse && !labelsConflictWithCourseField(programmeFromClass, fieldProgramme)) {
    match = matchCourseInScope(scope, { programmeHint: fieldProgramme, label: fieldCourse });
    if (match) {
      return {
        programme: normalizeProgrammeLabel(match.programme),
        course: match.course,
        courseId: match.courseId ?? (row.course_id ? String(row.course_id) : null),
        source: 'course_field',
      };
    }
    return {
      programme: fieldProgramme,
      course: fieldCourse,
      courseId: row.course_id ? String(row.course_id) : null,
      source: 'course_field',
    };
  }

  if (programmeFromClass && classLabel) {
    match = matchCourseInScope(scope, { programmeHint: programmeFromClass, label: classLabel });
    if (!match && row.current_module) {
      match = matchCourseInScope(scope, { programmeHint: programmeFromClass, label: row.current_module });
    }
    if (match) {
      return {
        programme: normalizeProgrammeLabel(match.programme),
        course: match.course,
        courseId: match.courseId,
        source: row.current_module ? 'current_module' : (sectionClass ? 'section_class' : 'roster_class'),
      };
    }
  }

  return {
    programme: programmeFromClass || fieldProgramme,
    course: fieldCourse || 'Term assessment record',
    courseId: row.course_id ? String(row.course_id) : null,
    source: 'course_field',
  };
}

export function reconcileCourseWithClassSection<T extends { course_id?: string | null; course_name?: string | null }>(
  payload: T,
  sectionClass: string | null | undefined,
  catalog: CourseCatalogRow[],
  classInput?: ClassCourseLinkInput | null,
): T & { course_id?: string | null; course_name?: string | null } {
  const cls = classInput ?? { name: sectionClass };
  const resolved = resolveClassLinkedCourse(cls, catalog);
  if (!resolved) return payload;
  if (!courseConflictsWithClassSection({
    sectionClass: sectionClass || cls.name,
    courseName: payload.course_name,
    courseProgramme: programmeNameFromCourse(resolved),
  })) {
    return payload;
  }
  return {
    ...payload,
    course_id: resolved.id,
    course_name: courseTitle(resolved),
  };
}

/** @deprecated Use matchCourseFromCatalog — kept for existing imports. */
export function matchCourseFromClassName(className: string, programCourses: CourseCatalogRow[]): CourseCatalogRow | null {
  return matchCourseFromCatalog(className, programCourses);
}

/** @deprecated Use resolveClassLinkedCourse — kept for existing imports. */
export function resolveLinkedCourseForClass(
  cls: ClassCourseLinkInput,
  catalog: CourseCatalogRow[],
): CourseCatalogRow | null {
  return resolveClassLinkedCourse(cls, catalog);
}
