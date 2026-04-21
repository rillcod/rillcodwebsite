/**
 * Build navigation to /dashboard/lessons/add with curriculum week context.
 * Uses URL params for small payloads; sessionStorage fallback when the plan JSON is too long for URLs.
 */
const URL_SAFE_PLAN_MAX = 4500;

export type CurriculumWeekPlanSlice = {
  objectives?: string[];
  teacher_activities?: string[];
  student_activities?: string[];
  classwork?: unknown;
  resources?: string[];
  engagement_tips?: string[];
  assignment?: unknown;
  project?: unknown;
};

const SESSION_PREFIX = 'rillcod:curriculum-lesson-plan:';

export function stashCurriculumLessonPlan(plan: CurriculumWeekPlanSlice): string {
  const key = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `lp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(plan));
  } catch {
    /* quota or private mode — caller may still navigate without plan */
  }
  return key;
}

export function peekStashedCurriculumLessonPlan(key: string): CurriculumWeekPlanSlice | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as CurriculumWeekPlanSlice;
  } catch {
    return null;
  }
}

export function consumeStashedCurriculumLessonPlan(key: string): CurriculumWeekPlanSlice | null {
  const data = peekStashedCurriculumLessonPlan(key);
  try {
    sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
  } catch { /* ignore */ }
  return data;
}

/** Remove stashed plan after a successful save (or when abandoning the draft). */
export function clearStashedCurriculumLessonPlan(key: string) {
  try {
    sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
  } catch { /* ignore */ }
}

export function buildAddLessonQueryFromCurriculum(opts: {
  curriculumId: string;
  term: number;
  weekNumber: number;
  courseId: string;
  programId?: string | null;
  title: string;
  description: string;
  durationMinutes: number;
  plan?: CurriculumWeekPlanSlice | null;
}): URLSearchParams {
  const params = new URLSearchParams({
    source: 'curriculum',
    curriculum_id: opts.curriculumId,
    term: String(opts.term),
    week: String(opts.weekNumber),
    course_id: opts.courseId,
    program_id: (opts.programId ?? '').trim(),
    title: opts.title.slice(0, 240),
    description: (opts.description ?? '').slice(0, 800),
    duration: String(Math.min(480, Math.max(5, opts.durationMinutes || 60))),
  });

  if (opts.plan) {
    const json = JSON.stringify(opts.plan);
    if (json.length <= URL_SAFE_PLAN_MAX) {
      params.set('lesson_plan', json);
    } else {
      const key = stashCurriculumLessonPlan(opts.plan);
      params.set('lesson_plan_key', key);
    }
  }

  return params;
}
