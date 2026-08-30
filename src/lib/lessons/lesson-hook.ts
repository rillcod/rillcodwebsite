export type LessonHookData = {
  hook_title: string;
  hook: string;
  real_world_example: string;
  challenge_question: string;
};

/** Keep AI opener data small, predictable and safe to render or persist. */
export function parseLessonHook(value: unknown): LessonHookData | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.hook !== 'string' || !row.hook.trim()) return null;
  return {
    hook_title:
      typeof row.hook_title === 'string' && row.hook_title.trim()
        ? row.hook_title.trim()
        : 'Lesson opener',
    hook: row.hook.trim(),
    real_world_example:
      typeof row.real_world_example === 'string' ? row.real_world_example.trim() : '',
    challenge_question:
      typeof row.challenge_question === 'string' ? row.challenge_question.trim() : '',
  };
}
