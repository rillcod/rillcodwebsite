import { describe, expect, it } from 'vitest';
import { countNoun, nounFor } from './wording';

/**
 * Roughly forty report lines used the "(s)" shorthand. It is fine in a log and
 * wrong in a document addressed to a Head of School, and it showed up in exactly
 * the sentences that matter: "Complete the 1 curriculum week(s) currently in
 * progress."
 */
describe('countNoun', () => {
  it('uses the singular for exactly one', () => {
    expect(countNoun(1, 'week')).toBe('1 week');
    expect(countNoun(1, 'learner')).toBe('1 learner');
  });

  it('uses the plural for zero and for many', () => {
    expect(countNoun(0, 'week')).toBe('0 weeks');
    expect(countNoun(7, 'learner')).toBe('7 learners');
  });

  it('accepts an irregular plural', () => {
    expect(countNoun(1, 'analysis', 'analyses')).toBe('1 analysis');
    expect(countNoun(3, 'analysis', 'analyses')).toBe('3 analyses');
  });

  it('treats a missing count as zero rather than printing undefined', () => {
    // Counts arrive through optional chains such as staff?.assignedTeachers.
    // Printing "undefined teachers" into a report is the failure this avoids.
    expect(countNoun(undefined, 'teacher')).toBe('0 teachers');
    expect(countNoun(null, 'teacher')).toBe('0 teachers');
    expect(countNoun(Number.NaN, 'teacher')).toBe('0 teachers');
  });
});

describe('nounFor', () => {
  it('gives the bare noun for sentences that place the number elsewhere', () => {
    expect(nounFor(1, 'week')).toBe('week');
    expect(nounFor(4, 'week')).toBe('weeks');
  });

  it('is safe with a missing count', () => {
    expect(nounFor(undefined, 'learner')).toBe('learners');
  });
});

describe('no report module still emits the "(s)" shorthand', () => {
  it('is gone from every report source file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = 'src/lib/school-reports';
    const offenders: string[] = [];

    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
        // wording.ts documents the pattern it exists to remove.
        if (entry.name === 'wording.ts') continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const line of text.split('\n')) {
          // Ignore comments — several explain the bug being fixed.
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
          if (/[a-z]+\(s\)/.test(line)) offenders.push(`${entry.name}: ${line.trim().slice(0, 90)}`);
        }
      }
    };
    walk(dir);

    expect(offenders).toEqual([]);
  });
});
