export type LessonTeachingGuide = {
  objectives: string;
  activities: string;
  assessment_methods: string;
  staff_notes: string;
  summary_notes: string;
  plan_data: Record<string, unknown> | null;
};

const EMPTY_GUIDE: LessonTeachingGuide = {
  objectives: '',
  activities: '',
  assessment_methods: '',
  staff_notes: '',
  summary_notes: '',
  plan_data: null,
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function guideText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).join('\n');
  }
  return typeof value === 'string' ? value.trim() : '';
}

export function normaliseLessonTeachingGuide(value: unknown): LessonTeachingGuide {
  const guide = objectRecord(value);
  if (!guide) return { ...EMPTY_GUIDE };

  return {
    objectives: guideText(guide.objectives),
    activities: guideText(guide.activities),
    assessment_methods: guideText(guide.assessment_methods),
    staff_notes: guideText(guide.staff_notes),
    summary_notes: guideText(guide.summary_notes),
    plan_data: objectRecord(guide.plan_data),
  };
}

/**
 * The detailed guide belongs to the lesson itself. It is not a second
 * lesson_plan row: lesson_plans is reserved for the class/term parent.
 */
export function lessonTeachingGuideFromMetadata(metadata: unknown): LessonTeachingGuide {
  const record = objectRecord(metadata);
  return normaliseLessonTeachingGuide(record?.teaching_guide);
}

export function metadataWithLessonTeachingGuide(
  metadata: unknown,
  guide: unknown,
): Record<string, unknown> {
  return {
    ...(objectRecord(metadata) ?? {}),
    teaching_guide: normaliseLessonTeachingGuide(guide),
  };
}

