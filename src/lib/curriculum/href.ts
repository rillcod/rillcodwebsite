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

/** Canonical link into the curriculum builder. */
export function buildCurriculumHref(
  args: {
    courseId?: string | null;
    programId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/curriculum", {
    course: args.courseId,
    program: args.programId,
  });
}

/** Academic review before publication. */
export function buildCertifyHref(
  args: {
    curriculumId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/academic/certify", {
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
  return withQuery("/dashboard/academic/distribute", {
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
  return withQuery("/dashboard/academic/timing", {
    course_id: args.courseId,
    release_id: args.releaseId,
  });
}

/** Open a class on the teaching workspace for a course. */
export function buildClassTeachingHref(
  args: {
    classId: string;
    courseId?: string | null;
  }
): string {
  return withQuery(`/dashboard/classes/${args.classId}`, {
    operation: "teaching",
    course_id: args.courseId,
  });
}

/** Open a class on the assessment desk. */
export function buildClassAssessmentHref(
  args: {
    classId: string;
    courseId?: string | null;
  }
): string {
  return withQuery(`/dashboard/classes/${args.classId}`, {
    operation: "assessment",
    course_id: args.courseId,
  });
}

export function buildLessonPlanHref(planId: string): string {
  return `/dashboard/lesson-plans/${planId}`;
}

export function buildLessonSlidesHref(
  args: {
    lessonId: string;
    returnClassId?: string | null;
  }
): string {
  return withQuery(`/dashboard/lessons/${args.lessonId}`, {
    tab: "materials",
    return_class_id: args.returnClassId,
  }) + "#learning-slides";
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
  });
}

export function buildGradesHref(args: {
  classId?: string | null;
  courseId?: string | null;
} = {}): string {
  return withQuery("/dashboard/grades", {
    class_id: args.classId,
    course_id: args.courseId,
  });
}

export function buildResultsHref(args: {
  classId?: string | null;
  courseId?: string | null;
} = {}): string {
  return withQuery("/dashboard/academic/results", {
    class_id: args.classId,
    course_id: args.courseId,
  });
}

export function buildParentGradesHref(args: {
  studentId?: string | null;
} = {}): string {
  return withQuery("/dashboard/parent-grades", {
    student: args.studentId,
  });
}

export function buildParentResultsHref(args: {
  studentId?: string | null;
} = {}): string {
  return withQuery("/dashboard/parent-results", {
    student: args.studentId,
  });
}

/** Params carried across the curriculum asset lane (author → timing). */
export const ASSET_LANE_QUERY_KEYS = [
  "curriculum_id",
  "course_id",
] as const;

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
