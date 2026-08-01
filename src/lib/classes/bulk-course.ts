/**
 * Decide which classes may take a given course in a bulk assignment.
 *
 * A curriculum is published for one course, and a class only picks it up once that course is set
 * on the class. Where a programme offers several courses the system cannot infer which one a class
 * teaches, so 52 classes sat at "Choose the course this class is teaching" and nothing generated.
 *
 * Assigning them one at a time is the real problem, but assigning them blindly is worse: a
 * Teen Developers course on a Young Innovators class would be accepted by the database and quietly
 * teach the wrong material. The rule below is the guard — a class may only take a course from its
 * own programme, and every refusal is reported rather than silently dropped.
 */
export type BulkCourseCandidate = {
  id: string;
  name: string | null;
  program_id: string | null;
  current_course_id: string | null;
};

export type BulkCourseDecision = {
  /** Safe to write. */
  assign: BulkCourseCandidate[];
  /** Already on this course — writing again would be a no-op. */
  unchanged: BulkCourseCandidate[];
  /** Refused, with the reason a person can act on. */
  refused: Array<{ id: string; name: string | null; reason: string }>;
};

export function planBulkCourseAssignment(
  classes: BulkCourseCandidate[],
  course: { id: string; program_id: string | null },
  opts: { replaceExisting?: boolean } = {},
): BulkCourseDecision {
  const decision: BulkCourseDecision = { assign: [], unchanged: [], refused: [] };

  for (const klass of classes) {
    if (klass.current_course_id === course.id) {
      decision.unchanged.push(klass);
      continue;
    }
    if (!course.program_id) {
      decision.refused.push({
        id: klass.id,
        name: klass.name,
        reason: 'That course is not attached to a programme, so it cannot be matched to a class.',
      });
      continue;
    }
    if (!klass.program_id) {
      decision.refused.push({
        id: klass.id,
        name: klass.name,
        reason: 'This class has no programme, so there is nothing to match the course against.',
      });
      continue;
    }
    if (klass.program_id !== course.program_id) {
      decision.refused.push({
        id: klass.id,
        name: klass.name,
        reason: 'This class belongs to a different programme, so it would be taught the wrong course.',
      });
      continue;
    }
    // Replacing a course a class is already teaching changes what learners are taught, so it is
    // opt-in rather than something a bulk action does on the way past.
    if (klass.current_course_id && !opts.replaceExisting) {
      decision.refused.push({
        id: klass.id,
        name: klass.name,
        reason: 'This class already teaches a different course. Choose "replace" to change it.',
      });
      continue;
    }
    decision.assign.push(klass);
  }

  return decision;
}
