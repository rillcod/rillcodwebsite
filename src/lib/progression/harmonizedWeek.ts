import type {
  SyllabusAssessmentPlanSlice,
  SyllabusLessonPlanSlice,
  SyllabusWeekImport,
} from '@/lib/lesson-plans/syllabusImport';

export type HarmonizedWeekType = 'lesson' | 'assessment' | 'examination';

export type HarmonizedLessonPlan = {
  duration_minutes: number;
  objectives: string[];
  teacher_activities: string[];
  student_activities: string[];
  classwork: {
    title: string;
    instructions: string;
    materials: string[];
  };
  assignment: {
    title: string;
    instructions: string;
    due: string;
  };
  project: null | {
    title: string;
    description: string;
    deliverables: string[];
  };
  resources: string[];
  engagement_tips: string[];
};

export type HarmonizedAssessmentPlan = {
  type: 'written' | 'practical' | 'mixed';
  title: string;
  coverage: string[];
  format: string;
  duration_minutes: number;
  scoring_guide: string;
  teacher_prep: string[];
  sample_questions: string[];
};

type AssessmentBuilderInput = {
  weekType: HarmonizedWeekType;
  topic: string;
  subtopics: string[];
  assignmentTitle: string;
  classworkPrompt: string;
  conceptTags: string[];
};

type LessonBuilderInput = {
  topic: string;
  subtopics: string[];
  assignmentTitle: string;
  projectTitle: string;
  projectDescription: string;
  projectDeliverables: string[];
  classworkPrompt: string;
  estimatedMinutes: number;
  conceptTags: string[];
};

function cleanList(values: Array<string | null | undefined>): string[] {
  return values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
}

export function normalizeWeekType(
  weekNumber: number,
  totalWeeks: number,
  explicitType?: string | null,
): HarmonizedWeekType {
  const normalized = typeof explicitType === 'string' ? explicitType.trim().toLowerCase() : '';
  if (normalized === 'lesson' || normalized === 'assessment' || normalized === 'examination') {
    return normalized;
  }
  if (weekNumber === totalWeeks) return 'examination';
  if (weekNumber === 3 || (totalWeeks >= 6 && weekNumber === 6)) return 'assessment';
  return 'lesson';
}

export function normalizeObjectivesText(items: string[]): string {
  return cleanList(items).join('\n');
}

export function normalizeActivitiesText(items: string[]): string {
  return cleanList(items).join('\n\n');
}

export function buildTeacherActivities(topic: string, classworkPrompt: string): string[] {
  return [
    `Hook (5 min): Connect ${topic} to a familiar real-world problem and preview the weekly outcome.`,
    `Instruction (10 min): Explain the key idea behind ${topic} and highlight success criteria for the task.`,
    `Demo (10 min): Model the workflow for "${classworkPrompt}" and show one worked example.`,
    `Practice (10 min): Guide learners as they attempt the task, troubleshoot, and improve their output.`,
    'Wrap-Up (5 min): Review takeaways, check understanding, and prepare learners for the follow-up task.',
  ];
}

export function buildStudentActivities(topic: string, classworkPrompt: string): string[] {
  return [
    `Hook (5 min): Share prior knowledge and identify where ${topic} appears in everyday life.`,
    `Instruction (10 min): Listen, ask questions, and record the key rules or steps for the week.`,
    `Demo (10 min): Observe the model example and note the sequence needed for "${classworkPrompt}".`,
    `Practice (10 min): Complete the guided task, test ideas, and make corrections from feedback.`,
    'Wrap-Up (5 min): Summarize what was learned and state one improvement to apply in the next task.',
  ];
}

export function buildLessonPlan(input: LessonBuilderInput): HarmonizedLessonPlan {
  const objectives = cleanList([
    `Explain the core idea behind ${input.topic}.`,
    input.subtopics[0] ? `Apply ${input.subtopics[0]} during classwork and guided practice.` : null,
    'Produce a working outcome that can be reviewed or demonstrated.',
    'Reflect on strengths, mistakes, and next improvement steps.',
  ]);
  const teacherActivities = buildTeacherActivities(input.topic, input.classworkPrompt);
  const studentActivities = buildStudentActivities(input.topic, input.classworkPrompt);
  const materials = cleanList([
    'Laptop or tablet',
    'Internet connection or offline starter files',
    ...input.conceptTags.slice(0, 3).map((tag) => `${tag} reference notes`),
  ]);
  return {
    duration_minutes: Math.max(40, input.estimatedMinutes),
    objectives,
    teacher_activities: teacherActivities,
    student_activities: studentActivities,
    classwork: {
      title: `${input.topic} Guided Task`,
      instructions: input.classworkPrompt,
      materials,
    },
    assignment: {
      title: input.assignmentTitle,
      instructions: `Complete the follow-up task for ${input.topic}. Submit evidence of your work and a short explanation of your process.`,
      due: 'Next class',
    },
    project: {
      title: input.projectTitle,
      description: input.projectDescription,
      deliverables: input.projectDeliverables,
    },
    resources: cleanList([
      `${input.topic} walkthrough`,
      ...input.conceptTags.slice(0, 3).map((tag) => `${tag} practice examples`),
    ]),
    engagement_tips: [
      'Anchor the task in a Nigerian school or community use case.',
      'Use peer feedback before final submission.',
      'Let learners compare first attempt versus improved version.',
    ],
  };
}

