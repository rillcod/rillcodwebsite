const ALLOWED_PATTERN_FIELDS = new Set([
  'opening_routine',
  'teaching_approach',
  'activities',
  'materials',
  'examples',
  'engagement_tips',
  'differentiation',
  'assessment_style',
  'teacher_notes',
]);

export function sanitizeTeachingPattern(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => ALLOWED_PATTERN_FIELDS.has(key) && entry != null)
      .map(([key, entry]) => {
        if (typeof entry === 'string') return [key, entry.trim().slice(0, 4000)];
        if (Array.isArray(entry)) {
          return [key, entry
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().slice(0, 500))
            .filter(Boolean)
            .slice(0, 30)];
        }
        return [key, entry];
      }),
  );
}

export function teachingPatternAttemptsAcademicChange(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const blocked = new Set(['topic', 'subtopics', 'objectives', 'learning_outcomes', 'terms', 'weeks', 'grade', 'qa_spine']);
  return Object.keys(value as Record<string, unknown>).some((key) => blocked.has(key));
}

