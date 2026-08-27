import { describe, expect, it } from 'vitest';
import { buildCopy, canBeCopied, decideReuse, isCustomised } from './content-reuse';

const RELEASE = 'release-ai-foundations';
const OTHER_RELEASE = 'release-python';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'content-1',
  curriculum_release_id: RELEASE,
  curriculum_week_number: 3,
  lesson_plan_id: 'plan-first',
  metadata: {},
  created_at: '2026-08-01T00:00:00Z',
  ...over,
}) as any;

const req = { releaseId: RELEASE, week: 3, targetPlanId: 'plan-second' };

describe('what may be copied', () => {
  it('copies a week already generated for the same curriculum', () => {
    expect(decideReuse([row()], req)).toEqual({ action: 'copy', sourceId: 'content-1' });
  });

  it('never copies across curriculums', () => {
    expect(decideReuse([row({ curriculum_release_id: OTHER_RELEASE })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies a different week', () => {
    expect(decideReuse([row({ curriculum_week_number: 4 })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies a different meeting in the same week', () => {
    expect(
      decideReuse(
        [row({ session_number: 2 })],
        { ...req, session: 1 }
      )
    ).toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies from the same plan', () => {
    // That is a duplicate rather than a reuse, and the uniqueness index on
    // (lesson_plan_id, week) would reject it anyway.
    expect(decideReuse([row({ lesson_plan_id: 'plan-second' })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies content a teacher wrote directly', () => {
    // No plan means a teacher made it for their own class. It is their
    // material, not curriculum output, and must not spread to other schools.
    expect(decideReuse([row({ lesson_plan_id: null })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies a week a teacher has since edited', () => {
    // The first class generates week 3 and becomes everyone's source. If that
    // class then rewrites it for their own pupils, copying would hand one
    // school's local wording to the next 25 as though it were the curriculum.
    expect(decideReuse([row({ metadata: { is_customized: true } })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
    expect(decideReuse([row({ metadata: { customized_at: '2026-08-02' } })], req))
      .toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('never copies a title-only shell', () => {
    expect(
      decideReuse(
        [row({ description: '', content_layout: [], content: '', lesson_notes: '' })],
        req,
      ),
    ).toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('skips a customised copy and takes an untouched one', () => {
    const decision = decideReuse(
      [row({ id: 'edited', metadata: { is_customized: true }, created_at: '2026-08-01T00:00:00Z' }),
       row({ id: 'clean', lesson_plan_id: 'plan-third', created_at: '2026-08-02T00:00:00Z' })],
      req,
    );
    expect(decision).toEqual({ action: 'copy', sourceId: 'clean' });
  });
});

describe('falling through to generation is always safe', () => {
  it('generates when there is nothing to copy', () => {
    expect(decideReuse([], req)).toEqual({ action: 'generate', reason: 'nothing_to_copy' });
    expect(decideReuse(null, req)).toEqual({ action: 'generate', reason: 'nothing_to_copy' });
  });

  it('generates when the class has no curriculum', () => {
    expect(decideReuse([row()], { ...req, releaseId: null }))
      .toEqual({ action: 'generate', reason: 'no_release' });
  });

  it('generates rather than guessing on a bad week', () => {
    expect(decideReuse([row()], { ...req, week: null }).action).toBe('generate');
    expect(decideReuse([row()], { ...req, week: NaN }).action).toBe('generate');
  });
});

describe('picking consistently', () => {
  it('takes the oldest valid source', () => {
    // Every class on a curriculum should end up with the same content, not a
    // scattering of near-identical variants depending on who generated when.
    const decision = decideReuse(
      [row({ id: 'newer', lesson_plan_id: 'plan-c', created_at: '2026-08-05T00:00:00Z' }),
       row({ id: 'oldest', lesson_plan_id: 'plan-a', created_at: '2026-08-01T00:00:00Z' })],
      req,
    );
    expect(decision).toEqual({ action: 'copy', sourceId: 'oldest' });
  });
});

describe('the copy that gets written', () => {
  const source = {
    id: 'source-1',
    title: 'Loops and Repetition',
    content: 'the whole lesson body students will actually teach from this week',
    lesson_plan_id: 'plan-first',
    class_id: 'class-first',
    curriculum_release_id: RELEASE,
    curriculum_week_number: 3,
    content_locked_at: '2026-08-01T00:00:00Z',
    content_locked_by: 'teacher-1',
    created_at: '2026-08-01T00:00:00Z',
    metadata: { generated_from: 'plan-week' },
  };

  const copy = buildCopy(source, { planId: 'plan-second', classId: 'class-second', sourceId: 'source-1' });

  it('belongs to the new class, not the old one', () => {
    expect(copy.lesson_plan_id).toBe('plan-second');
    expect(copy.class_id).toBe('class-second');
    expect(copy.metadata).toMatchObject({
      lesson_plan_id: 'plan-second',
      class_id: 'class-second',
    });
    expect(copy.id).toBeUndefined();
    expect(copy.created_at).toBeUndefined();
  });

  it('carries the teaching across untouched', () => {
    expect(copy.title).toBe('Loops and Repetition');
    expect(copy.content).toBe(
      'the whole lesson body students will actually teach from this week',
    );
    expect(copy.curriculum_release_id).toBe(RELEASE);
    expect(copy.curriculum_week_number).toBe(3);
  });

  it('never inherits a lock', () => {
    // The source class publishing its week to learners must not arrive frozen
    // for a class that has not taught it yet.
    expect(copy.content_locked_at).toBeNull();
    expect(copy.content_locked_by).toBeNull();
  });

  it('records where it came from', () => {
    const meta = copy.metadata as Record<string, unknown>;
    expect(meta.copied_from_content_id).toBe('source-1');
    expect(meta.copied_at).toBeTruthy();
    expect(meta.generated_from).toBe('plan-week');
  });

  it('is not marked customised, so it can serve the next class', () => {
    const meta = copy.metadata as Record<string, unknown>;
    expect(meta.is_customized).toBe(false);
    expect(isCustomised({ ...(copy as any) })).toBe(false);
  });

  it('can itself be copied by a third class', () => {
    const third = decideReuse(
      [{ ...(copy as any), id: 'copy-1', created_at: '2026-08-03T00:00:00Z' }],
      { releaseId: RELEASE, week: 3, targetPlanId: 'plan-third' },
    );
    expect(third).toEqual({ action: 'copy', sourceId: 'copy-1' });
  });
});

describe('canBeCopied guards each rule on its own', () => {
  it('is false for anything missing', () => {
    expect(canBeCopied(null, req)).toBe(false);
    expect(canBeCopied(row(), { ...req, releaseId: null })).toBe(false);
    expect(canBeCopied(row(), { ...req, week: null })).toBe(false);
  });

  it('is true only for a clean, matching, other-plan row', () => {
    expect(canBeCopied(row(), req)).toBe(true);
  });
});
