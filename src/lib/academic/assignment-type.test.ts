import { describe, expect, it } from 'vitest';

/**
 * Mirrors the clamp in generate-assignments. The rule is small but the failure
 * it prevents is not: a homework request that the model answered as "project"
 * was stored as a project, which the assignments generator's own dedup check
 * excludes — so the nightly sweep never saw it and wrote another one every run.
 */
const HOMEWORK_TYPES = ['homework', 'quiz', 'coding', 'presentation', 'exam'];

function assignmentTypeFor(raw: unknown): string {
  const value = String(raw ?? '').toLowerCase();
  return HOMEWORK_TYPES.includes(value) ? value : 'homework';
}

describe('assignmentTypeFor', () => {
  it('never lets the assignments generator write a project', () => {
    expect(assignmentTypeFor('project')).toBe('homework');
    expect(assignmentTypeFor('PROJECT')).toBe('homework');
  });

  it('keeps a legitimate homework kind', () => {
    for (const t of HOMEWORK_TYPES) expect(assignmentTypeFor(t)).toBe(t);
  });

  it('falls back to homework for anything unrecognised', () => {
    expect(assignmentTypeFor(undefined)).toBe('homework');
    expect(assignmentTypeFor(null)).toBe('homework');
    expect(assignmentTypeFor('')).toBe('homework');
    expect(assignmentTypeFor('capstone')).toBe('homework');
    expect(assignmentTypeFor(42)).toBe('homework');
  });

  it('produces a type the dedup check can actually find', () => {
    // The generator looks for existing work with .neq('assignment_type','project').
    const written = assignmentTypeFor('project');
    expect(written).not.toBe('project');
  });
});
