import { describe, expect, it } from 'vitest';
import {
  accessCardCodeForStudent,
  accessCardCodeMatchesStudent,
  formatAccessCardCodeDisplay,
  formatAccessCardCodeInput,
  legacyAccessCardCodeForStudent,
  normalizeAccessCardCode,
} from '@/lib/access-card-code';

const STUDENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('access-card-code numeric v2', () => {
  it('generates 8-digit numeric codes', () => {
    const code = accessCardCodeForStudent(STUDENT_ID);
    expect(code).toMatch(/^RC-[0-9]{8}$/);
  });

  it('normalizes digits-only input without RC prefix', () => {
    const numeric = accessCardCodeForStudent(STUDENT_ID).replace(/^RC-/, '');
    expect(normalizeAccessCardCode(numeric)).toBe(`RC-${numeric}`);
    expect(normalizeAccessCardCode(`${numeric.slice(0, 4)}-${numeric.slice(4)}`)).toBe(`RC-${numeric}`);
  });

  it('matches legacy alphanumeric cards', () => {
    const legacy = legacyAccessCardCodeForStudent(STUDENT_ID);
    expect(legacy).toMatch(/^RC-[A-Z0-9]{8}$/);
    expect(accessCardCodeMatchesStudent(legacy, STUDENT_ID)).toBe(true);
  });

  it('formats input as 1234-5678', () => {
    expect(formatAccessCardCodeInput('12345678')).toBe('1234-5678');
    expect(formatAccessCardCodeInput('1234')).toBe('1234');
  });

  it('displays numeric codes in grouped pattern', () => {
    const code = accessCardCodeForStudent(STUDENT_ID);
    expect(formatAccessCardCodeDisplay(code)).toMatch(/^\d{4}-\d{4}$/);
  });
});
