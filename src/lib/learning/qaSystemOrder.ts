/**
 * Single linear map: how QA spine, syllabus, and lesson delivery connect.
 * Keep dashboard copy and any future tooling in sync by importing this only.
 */
export const QA_CATALOG_VERSION = 'qa_spine_v1' as const;

/** Public JSON export path — same map as the System map UI. */
export const LEARNING_SYSTEM_MAP_API_PATH = '/api/learning-system-map' as const;

/** Where “version” lives — you can show these as chips in UI; QA catalog is not frozen forever. */
export const LEARNING_VERSIONING = {
  syllabusDocument: {
    label: 'Syllabus copy version',
    where: 'course_curricula.version',
    note: 'Bumps on each save: AI generate, hand edits, or Apply QA spine. Each school/course can have its own row.',
  },
  qaSpineCatalog: {
    label: 'QA week spine catalog',
    where: 'platform_syllabus_week_template.catalog_version',
    current: QA_CATALOG_VERSION,
    note: 'Not permanent — a future migration can add qa_spine_v2 or reseed rows. "Recent QA" = whatever migrations last wrote.',
  },
  curriculumMetadata: {
    label: 'Last spine apply',
    where: 'course_curricula.content.metadata.qa_spine (when set)',
    note: 'Records lane, class_id, program_year, path_offset, catalog_version at apply time for audit.',
  },
  classQa: {
    label: 'Class alignment',
    where: 'classes.qa_grade_mode, qa_spine_lane, …',
    note: 'optional | compulsory (grade) — lets you enforce standardisation per class or stay flexible.',
  },
} as const;

/**
 * You can run the product in more than one way; nothing here is a second code path,
 * it is the policy you adopt operationally. Compulsory org-wide standard is team process + class fields;
 * "traditional" = skip Apply spine and use week-by-week syllabus/lesson flow only.
 */
export const DELIVERY_MODE_CHOICES = [
  {
    id: 'qa_spine_optional' as const,
    title: 'QA spine: optional',
    body:
      'Use the Curriculum → Optional QA panel to preview/apply. Discard anytime and keep a freeform or AI syllabus.',
  },
  {
    id: 'qa_spine_compulsory' as const,
    title: 'Your standard: make spine compulsory',
    body:
      'Adopt the template as the house rule: set class `qa_*` and apply the spine to every new course_curricula for that scope; new migrations still update the catalog in one place (not scattered copies).',
  },
  {
    id: 'traditional_week' as const,
    title: 'Traditional week-by-week',
    body:
      'Ignore spine injection: build terms with /api/curricula generate or manual weeks, track on the same term/week grid without metadata.qa_spine.',
  },
];

export type QaSystemLayer = {
  order: number;
  title: string;
  purpose: string;
  db: { name: string; note?: string }[];
  sqlMigrations: string[];
  apiRoutes: string[];
  appPaths: { label: string; path: string }[];
  codeRefs?: string[];
};

