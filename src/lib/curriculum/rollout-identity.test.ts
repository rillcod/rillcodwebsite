import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLiveDirectionForDraft } from './rollout-workflow';

const rolloutPage = readFileSync(
  join(process.cwd(), 'src/app/dashboard/academic/rollout/page.tsx'),
  'utf8',
);

/**
 * Session and audience are not form decoration — together with the curriculum
 * and entry term they *are* an edition's identity, and the key that matches a
 * draft to its live edition. A value that drifts does not raise an error; it
 * quietly reports "nothing published yet" and mints a parallel edition.
 */
describe('rollout publishing identity', () => {
  const live = [
    {
      id: 'dir-1',
      status: 'published',
      source_curriculum_id: 'cur-1',
      academic_session: '2025/2026',
      effective_term_number: 1,
      audience_label: 'All assigned learner levels',
    },
  ] as any[];

  const selection = {
    curriculumId: 'cur-1',
    academicSession: '2025/2026',
    effectiveTermNumber: 1,
    audienceLabel: 'All assigned learner levels',
  };

  it('matches the live edition on the exact identity', () => {
    expect(findLiveDirectionForDraft(live, selection)?.id).toBe('dir-1');
  });

  it('still matches through case and stray whitespace', () => {
    expect(
      findLiveDirectionForDraft(live, {
        ...selection,
        audienceLabel: '  all assigned LEARNER levels ',
      })?.id,
    ).toBe('dir-1');
  });

  it('does NOT match a reworded audience — which is why it cannot be typed', () => {
    // "All learner levels" is the same thing to a human and a different edition
    // to the system. Free text made this one keystroke away.
    expect(
      findLiveDirectionForDraft(live, { ...selection, audienceLabel: 'All learner levels' }),
    ).toBeNull();
  });

  it('does NOT match a different session', () => {
    expect(
      findLiveDirectionForDraft(live, { ...selection, academicSession: '2026/2027' }),
    ).toBeNull();
  });
});

describe('rollout page guards', () => {
  it('offers the audience as a fixed choice rather than free text', () => {
    expect(rolloutPage).toContain('audienceOptions.map');
    expect(rolloutPage).toContain('DEFAULT_AUDIENCE_LABEL');
  });

  it('keeps every already-published audience selectable', () => {
    // Dropping a label that a live edition uses would orphan that edition.
    expect(rolloutPage).toContain('for (const direction of directions)');
  });

  it('offers the level names this school actually uses', () => {
    // Nursery / KG / Basic / JSS / SS are the bands real classes are banded by;
    // invented groupings would not line up with any class on the system.
    for (const band of ['Nursery 1-3', 'Basic 1-3', 'Basic 4-6', 'JSS 1-3', 'SS 1-3']) {
      expect(rolloutPage).toContain(band);
    }
  });

  it('does not reword the stored label that live editions already carry', () => {
    // Friendlier wording belongs in the option text, not in the stored value:
    // changing the value would unmatch every edition published under it.
    expect(rolloutPage).toContain("const DEFAULT_AUDIENCE_LABEL = 'All assigned learner levels'");
  });

  it('never starts on a hardcoded academic session', () => {
    // It used to open on '2026/2027' while every release was 2025/2026, so the
    // page matched nothing and publishing created a parallel future edition.
    expect(rolloutPage).not.toContain("useState('2026/2027')");
  });

  it('refuses to review or publish until the real session is known', () => {
    expect(rolloutPage).toContain('!session ||');
    expect(rolloutPage).toContain('there is no session to publish to');
  });
});
