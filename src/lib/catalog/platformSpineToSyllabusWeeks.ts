export type SyllabusWeekDraft = {
  week: number;
  type: 'lesson' | 'assessment' | 'examination';
  topic: string;
  subtopics?: string[];
  lesson_plan?: Record<string, unknown> | null;
  assessment_plan?: Record<string, unknown> | null;
};

/** Row shape returned from `platform_syllabus_week_template` (subset). */
export type PlatformSpineRow = {
  lane_index: number;
  week_index: number;
  year_number: number;
  term_number: number;
  week_number: number;
  topic: string;
  subtopics?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/**
 * Maps DB template rows for one academic year/term into syllabus `weeks[]`
 * (lesson type, topics + subtopics). Lesson_plan bodies stay null so QA
 * can layer AI-generated detail without losing the fixed topic spine.
 */
export function platformSpineRowsToSyllabusWeeks(
  rows: PlatformSpineRow[],
  yearNumber: number,
  termNumber: number,
): SyllabusWeekDraft[] {
  return rows
    .filter((r) => r.year_number === yearNumber && r.term_number === termNumber)
    .sort((a, b) => a.week_number - b.week_number)
    .map((r) => ({
      week: r.week_number,
      type: 'lesson' as const,
      topic: r.topic,
      subtopics: asStringArray(r.subtopics),
      lesson_plan: null,
    }));
}