export function buildAssessmentPlan(input: AssessmentBuilderInput): HarmonizedAssessmentPlan {
  const practical = input.weekType === 'assessment';
  const coverage = cleanList([
    input.topic,
    ...input.subtopics,
    ...input.conceptTags.slice(0, 3),
  ]);
  return {
    type: practical ? 'mixed' : 'practical',
    title: practical ? `${input.topic} Checkpoint Assessment` : `${input.topic} End-of-Term Examination`,
    coverage,
    format: practical
      ? 'Short recap questions plus practical performance task'
      : 'Practical build, oral defense, and cumulative review prompts',
    duration_minutes: input.weekType === 'examination' ? 80 : 40,
    scoring_guide: practical
      ? 'Score concept accuracy, practical completion, explanation quality, and improvement after feedback.'
      : 'Score cumulative understanding, build quality, clarity of explanation, and readiness for the next term.',
    teacher_prep: [
      'Prepare the marking guide and learner checklist.',
      `Review the classwork prompt: ${input.classworkPrompt}`,
      `Confirm assessment evidence to collect for ${input.assignmentTitle}.`,
    ],
    sample_questions: [
      `Explain how you would apply ${coverage[0] ?? input.topic} in a practical task.`,
      `Complete a short task that demonstrates ${coverage[1] ?? input.topic}.`,
      'Describe one challenge you faced and how you solved it.',
    ],
  };
}

function coerceLessonPlan(
  lessonPlan: SyllabusLessonPlanSlice | null | undefined,
): HarmonizedLessonPlan | null {
  if (!lessonPlan) return null;
  return {
    duration_minutes:
      typeof lessonPlan.duration_minutes === 'number' && Number.isFinite(lessonPlan.duration_minutes)
        ? lessonPlan.duration_minutes
        : 40,
    objectives: cleanList(lessonPlan.objectives ?? []),
    teacher_activities: cleanList(lessonPlan.teacher_activities ?? []),
    student_activities: cleanList(lessonPlan.student_activities ?? []),
    classwork: {
      title:
        typeof (lessonPlan.classwork as { title?: unknown } | undefined)?.title === 'string'
          ? ((lessonPlan.classwork as { title?: string }).title ?? '')
          : '',
      instructions:
        typeof (lessonPlan.classwork as { instructions?: unknown } | undefined)?.instructions === 'string'
          ? ((lessonPlan.classwork as { instructions?: string }).instructions ?? '')
          : '',
      materials: Array.isArray((lessonPlan.classwork as { materials?: unknown[] } | undefined)?.materials)
        ? cleanList(((lessonPlan.classwork as { materials?: string[] }).materials ?? []))
        : [],
    },
    assignment: {
      title:
        typeof (lessonPlan.assignment as { title?: unknown } | undefined)?.title === 'string'
          ? ((lessonPlan.assignment as { title?: string }).title ?? '')
          : '',
      instructions:
        typeof (lessonPlan.assignment as { instructions?: unknown } | undefined)?.instructions === 'string'
          ? ((lessonPlan.assignment as { instructions?: string }).instructions ?? '')
          : '',
      due:
        typeof (lessonPlan.assignment as { due?: unknown } | undefined)?.due === 'string'
          ? ((lessonPlan.assignment as { due?: string }).due ?? 'Next class')
          : 'Next class',
    },
    project:
      lessonPlan.project && typeof lessonPlan.project === 'object'
        ? {
            title:
              typeof (lessonPlan.project as { title?: unknown }).title === 'string'
                ? ((lessonPlan.project as { title?: string }).title ?? '')
                : '',
            description:
              typeof (lessonPlan.project as { description?: unknown }).description === 'string'
                ? ((lessonPlan.project as { description?: string }).description ?? '')
                : '',
            deliverables: Array.isArray((lessonPlan.project as { deliverables?: unknown[] }).deliverables)
              ? cleanList(((lessonPlan.project as { deliverables?: string[] }).deliverables ?? []))
              : [],
          }
        : null,
    resources: cleanList(lessonPlan.resources ?? []),
    engagement_tips: cleanList(lessonPlan.engagement_tips ?? []),
  };
}

