function withQuery(
  path: string,
  args: Record<string, string | number | null | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Canonical link into the curriculum builder. Lives under /academic with the rest
 *  of the Academic Office flow. */
export const BUILDER_PATH = "/dashboard/academic/build";

export function buildCurriculumHref(
  args: {
    courseId?: string | null;
    programId?: string | null;
  } = {}
): string {
  return withQuery(BUILDER_PATH, {
    course: args.courseId,
    program: args.programId,
  });
}

/**
 * Certify, distribute and timing are one page.
 *
 * Publishing already performs the rollout — every eligible school receives the direction
 * in the same action — so these were never three decisions, only three screens. The three
 * builders are kept as distinct names because callers describe intent ("send them to
 * certify"), and they all resolve to the same workspace.
 */
export const ROLLOUT_PATH = "/dashboard/academic/rollout";

/** Academic review before publication. */
export function buildCertifyHref(
  args: {
    curriculumId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery(ROLLOUT_PATH, {
    curriculum_id: args.curriculumId,
    course_id: args.courseId,
  });
}

/** Protect and assign an official edition to schools. */
export function buildDistributeHref(
  args: {
    curriculumId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery(ROLLOUT_PATH, {
    curriculum_id: args.curriculumId,
    course_id: args.courseId,
  });
}

/** Set real school/class entry points for a published edition. */
export function buildTimingHref(
  args: {
    courseId?: string | null;
    releaseId?: string | null;
  } = {}
): string {
  return withQuery(ROLLOUT_PATH, {
    course_id: args.courseId,
    release_id: args.releaseId,
  });
}

/** Open a class on the teaching workspace for a course. */
export function buildClassTeachingHref(args: {
  classId: string;
  courseId?: string | null;
}): string {
  return withQuery(`/dashboard/classes/${args.classId}`, {
    operation: "teaching",
    course_id: args.courseId,
  });
}

/** Open a class on the assessment desk. */
export function buildClassAssessmentHref(args: {
  classId: string;
  courseId?: string | null;
}): string {
  return withQuery(`/dashboard/classes/${args.classId}`, {
    operation: "assessment",
    course_id: args.courseId,
  });
}

export function buildLessonPlanHref(planId: string): string {
  return `/dashboard/lesson-plans/${planId}`;
}

export function buildLessonNewHref(args: {
  classId?: string | null;
  courseId?: string | null;
  programId?: string | null;
  lessonPlanId?: string | null;
  curriculumId?: string | null;
  week?: number | string | null;
  session?: number | string | null;
  topic?: string | null;
  subject?: string | null;
  description?: string | null;
  notes?: string | null;
  plan?: Record<string, unknown> | null;
}): string {
  const planJson = args.plan ? JSON.stringify(args.plan) : "";
  return withQuery("/dashboard/lessons/add", {
    source: args.curriculumId ? "curriculum" : null,
    flow_origin: "class-teaching",
    class_id: args.classId,
    course_id: args.courseId,
    program_id: args.programId,
    lesson_plan_id: args.lessonPlanId,
    curriculum_id: args.curriculumId,
    week: args.week,
    session: args.session,
    title: args.topic,
    topic: args.topic,
    subject: args.subject,
    description: args.description,
    lesson_notes: args.notes,
    lesson_plan: planJson.length <= 4500 ? planJson : null,
  });
}

export function buildLessonSlidesHref(args: {
  lessonId: string;
  returnClassId?: string | null;
}): string {
  return (
    withQuery(`/dashboard/lessons/${args.lessonId}`, {
      tab: "materials",
      return_class_id: args.returnClassId,
    }) + "#learning-slides"
  );
}

export function buildFlashcardsHref(
  args: {
    deckId?: string | null;
    classId?: string | null;
    courseId?: string | null;
    lessonId?: string | null;
    lessonPlanId?: string | null;
    topic?: string | null;
    autoGenerate?: boolean;
  } = {}
): string {
  return withQuery("/dashboard/flashcards", {
    deckId: args.deckId,
    return_class_id: args.classId,
    course_id: args.courseId,
    lesson_id: args.lessonId,
    lesson_plan_id: args.lessonPlanId,
    topic: args.topic,
    autoGenerate: args.autoGenerate ? "true" : null,
  });
}

export function buildAssignmentNewHref(args: {
  classId?: string | null;
  courseId?: string | null;
  lessonPlanId?: string | null;
  lessonId?: string | null;
  week?: number | string | null;
  type?: string | null;
}): string {
  return withQuery("/dashboard/assignments/new", {
    class_id: args.classId,
    course_id: args.courseId,
    lesson_plan_id: args.lessonPlanId,
    lesson_id: args.lessonId,
    week: args.week,
    type: args.type ?? "homework",
  });
}

export function buildProjectNewHref(args: {
  classId?: string | null;
  courseId?: string | null;
  schoolId?: string | null;
  lessonPlanId?: string | null;
  lessonId?: string | null;
  week?: number | string | null;
}): string {
  return withQuery("/dashboard/projects/new", {
    class_id: args.classId,
    course_id: args.courseId,
    school_id: args.schoolId,
    lesson_plan_id: args.lessonPlanId,
    lesson_id: args.lessonId,
    week: args.week,
  });
}

export function hostPaperDatasheetHref(args: {
  kind: "first_test" | "second_test" | "examination";
  classId: string;
  courseId?: string | null;
  programId?: string | null;
  schoolId?: string | null;
  studentId?: string | null;
  from?: string | null;
}): string {
  return withQuery(`/dashboard/classes/${args.classId}/papers/${args.kind}`, {
    course_id: args.courseId,
    program_id: args.programId,
    school_id: args.schoolId,
    student_id: args.studentId,
    from: args.from,
  });
}

export function hostPaperEntryHref(args: {
  kind: "first_test" | "second_test" | "examination";
  examId?: string | null;
  classId?: string | null;
  courseId?: string | null;
  programId?: string | null;
  schoolId?: string | null;
  studentId?: string | null;
  from?: string | null;
}): string {
  const classId = String(args.classId ?? "").trim();
  if (classId) {
    return hostPaperDatasheetHref({
      kind: args.kind,
      classId,
      courseId: args.courseId,
      programId: args.programId,
      schoolId: args.schoolId,
      studentId: args.studentId,
      from: args.from,
    });
  }
  const examId = String(args.examId ?? "").trim();
  if (examId) return `/dashboard/cbt/${examId}`;
  const title =
    args.kind === "examination"
      ? "Examination"
      : args.kind === "second_test"
        ? "Second Test"
        : "First Test";
  return buildCbtNewHref({
    classId: args.classId,
    courseId: args.courseId,
    programId: args.programId,
    schoolId: args.schoolId,
    hostAssessment: args.kind,
    title,
    examType: args.kind === "examination" ? "examination" : "evaluation",
  });
}

export function hostPaperEntryLabel(_examId?: string | null): string {
  return "See paper";
}

export function buildCbtNewHref(args: {
  classId?: string | null;
  courseId?: string | null;
  programId?: string | null;
  schoolId?: string | null;
  lessonPlanId?: string | null;
  lessonId?: string | null;
  curriculumId?: string | null;
  week?: number | string | null;
  topic?: string | null;
  examType?: string | null;
  source?: string | null;
  title?: string | null;
  sit?: string | null;
  hostAssessment?: string | null;
}): string {
  return withQuery("/dashboard/cbt/new", {
    class_id: args.classId,
    course_id: args.courseId,
    program_id: args.programId,
    school_id: args.schoolId,
    lesson_plan_id: args.lessonPlanId,
    lesson_id: args.lessonId,
    curriculum_id: args.curriculumId,
    week: args.week,
    topic: args.topic,
    exam_type: args.examType ?? "evaluation",
    source: args.source,
    title: args.title,
    sit: args.sit,
    host_assessment: args.hostAssessment,
  });
}

export function buildGradesHref(
  args: {
    classId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/grades", {
    class_id: args.classId,
    course_id: args.courseId,
  });
}

export function buildAttendanceHref(
  args: {
    classId?: string | null;
    week?: number | null;
    session?: number | null;
    sessionId?: string | null;
    topic?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/attendance", {
    class_id: args.classId,
    week: args.week,
    session: args.session,
    session_id: args.sessionId,
    topic: args.topic,
  });
}

export function buildResultsHref(
  args: {
    classId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/academic/results", {
    class_id: args.classId,
    course_id: args.courseId,
  });
}

export function buildParentGradesHref(
  args: {
    studentId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/parent-grades", {
    student: args.studentId,
  });
}

export function buildParentResultsHref(
  args: {
    studentId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/parent-results", {
    student: args.studentId,
  });
}

/** Params carried across the curriculum asset lane (author → timing). */
export const ASSET_LANE_QUERY_KEYS = ["curriculum_id", "course_id"] as const;

export function pickAssetLaneQuery(
  source: URLSearchParams | string
): URLSearchParams {
  const from =
    typeof source === "string" ? new URLSearchParams(source) : source;
  const out = new URLSearchParams();
  for (const key of ASSET_LANE_QUERY_KEYS) {
    const value = from.get(key);
    if (value) out.set(key, value);
  }
  return out;
}

export function mergeAssetLaneHref(
  basePath: string,
  source: URLSearchParams | string
): string {
  const query = pickAssetLaneQuery(source).toString();
  return query ? `${basePath}?${query}` : basePath;
}
