export function missingCustomerTags(sender: { school_name?: string | null; section_class?: string | null }) {
  const missing: string[] = [];
  if (!sender.school_name || !String(sender.school_name).trim()) missing.push('school_name');
  if (!sender.section_class || !String(sender.section_class).trim()) missing.push('section_class');
  return missing;
}

export function normalizeGradeValue(grade: unknown): number | null | undefined {
  return typeof grade === 'number' && Number.isFinite(grade) ? grade : grade === null ? null : undefined;
}

export function hasPlanBindings(plan: { course_id?: string | null; school_id?: string | null }) {
  return Boolean(plan.course_id && plan.school_id);
}

export function validateLessonPlanForGeneration(
  plan: unknown,
): { error: string; status: number } | null {
  if (!plan) return { error: 'Lesson plan not found', status: 404 };
  const p = plan as { status?: string; course_id?: string | null; school_id?: string | null };
  if (p.status !== 'published') {
    return { error: 'Only published plans can generate content', status: 422 };
  }
  if (!hasPlanBindings(p)) {
    return { error: 'Lesson plan is missing course or school binding', status: 422 };
  }
  return null;
}

export function isConversationInScope(
  caller: { role: string; school_id: string | null },
  conversation: { school_id: string | null },
) {
  if (caller.role === 'admin') return true;
  if (!caller.school_id) return true;
  if (!conversation.school_id) return true;
  return conversation.school_id === caller.school_id;
}
