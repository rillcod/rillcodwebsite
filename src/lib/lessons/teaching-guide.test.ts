import { describe, expect, it } from 'vitest';
import {
  lessonTeachingGuideFromMetadata,
  metadataWithLessonTeachingGuide,
  normaliseLessonTeachingGuide,
} from './teaching-guide';

describe('lesson teaching guide identity', () => {
  it('keeps the rich guide on the lesson metadata', () => {
    const metadata = metadataWithLessonTeachingGuide(
      { source: 'teacher', legacy_note: 'keep this unrelated authoring detail' },
      {
        objectives: ['Explain loops', 'Build a counter'],
        activities: '  Pair exercise  ',
        assessment_methods: 'Exit ticket',
        staff_notes: 'Watch pacing',
        plan_data: { course_title: 'Python' },
      },
    );

    expect(metadata.source).toBe('teacher');
    expect(metadata.legacy_note).toBe('keep this unrelated authoring detail');
    expect(lessonTeachingGuideFromMetadata(metadata)).toEqual({
      objectives: 'Explain loops\nBuild a counter',
      activities: 'Pair exercise',
      assessment_methods: 'Exit ticket',
      staff_notes: 'Watch pacing',
      summary_notes: '',
      plan_data: { course_title: 'Python' },
    });
  });

  it('returns a stable empty guide for old lessons', () => {
    expect(normaliseLessonTeachingGuide(null)).toEqual({
      objectives: '',
      activities: '',
      assessment_methods: '',
      staff_notes: '',
      summary_notes: '',
      plan_data: null,
    });
  });

  it('does not accept arrays as structural plan data', () => {
    expect(normaliseLessonTeachingGuide({ plan_data: ['not', 'a', 'record'] }).plan_data)
      .toBeNull();
  });
});
