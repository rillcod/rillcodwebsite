import { describe, expect, it } from 'vitest';
import type { StudentProgramScope } from '@/lib/assignments/visibility';
import {
  flashcardDeckVisibleToStudent,
  type FlashcardCaller,
  type FlashcardDeckScope,
} from './auth';

const learner: FlashcardCaller = {
  id: 'student-1',
  role: 'student',
  school_id: 'school-1',
  class_id: 'class-1',
};

const scope: StudentProgramScope = {
  programIds: new Set(['program-1']),
  courseIds: new Set(['course-1']),
};

const deck = (overrides: Partial<FlashcardDeckScope> = {}): FlashcardDeckScope => ({
  id: 'deck-1',
  created_by: 'teacher-1',
  school_id: 'school-1',
  class_id: 'class-1',
  course_id: 'course-1',
  is_public: true,
  lesson_plan_id: 'plan-1',
  courses: { program_id: 'program-1' },
  lesson_plans: { class_id: 'class-1' },
  ...overrides,
});

describe('student flashcard visibility', () => {
  it('keeps a released deck inside its own class', () => {
    expect(flashcardDeckVisibleToStudent(learner, deck(), scope)).toBe(true);
    expect(
      flashcardDeckVisibleToStudent(
        learner,
        deck({ class_id: 'class-2', lesson_plans: { class_id: 'class-2' } }),
        scope,
      ),
    ).toBe(false);
  });

  it('recovers the class boundary from the plan for older decks', () => {
    expect(
      flashcardDeckVisibleToStudent(
        learner,
        deck({ class_id: null, lesson_plans: { class_id: 'class-2' } }),
        scope,
      ),
    ).toBe(false);
  });

  it('never exposes a plan deck still held for teacher review', () => {
    expect(
      flashcardDeckVisibleToStudent(learner, deck({ is_public: false }), scope),
    ).toBe(false);
  });

  it('allows a public course deck when it belongs to the learner programme', () => {
    expect(
      flashcardDeckVisibleToStudent(
        learner,
        deck({ class_id: null, lesson_plan_id: null, lesson_plans: null }),
        scope,
      ),
    ).toBe(true);
  });
});
