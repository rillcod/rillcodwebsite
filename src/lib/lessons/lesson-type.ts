/** Allowed lesson_type values — keep in sync with DB check constraint migrations. */
export const ALLOWED_LESSON_TYPES = [
  'lesson', 'video', 'interactive', 'hands-on', 'hands_on', 'workshop',
  'coding', 'reading', 'quiz', 'assignment', 'article', 'project', 'lab',
  'live', 'practice', 'checkpoint', 'robotics', 'electronics', 'mechanics',
  'design', 'iot', 'ai',
] as const;

export type AllowedLessonType = (typeof ALLOWED_LESSON_TYPES)[number];

export function normalizeLessonType(input: string | undefined | null, fallback = 'lesson'): string {
  const t = (input ?? '').trim();
  if (t && (ALLOWED_LESSON_TYPES as readonly string[]).includes(t)) return t;
  return fallback;
}
