/**
 * Identity belongs in foreign-key columns. AI payloads and copied authoring
 * metadata are untrusted and may echo a legacy lesson_plan_id key, so remove
 * that one key before persisting generated content.
 */
export function withoutLegacyLessonPlanMetadata(value: unknown): Record<string, unknown> {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
  delete record.lesson_plan_id;
  return record;
}