/** Ordered from catalog → published learning (same spine can serve many schools). */
export const LEARNING_QA_SYSTEM_ORDER: QaSystemLayer[] = [
  {
    order: 1,
    title: 'Programme & course catalog',
    purpose:
      'Every course belongs to a programme. All downstream IDs (curriculum, spine rows) key off `programs.id` and `courses.id`.',
    db: [
      { name: 'public.programs' },
      { name: 'public.courses', note: 'program_id links course to programme' },
    ],
    sqlMigrations: ['20260419_program_levels.sql (and related)'],
    apiRoutes: ['/api/programs', `${LEARNING_SYSTEM_MAP_API_PATH} (full map as JSON)`],
    appPaths: [
      { label: 'Curriculum (pick course)', path: '/dashboard/curriculum' },
    ],
  },
  {
    order: 2,
    title: 'Canonical week spine (platform template)',
    purpose:
      'The shared topic pattern for young innovators and teen developers: 11 lanes × 108 weeks (plus one short lane), versioned by `catalog_version` so 50+ schools can align to one standard.',
    db: [
      { name: 'public.platform_syllabus_week_template', note: 'Read-only for teachers; seeded via migration' },
    ],
    sqlMigrations: ['20260422120000_platform_syllabus_week_template.sql'],
    apiRoutes: ['/api/platform-syllabus-template'],
    appPaths: [
      { label: 'Curriculum → Optional QA week spine (panel)', path: '/dashboard/curriculum' },
    ],
    codeRefs: ['src/lib/qa/rotatedSpineIndex.ts', 'src/lib/catalog/platformSpineToSyllabusWeeks.ts'],
  },
  {
    order: 3,
    title: 'Per-school & per-class alignment',
    purpose:
      'Optional `classes` fields pin grade/track/lane; `class_qa_path_offset` gives a deterministic 0–107 rotation so delivery order differs by class while topics stay on the same spine.',
    db: [
      { name: 'public.classes', note: 'qa_spine_lane, qa_grade_key, qa_track_hint, …' },
    ],
    sqlMigrations: ['20260422140000_class_qa_explicit_topics_and_path.sql'],
    apiRoutes: [
      'RPC class_qa_path_offset (via /api/curricula/apply-qa-spine, /api/classes/[id]/qa-spine-preview)',
      'PATCH /api/classes/[id] (qa_* fields whitelisted)',
    ],
    appPaths: [
      { label: 'Class edit (QA fields)', path: '/dashboard/classes' },
    ],
    codeRefs: ['src/lib/qa/resolveQaSpineLane.ts'],
  },
  {
    order: 4,
    title: 'School / platform syllabus document',
    purpose:
      'The working syllabus JSON lives in `course_curricula` (per course, optional `school_id`). AI generation or QA spine application writes `content.terms[].weeks[]`.',
    db: [
      { name: 'public.course_curricula', note: 'content JSON; metadata.qa_spine when spine applied' },
    ],
    sqlMigrations: ['20260501000012_course_curricula.sql'],
    apiRoutes: [
      '/api/curricula (GET list, POST generate)',
      'POST /api/curricula/apply-qa-spine',
      'GET/PATCH /api/curricula/[id]',
    ],
    appPaths: [{ label: 'Course Syllabus tab', path: '/dashboard/curriculum' }],
  },
  {
    order: 5,
    title: 'Term progression: generate, lock, schedule',
    purpose:
      'Comes **after the QA/regular syllabus** and **before** day-to-day teaching operations: on a term lesson plan linked to that syllabus, `generate-progression` turns the course contract into per-year/term week grids in `plan_data.progression` (then draft → approved → locked; `term_schedules` for release rhythm). This is the structural bridge — not “last” after assignments; it **sets the rails** before lessons, projects, and homework.',
    db: [
      { name: 'lesson_plans.plan_data.progression', note: 'generated_terms, y{n}t{n} week grids, term_status' },
      { name: 'public.progression_override_audit', note: 'term lock / override audit' },
      { name: 'public.term_schedules', note: 'active week pointer per plan' },
    ],
    sqlMigrations: [
      '20260501000013_term_schedules.sql',
      '20260422000010_progression_lock_audit.sql',
      '20260622000001_school_progression_policy.sql',
      '20260622000002_progression_engine.sql',
    ],
    apiRoutes: [
      'POST /api/lesson-plans/[id]/generate-progression',
      'PATCH /api/lesson-plans/[id] (progression_term_status_update)',
      'GET /api/cron/term-scheduler (release weeks)',
    ],
    appPaths: [
      { label: 'Lesson plans (link syllabus, then generate progression)', path: '/dashboard/lesson-plans' },
      { label: 'Student progression (end of term / promote)', path: '/dashboard/progression' },
    ],
    codeRefs: ['src/lib/progression/termStatus.ts', 'src/app/api/lesson-plans/[id]/generate-progression/route.ts'],
  },
  {
    order: 6,
    title: 'Week delivery tracking',
    purpose:
      'Operational pulse on the **same** term/weeks as the syllabus and progression: mark completed / in progress while you teach (after the plan structure exists).',
    db: [{ name: 'curriculum week tracking (see migration 20260501000050_curriculum_tracking.sql)' }],
    sqlMigrations: ['20260501000050_curriculum_tracking.sql'],
    apiRoutes: ['/api/curricula/[id]/track', '/api/curricula/progress'],
    appPaths: [
      { label: 'Progress', path: '/dashboard/curriculum/progress' },
    ],
  },
  {
    order: 7,
    title: 'Lesson plans & live lessons',
    purpose:
      'Teach the weeks: build or publish individual `lessons` under the same `curriculum_version_id` / plan so they match the QA spine and generated progression (operational layer **after** structure).',
    db: [
      { name: 'public.lesson_plans', note: 'curriculum_version_id → course_curricula' },
      { name: 'public.lessons' },
    ],
    sqlMigrations: ['20260501000012_course_curricula.sql (FK)'],
    apiRoutes: ['/api/lesson-plans', '/api/lessons'],
    appPaths: [
      { label: 'Lesson plans', path: '/dashboard/lesson-plans' },
      { label: 'Add lesson', path: '/dashboard/lessons/add' },
    ],
  },
  {
    order: 8,
    title: 'Assignments, projects, CBT, flashcards',
    purpose: 'Content types generated from the same week topic — metadata often stores curriculum_id + week.',
    db: [{ name: 'public.assignments' }, { name: '… (domain-specific tables)' }],
    sqlMigrations: ['(see 20260501000058_expand_lesson_types.sql, etc.)'],
    apiRoutes: ['/api/assignments (and related)'],
    appPaths: [
      { label: 'Curriculum → Generate tab', path: '/dashboard/curriculum?tab=generate' },
    ],
  },
];

export function getLearningQaSystemSummary(): string {
  return LEARNING_QA_SYSTEM_ORDER.map((l) => `${l.order}. ${l.title}`).join(' → ');
}

/** Short labels for the horizontal “linear flow” strip (same order as `LEARNING_QA_SYSTEM_ORDER`). */
export const LEARNING_FLOW_STRIP_LABELS: Record<number, string> = {
  1: 'Catalog',
  2: 'Spine',
  3: 'Class',
  4: 'Syllabus',
  5: 'Term prog.',
  6: 'Track',
  7: 'Lessons',
  8: 'Assign / CBT',
};

export type LearningSystemMapApiResponse = {
  version: '1';
  generatedAt: string;
  catalogVersion: string;
  summary: string;
  source: 'src/lib/learning/qaSystemOrder.ts';
  layers: QaSystemLayer[];
  versioning: typeof LEARNING_VERSIONING;
  deliveryModeChoices: typeof DELIVERY_MODE_CHOICES;
};

export function buildLearningSystemMapResponse(): LearningSystemMapApiResponse {
  return {
    version: '1',
    generatedAt: new Date().toISOString(),
    catalogVersion: QA_CATALOG_VERSION,
    summary: getLearningQaSystemSummary(),
    source: 'src/lib/learning/qaSystemOrder.ts',
    layers: LEARNING_QA_SYSTEM_ORDER,
    versioning: LEARNING_VERSIONING,
    deliveryModeChoices: DELIVERY_MODE_CHOICES,
  };
}
