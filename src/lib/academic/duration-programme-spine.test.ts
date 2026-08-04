import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000025_lessons_carry_offering_period.sql'),
  'utf8',
);

/**
 * Special programmes run on a duration, not on school terms, and they must not
 * be quietly folded back onto the term spine.
 *
 * classes and lesson_plans already carried academic_offering_id and
 * offering_period_id; lessons did not, so a holiday-programme lesson had only
 * academic_term_id to sit on — a shape that means nothing for a programme with
 * no terms. Twenty Summer School lessons ended up with no time anchor at all,
 * and their slides, which take their timing from the lesson, had none either.
 */
describe('duration programmes keep their own spine', () => {
  it('gives lessons the same offering columns classes and plans already use', () => {
    // A third spelling of the same idea is how these drift apart.
    expect(migration).toContain('add column if not exists academic_offering_id');
    expect(migration).toContain('add column if not exists offering_period_id');
  });

  it('reuses the shared binder rather than writing a second inheritance rule', () => {
    expect(migration).toContain('public.bind_record_to_academic_offering()');
    expect(migration).toContain('bind_lesson_to_academic_offering');
  });

  it('keys the separation on the academic model, not on any one programme', () => {
    // The rule has to survive Summer School 2026 being renamed, re-coursed or
    // replaced — so it asks what kind of programme this is, never which one.
    expect(migration).toContain("v_model = 'duration_programme'");
    expect(migration).not.toMatch(/Summer School 2026['"]/);
  });

  it('clears the term on a duration lesson instead of rejecting the write', () => {
    // An insert that means well should land on the right spine, not fail.
    expect(migration).toContain('new.academic_term_id := null');
  });

  it('leaves a termly school lesson on its term', () => {
    // Guarded by the early return: no offering, or no term, means no change —
    // and only duration_programme reaches the assignment above.
    expect(migration).toContain('if new.academic_offering_id is null or new.academic_term_id is null then');
    expect(migration).toContain('return new;');
  });

  it('backfills only what can be derived, never a guess', () => {
    expect(migration).toContain('from public.classes c');
    expect(migration).toContain('from public.lesson_plans p');
    expect(migration).not.toMatch(/insert into public\.classes/i);
  });
});
