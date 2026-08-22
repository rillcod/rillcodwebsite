export function missingCustomerTags(sender: { school_name?: string | null; section_class?: string | null }) {
  const missing: string[] = [];
  if (!sender.school_name || !String(sender.school_name).trim()) missing.push('school_name');
  if (!sender.section_class || !String(sender.section_class).trim()) missing.push('section_class');
  return missing;
}

export function normalizeGradeValue(grade: unknown): number | null | undefined {
  return typeof grade === 'number' && Number.isFinite(grade) ? grade : grade === null ? null : undefined;
}

export function normalizeGradeValueWithMax(
  grade: unknown,
  maxPoints: number | null | undefined,
): { value: number | null | undefined; error?: string } {
  const value = normalizeGradeValue(grade);
  if (value == null) return { value };

  const max = typeof maxPoints === 'number' && Number.isFinite(maxPoints) && maxPoints > 0
    ? maxPoints
    : 100;

  if (value < 0 || value > max) {
    return { value: undefined, error: `Grade must be between 0 and ${max}.` };
  }

  return { value };
}

const ALLOWED_SUBMISSION_STATUSES = new Set([
  'draft', 'submitted', 'late', 'pending_review', 'under_review',
  'returned_for_revision', 'resubmitted', 'graded', 'moderated',
  'published', 'missing',
]);

export function normalizeSubmissionStatus(status: unknown): { value: string | undefined; error?: string } {
  if (status === undefined) return { value: undefined };
  if (typeof status !== 'string' || !ALLOWED_SUBMISSION_STATUSES.has(status)) {
    return {
      value: undefined,
      error: 'status must be a supported submission review state',
    };
  }
  return { value: status };
}

export function hasPlanBindings(plan: { course_id?: string | null; school_id?: string | null }) {
  return Boolean(plan.course_id && plan.school_id);
}

export type LessonPlanGenerationBlock = {
  error: string;
  status: number;
  /** Machine-readable cause, so a UI can stop the whole run instead of failing every step. */
  reason: 'not_found' | 'not_published' | 'missing_binding';
  /** Plain-English explanation of what to do about it. */
  detail?: string;
  action_href?: string;
  action_label?: string;
};

/**
 * Gate for every generator that builds content from a plan's syllabus.
 *
 * Draft plans are deliberately refused: content generated from a syllabus the
 * teacher is still editing gets saved against the class and then has to be
 * unpicked. The refusal carries the plan id and a publish link, because the
 * error on its own is a dead end — a teacher told "only published plans can
 * generate content" has no way to know which plan, or where to publish it.
 */
export function validateLessonPlanForGeneration(
  plan: unknown,
): LessonPlanGenerationBlock | null {
  if (!plan) {
    return {
      error: 'Lesson plan not found',
      status: 404,
      reason: 'not_found',
      detail: 'This class has no teaching plan to generate from yet.',
    };
  }
  const p = plan as {
    id?: string | null;
    status?: string;
    course_id?: string | null;
    school_id?: string | null;
  };
  const planHref = p.id ? `/dashboard/lesson-plans/${p.id}` : undefined;

  if (p.status !== 'published') {
    return {
      error: 'Only published plans can generate content',
      status: 422,
      reason: 'not_published',
      detail:
        `This teaching plan is still a ${p.status ?? 'draft'}. Publish it and the ` +
        'whole week — lesson, slides, flashcards, assignment and project — will generate.',
      action_href: planHref,
      action_label: planHref ? 'Open plan to publish' : undefined,
    };
  }
  if (!hasPlanBindings(p)) {
    return {
      error: 'Lesson plan is missing course or school binding',
      status: 422,
      reason: 'missing_binding',
      detail:
        'The plan is not linked to both a course and a school, so there is no syllabus to generate from.',
      action_href: planHref,
      action_label: planHref ? 'Open plan' : undefined,
    };
  }
  return null;
}

export function isConversationInScope(
  caller: { role: string; school_id: string | null },
  conversation: { school_id: string | null },
) {
  if (caller.role === 'admin') return true;
  // Partner school managers must stay on their campus only — no null-school legacy bypass.
  if (caller.role === 'school') {
    if (!caller.school_id || !conversation.school_id) return false;
    return conversation.school_id === caller.school_id;
  }
  if (!caller.school_id) return true;
  if (!conversation.school_id) return true;
  return conversation.school_id === caller.school_id;
}
