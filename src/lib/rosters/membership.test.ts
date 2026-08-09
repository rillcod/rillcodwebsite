import { describe, expect, it } from 'vitest';
import { classHeadcount, classMemberIds, contradictedLearners } from './membership';

const CLASS = 'class-1';
const THIS_TERM = 'term-now';
const LAST_TERM = 'term-past';

const learner = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, class_id: CLASS, is_active: true, is_deleted: false, ...overrides,
});
const row = (student_id: string, status: string, term_id: string | null = THIS_TERM) => ({
  class_id: CLASS, student_id, term_id, status,
});

describe('who is in a class', () => {
  it('counts an active roster row for this term', () => {
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'active')],
      learners: [learner('a')],
    })).toBe(1);
  });

  it('does not count someone withdrawn this term', () => {
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'withdrawn')],
      learners: [learner('a')],
    })).toBe(0);
  });

  it('keeps a withdrawal that was recorded in an earlier term', () => {
    // The live bug. Withdraw in Third Term, class rolls to First Term, the
    // withdrawal no longer matches the current term — and the learner was
    // counted back in. Nine learners across six classes.
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'withdrawn', LAST_TERM)],
      learners: [learner('a')],
    })).toBe(0);
  });

  it('still counts a learner who was never rostered at all', () => {
    // Some placement paths write class_id without a roster row. Dropping these
    // would hide real children from their own class.
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [],
      learners: [learner('a')],
    })).toBe(1);
  });

  it('counts a learner with an active row from an earlier term but none for this one', () => {
    // Deliberately kept. Dropping them would turn an incomplete term
    // roll-forward into a silent undercount — the failure this exists to stop.
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'active', LAST_TERM)],
      learners: [learner('a')],
    })).toBe(1);
  });

  it('counts a reinstated learner, because reinstatement writes a fresh active row', () => {
    expect(classMemberIds({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'withdrawn', LAST_TERM), row('a', 'active', THIS_TERM)],
      learners: [learner('a')],
    })).toEqual(new Set(['a']));
  });

  it('ignores deleted and deactivated accounts', () => {
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [],
      learners: [learner('a', { is_deleted: true }), learner('b', { is_active: false })],
    })).toBe(0);
  });

  it('ignores learners belonging to another class', () => {
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [],
      learners: [learner('a', { class_id: 'class-2' })],
    })).toBe(0);
  });

  it('treats removed and ended the same as withdrawn', () => {
    expect(classHeadcount({
      classId: CLASS, termId: THIS_TERM,
      rosterRows: [row('a', 'removed', LAST_TERM), row('b', 'ended', LAST_TERM)],
      learners: [learner('a'), learner('b')],
    })).toBe(0);
  });
});

describe('learners whose records contradict each other', () => {
  it('finds withdrawn-but-still-tied learners without repairing them', () => {
    // Whether they are back or gone is a decision about a child. Reported, not
    // guessed.
    expect(contradictedLearners({
      rosterRows: [row('a', 'withdrawn', LAST_TERM), row('b', 'active')],
      learners: [learner('a'), learner('b')],
    })).toEqual([{ learnerId: 'a', classId: CLASS }]);
  });

  it('does not flag a learner who was reinstated', () => {
    expect(contradictedLearners({
      rosterRows: [row('a', 'withdrawn', LAST_TERM), row('a', 'active', THIS_TERM)],
      learners: [learner('a')],
    })).toEqual([]);
  });

  it('does not flag a learner who was never rostered', () => {
    expect(contradictedLearners({ rosterRows: [], learners: [learner('a')] })).toEqual([]);
  });
});
