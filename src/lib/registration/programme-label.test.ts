import { describe, expect, it } from 'vitest';
import {
  programmeNameFromCourseInterest,
  programmeNameFromNotes,
  registeredProgrammeName,
} from '@/lib/registration/programme-label';

describe('programmeNameFromNotes', () => {
  it('reads the tag registration writes', () => {
    expect(programmeNameFromNotes('[Parental Consent: Yes] [Programme: AI Robotics Bootcamp]'))
      .toBe('AI Robotics Bootcamp');
  });

  it('is null when untagged', () => {
    expect(programmeNameFromNotes('[Parental Consent: Yes]')).toBeNull();
    expect(programmeNameFromNotes(null)).toBeNull();
  });
});

describe('programmeNameFromCourseInterest', () => {
  it('strips the grade prefix registration prepends', () => {
    // Stored as "<grade> <programme>"; a receipt must not read
    // "JSS 2 AI Summer School 2026 Tuition".
    expect(programmeNameFromCourseInterest('JSS 2 AI Summer School 2026'))
      .toBe('AI Summer School 2026');
    expect(programmeNameFromCourseInterest('SS1 Summer School 2026'))
      .toBe('Summer School 2026');
    expect(programmeNameFromCourseInterest('Primary 5 Robotics Camp'))
      .toBe('Robotics Camp');
  });

  it('leaves a programme with no grade prefix alone', () => {
    expect(programmeNameFromCourseInterest('AI Robotics Bootcamp')).toBe('AI Robotics Bootcamp');
  });

  it('is null for an empty or grade-only value', () => {
    expect(programmeNameFromCourseInterest('')).toBeNull();
    expect(programmeNameFromCourseInterest('JSS 2')).toBeNull();
  });
});

describe('registeredProgrammeName', () => {
  it('prefers the registration tag over everything else', () => {
    expect(registeredProgrammeName({
      notes: '[Programme: AI Robotics Bootcamp]',
      courseInterest: 'JSS 2 AI Summer School 2026',
      className: 'Summer School 2026',
    })).toBe('AI Robotics Bootcamp');
  });

  it('falls back through interest, then class, then caller, then generic', () => {
    expect(registeredProgrammeName({ courseInterest: 'JSS 2 Robotics Camp', className: 'X' }))
      .toBe('Robotics Camp');
    expect(registeredProgrammeName({ className: 'Holiday Coding Camp' })).toBe('Holiday Coding Camp');
    expect(registeredProgrammeName({ fallback: 'Rillcod Technologies' })).toBe('Rillcod Technologies');
  });

  it('never invents a cohort it was not told about', () => {
    // The whole point: no surface may print "Summer School 2026" on a
    // registration that never mentioned it.
    expect(registeredProgrammeName({})).not.toMatch(/summer/i);
    expect(registeredProgrammeName({ notes: '', courseInterest: '' })).not.toMatch(/2026/);
    expect(registeredProgrammeName({})).toBeTruthy();
  });
});