function coerceAssessmentPlan(
  assessmentPlan: SyllabusAssessmentPlanSlice | null | undefined,
): HarmonizedAssessmentPlan | null {
  if (!assessmentPlan) return null;
  return {
    type:
      assessmentPlan.type === 'written' || assessmentPlan.type === 'practical' || assessmentPlan.type === 'mixed'
        ? assessmentPlan.type
        : 'mixed',
    title: typeof assessmentPlan.title === 'string' ? assessmentPlan.title : '',
    coverage: cleanList(assessmentPlan.coverage ?? []),
    format: typeof assessmentPlan.format === 'string' ? assessmentPlan.format : '',
    duration_minutes:
      typeof assessmentPlan.duration_minutes === 'number' && Number.isFinite(assessmentPlan.duration_minutes)
        ? assessmentPlan.duration_minutes
        : 40,
    scoring_guide: typeof assessmentPlan.scoring_guide === 'string' ? assessmentPlan.scoring_guide : '',
    teacher_prep: cleanList(assessmentPlan.teacher_prep ?? []),
    sample_questions: cleanList(assessmentPlan.sample_questions ?? []),
  };
}

export function buildCanonicalWeekShape(input: {
  weekNumber: number;
  totalWeeks: number;
  topic: string;
  subtopics: string[];
  assignmentTitle: string;
  projectTitle: string;
  projectDescription: string;
  projectDeliverables: string[];
  classworkPrompt: string;
  estimatedMinutes: number;
  conceptTags: string[];
  curriculumWeek?: SyllabusWeekImport | null;
}): {
  type: HarmonizedWeekType;
  topic: string;
  subtopics: string[];
  objectiveItems: string[];
  objectivesText: string;
  activitiesText: string;
  notesText: string;
  lessonPlan: HarmonizedLessonPlan | null;
  assessmentPlan: HarmonizedAssessmentPlan | null;
} {
  const weekType = normalizeWeekType(input.weekNumber, input.totalWeeks, input.curriculumWeek?.type ?? null);
  const topic = input.curriculumWeek?.topic?.trim() || input.topic;
  const subtopics = cleanList(input.curriculumWeek?.subtopics ?? input.subtopics);
  const fallbackLessonPlan = buildLessonPlan({
    topic,
    subtopics,
    assignmentTitle: input.assignmentTitle,
    projectTitle: input.projectTitle,
    projectDescription: input.projectDescription,
    projectDeliverables: input.projectDeliverables,
    classworkPrompt: input.classworkPrompt,
    estimatedMinutes: input.estimatedMinutes,
    conceptTags: input.conceptTags,
  });
  const fallbackAssessmentPlan = buildAssessmentPlan({
    weekType,
    topic,
    subtopics,
    assignmentTitle: input.assignmentTitle,
    classworkPrompt: input.classworkPrompt,
    conceptTags: input.conceptTags,
  });
  const lessonPlan = weekType === 'lesson'
    ? (coerceLessonPlan(input.curriculumWeek?.lesson_plan) ?? fallbackLessonPlan)
    : null;
  const assessmentPlan = weekType === 'lesson'
    ? null
    : (coerceAssessmentPlan(input.curriculumWeek?.assessment_plan) ?? fallbackAssessmentPlan);
  const objectiveItems = weekType === 'lesson'
    ? lessonPlan?.objectives ?? fallbackLessonPlan.objectives
    : assessmentPlan?.coverage ?? fallbackAssessmentPlan.coverage;
  const activityItems = weekType === 'lesson'
    ? lessonPlan?.student_activities ?? fallbackLessonPlan.student_activities
    : assessmentPlan?.teacher_prep ?? fallbackAssessmentPlan.teacher_prep;
  const notesParts = weekType === 'lesson'
    ? cleanList([
        (lessonPlan?.teacher_activities ?? fallbackLessonPlan.teacher_activities).join('\n'),
        `Classwork: ${(lessonPlan?.classwork.title ?? fallbackLessonPlan.classwork.title).trim()}`,
        (lessonPlan?.resources ?? fallbackLessonPlan.resources).join('\n'),
      ])
    : cleanList([
        `Assessment format: ${assessmentPlan?.format ?? fallbackAssessmentPlan.format}`,
        `Scoring guide: ${assessmentPlan?.scoring_guide ?? fallbackAssessmentPlan.scoring_guide}`,
        (assessmentPlan?.teacher_prep ?? fallbackAssessmentPlan.teacher_prep).join('\n'),
      ]);
  return {
    type: weekType,
    topic,
    subtopics,
    objectiveItems,
    objectivesText: normalizeObjectivesText(objectiveItems),
    activitiesText: normalizeActivitiesText(activityItems),
    notesText: notesParts.join('\n\n'),
    lessonPlan,
    assessmentPlan,
  };
}
