/**
 * Lesson bodies for the school-pathway courses that already have week titles
 * in `course_curricula`. The titles stay as they are; this fills the empty
 * teacher/student work the week generators actually read.
 */
export const SCHOOL_SPINE_SOURCE = {
  name: 'Rillcod Academic Office',
  framework: 'Rillcod Coding and Robotics Academic Standard',
} as const;

export type SpineLessonSpec = {
  subtopics: string[];
  objectives: string[];
  teacher: string[];
  students: string[];
  classwork: { title: string; instructions: string };
  assignment: { title: string; instructions: string };
  check: { title: string; how: string };
  resources?: string[];
  tips?: string[];
  durationMinutes?: number;
};

export type SpineCourseMeta = {
  title: string;
  overview: string;
  outcomes: string[];
  materials: string[];
  tools: string[];
  assessmentStrategy: string;
};

const TERM_TITLE: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringList(value: unknown): string[] {
  return asList(value).map((item) => String(item || '').trim()).filter(Boolean);
}

export function lessonPlanFromSpec(spec: SpineLessonSpec) {
  const duration = spec.durationMinutes ?? 60;
  const resources = spec.resources?.length
    ? spec.resources
    : ['Projector or shared screen', 'One computer between one or two learners'];
  return {
    duration_minutes: duration,
    objectives: spec.objectives,
    teacher_activities: spec.teacher,
    student_activities: spec.students,
    activities: [...spec.teacher.slice(0, 1), ...spec.students],
    classwork: {
      title: spec.classwork.title,
      instructions: spec.classwork.instructions,
      materials: resources,
    },
    assignment: {
      title: spec.assignment.title,
      instructions: spec.assignment.instructions,
      due: 'Next class',
    },
    project: null,
    resources,
    engagement_tips: spec.tips?.length
      ? spec.tips
      : ['Work in pairs where machines are few', 'Celebrate a working program, then improve it'],
  };
}

export function assessmentPlanFromSpec(spec: SpineLessonSpec) {
  return {
    type: 'practical' as const,
    title: spec.check.title,
    format: spec.check.how,
    duration_minutes: 10,
    scoring_guide: spec.check.how,
  };
}

/**
 * Keep existing week titles and any subtopics already written. Fill empty
 * lesson_plan / assessment_plan so generators have a real spine to follow.
 */
export function attachSpineLessons(
  content: unknown,
  lessonsByTerm: SpineLessonSpec[][],
  meta: SpineCourseMeta,
): Record<string, unknown> {
  const current = asObject(content);
  const terms = asList(current.terms).map((rawTerm, termIndex) => {
    const term = asObject(rawTerm);
    const termNumber = Number(term.term) || termIndex + 1;
    const specTerm = lessonsByTerm[termIndex] ?? [];
    const weeks = asList(term.weeks).map((rawWeek, weekIndex) => {
      const week = asObject(rawWeek);
      const spec = specTerm[weekIndex];
      if (!spec) return week;
      const existingPlan = asObject(week.lesson_plan);
      const existingSubtopics = asStringList(week.subtopics);
      const existingTeacher = asStringList(existingPlan.teacher_activities);
      const existingStudents = asStringList(existingPlan.student_activities);
      const existingActivities = asStringList(existingPlan.activities);
      const plan = lessonPlanFromSpec(spec);
      if (existingTeacher.length) plan.teacher_activities = existingTeacher;
      if (existingStudents.length) plan.student_activities = existingStudents;
      else if (existingActivities.length && !plan.student_activities.length) {
        plan.student_activities = existingActivities;
      }
      if (existingActivities.length) plan.activities = existingActivities;
      const existingAssessment = asObject(week.assessment_plan);
      return {
        ...week,
        week: Number(week.week) || weekIndex + 1,
        type: week.type || 'lesson',
        subtopics: existingSubtopics.length ? existingSubtopics : spec.subtopics,
        lesson_plan: {
          ...plan,
          objectives: asStringList(existingPlan.objectives).length
            ? asStringList(existingPlan.objectives)
            : plan.objectives,
        },
        assessment_plan: Object.keys(existingAssessment).length
          ? existingAssessment
          : assessmentPlanFromSpec(spec),
      };
    });
    return {
      ...term,
      year: Number(term.year) || 1,
      term: termNumber,
      title: String(term.title || TERM_TITLE[termNumber] || `Term ${termNumber}`),
      objectives: asStringList(term.objectives).length
        ? asStringList(term.objectives)
        : specTerm.slice(0, 3).flatMap((row) => row.objectives.slice(0, 1)),
      weeks,
    };
  });

  return {
    ...current,
    course_title: String(current.course_title || meta.title),
    overview: String(current.overview || meta.overview),
    learning_outcomes: asStringList(current.learning_outcomes).length
      ? asStringList(current.learning_outcomes)
      : meta.outcomes,
    assessment_strategy: String(current.assessment_strategy || meta.assessmentStrategy),
    materials_required: asStringList(current.materials_required).length
      ? asStringList(current.materials_required)
      : meta.materials,
    recommended_tools: asStringList(current.recommended_tools).length
      ? asStringList(current.recommended_tools)
      : meta.tools,
    metadata: {
      ...asObject(current.metadata),
      format: 'school',
    },
    terms,
  };
}

export function buildSchoolSyllabus(
  meta: SpineCourseMeta,
  lessonsByTerm: SpineLessonSpec[][],
  topicsByTerm: string[][],
): Record<string, unknown> {
  const terms = lessonsByTerm.map((lessons, termIndex) => {
    const termNumber = termIndex + 1;
    const topics = topicsByTerm[termIndex] ?? [];
    return {
      year: 1,
      term: termNumber,
      title: TERM_TITLE[termNumber],
      objectives: lessons.slice(0, 3).flatMap((row) => row.objectives.slice(0, 1)),
      weeks: lessons.map((spec, weekIndex) => ({
        week: weekIndex + 1,
        type: /assessment|exam|project/i.test(topics[weekIndex] || '') ? 'assessment' : 'lesson',
        topic: topics[weekIndex] || spec.objectives[0],
        subtopics: spec.subtopics,
        lesson_plan: lessonPlanFromSpec(spec),
        assessment_plan: assessmentPlanFromSpec(spec),
      })),
    };
  });
  return {
    course_title: meta.title,
    overview: meta.overview,
    learning_outcomes: meta.outcomes,
    assessment_strategy: meta.assessmentStrategy,
    materials_required: meta.materials,
    recommended_tools: meta.tools,
    metadata: { format: 'school' },
    terms,
  };
}
