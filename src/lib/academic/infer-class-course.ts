/**
 * Work out which course a class teaches, without asking a person.
 *
 * Readiness used to infer a course only when the programme offered exactly one. Young Innovators
 * offers several, so 37 classes stopped at "Choose the course this class is teaching" and produced
 * nothing — even though only one of those courses had a curriculum published and adopted by their
 * schools. The information needed to decide was already in the database; nothing was reading it.
 *
 * The narrowing is deliberately conservative. An adoption means the Academic Office published a
 * curriculum for that course AND rolled it out to that school, so a single adopted course in the
 * programme is a real answer rather than a guess. Two adopted courses is a genuine choice between
 * two live editions, and stays with a person — silently teaching the wrong half of a programme is
 * worse than waiting to be told.
 */
export type CourseInference =
  | { courseId: string; reason: 'already_set' | 'only_course_in_programme' | 'only_adopted_course' }
  | { courseId: null; reason: 'no_programme_courses' | 'ambiguous'; candidates: string[] };

export function inferClassCourse(input: {
  currentCourseId: string | null;
  /** Every active course in the class's programme. */
  programmeCourses: string[];
  /** Courses this class's school holds an active curriculum adoption for. */
  adoptedCourseIds: string[];
}): CourseInference {
  if (input.currentCourseId) {
    return { courseId: input.currentCourseId, reason: 'already_set' };
  }

  const programmeCourses = [...new Set(input.programmeCourses.filter(Boolean))];
  if (programmeCourses.length === 0) {
    return { courseId: null, reason: 'no_programme_courses', candidates: [] };
  }
  if (programmeCourses.length === 1) {
    return { courseId: programmeCourses[0], reason: 'only_course_in_programme' };
  }

  // Several courses in the programme — let the published editions decide.
  const adopted = new Set(input.adoptedCourseIds.filter(Boolean));
  const adoptedInProgramme = programmeCourses.filter((id) => adopted.has(id));

  if (adoptedInProgramme.length === 1) {
    return { courseId: adoptedInProgramme[0], reason: 'only_adopted_course' };
  }

  // Either nothing is adopted yet, or more than one edition is live for this programme.
  return {
    courseId: null,
    reason: 'ambiguous',
    candidates: adoptedInProgramme.length > 1 ? adoptedInProgramme : programmeCourses,
  };
}

/** Wording for the readiness report, so the reason a class is stuck is actionable. */
export function describeInference(result: CourseInference, adoptedCount: number): string {
  if (result.courseId) return '';
  if (result.reason === 'no_programme_courses') {
    return 'This class has no course to build a teaching plan from.';
  }
  if (adoptedCount > 1) {
    return `This programme has ${adoptedCount} published editions in this school. Choose the course this class is teaching.`;
  }
  return 'This programme has several courses and none has a published edition yet. Publish one, or choose the course this class is teaching.';
}
