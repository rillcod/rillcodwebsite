import { describe, expect, it } from 'vitest';
import { findBlockingExamForMaterial, isExamCurrentlyLive } from './exam-material-lock';

describe('exam-material-lock', () => {
  const now = new Date('2026-11-22T10:00:00Z').getTime();

  it('detects whether an exam is currently live within its window', () => {
    expect(
      isExamCurrentlyLive(
        { id: 'e1', title: 'Live', is_active: true, start_date: '2026-11-22T09:00:00Z', end_date: '2026-11-22T11:00:00Z' },
        now,
      ),
    ).toBe(true);
    expect(
      isExamCurrentlyLive(
        { id: 'e2', title: 'Future', is_active: true, start_date: '2026-11-22T12:00:00Z', end_date: '2026-11-22T13:00:00Z' },
        now,
      ),
    ).toBe(false);
    expect(
      isExamCurrentlyLive(
        { id: 'e3', title: 'Inactive', is_active: false },
        now,
      ),
    ).toBe(false);
  });

  it('locks referenced lessons, course lessons, and direct media paths during a live official exam', () => {
    const liveExams = [
      {
        id: 'exam-1',
        title: 'Python Term Exam',
        course_id: 'course-py',
        is_active: true,
        start_date: '2026-11-22T09:00:00Z',
        end_date: '2026-11-22T11:00:00Z',
        metadata: {
          assessment_scope: 'class_result',
          referenced_lesson_ids: ['lesson-9'],
          referenced_material_urls: ['https://www.rillcod.com/api/media/school1/notes.pdf'],
          lock_materials_during_exam: true,
        },
      },
    ];

    expect(findBlockingExamForMaterial(liveExams, { lessonId: 'lesson-9' }, now).locked).toBe(true);
    expect(findBlockingExamForMaterial(liveExams, { courseId: 'course-py' }, now).locked).toBe(true);
    expect(findBlockingExamForMaterial(liveExams, { mediaPath: 'school1/notes.pdf' }, now).locked).toBe(true);
    expect(findBlockingExamForMaterial(liveExams, { lessonId: 'other', courseId: 'other' }, now).locked).toBe(false);
  });

  it('does not lock materials for practice-only exams', () => {
    const practiceExams = [
      {
        id: 'exam-2',
        title: 'Practice Quiz',
        course_id: 'course-py',
        is_active: true,
        metadata: { assessment_scope: 'practice', result_eligible: false },
      },
    ];
    expect(findBlockingExamForMaterial(practiceExams, { courseId: 'course-py' }, now).locked).toBe(false);
  });
});
