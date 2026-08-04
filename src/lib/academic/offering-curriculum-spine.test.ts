import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260929000026_offering_curriculum_off_the_term_spine.sql',
  ),
  'utf8',
);

/**
 * A special programme's curriculum belongs to the programme, not to a school
 * term.
 *
 * academic_curriculum_releases had academic_session and effective_term_number
 * as NOT NULL, both defaulting from the calendar month. A holiday programme
 * running 3 Aug to 4 Sep has neither, so its curriculum could only be created
 * by stamping it with two values that mean nothing to it — and which the rest
 * of the system would then read as fact.
 */
describe('offering curriculum keeps its own spine', () => {
  it('lets a release belong to an offering', () => {
    expect(migration).toContain('add column if not exists academic_offering_id');
    expect(migration).toContain('references public.academic_offerings(id)');
  });

  it('stops forcing a school session and term on every release', () => {
    expect(migration).toContain('alter column academic_session drop not null');
    expect(migration).toContain('alter column effective_term_number drop not null');
  });

  it('clears the session and term the column defaults would stamp on', () => {
    // The defaults fire on every insert, so leaving them unset is not enough —
    // they have to be actively cleared for a duration programme.
    expect(migration).toContain('new.academic_session := null');
    expect(migration).toContain('new.effective_term_number := null');
  });

  it('keys the rule on the academic model, never on a named programme', () => {
    expect(migration).toContain("v_model = 'duration_programme'");
    expect(migration).not.toMatch(/Summer School 2026['"]/);
  });

  it('still requires a school release to name its session and term', () => {
    // Widening the columns must not let a termly release lose its anchor.
    expect(migration).toContain('acr_release_has_one_spine');
    expect(migration).toContain('academic_session is not null and effective_term_number is not null');
  });

  it('leaves a release alone when it has no offering', () => {
    expect(migration).toContain('if new.academic_offering_id is null then');
  });
});
