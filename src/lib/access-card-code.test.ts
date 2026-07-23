import { describe, expect, it } from 'vitest';
import {
  accessCardCodeForStudent,
  accessCardCodeMatchesStudent,
  formatAccessCardCodeDisplay,
  formatAccessCardCodeInput,
  isStudentPortalUuid,
  legacyAccessCardCodeForStudent,
  normalizeAccessCardCode,
} from '@/lib/access-card-code';

const STUDENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('access-card-code — all card versions', () => {
  it('generates 8-digit numeric RC codes (current)', () => {
    const code = accessCardCodeForStudent(STUDENT_ID);
    expect(code).toMatch(/^RC-[0-9]{8}$/);
    expect(accessCardCodeMatchesStudent(code, STUDENT_ID)).toBe(true);
  });

  it('normalizes digits-only input to RC-########', () => {
    const numeric = accessCardCodeForStudent(STUDENT_ID).replace(/^RC-/, '');
    expect(normalizeAccessCardCode(numeric)).toBe(`RC-${numeric}`);
    expect(normalizeAccessCardCode(`${numeric.slice(0, 4)}-${numeric.slice(4)}`)).toBe(`RC-${numeric}`);
    expect(normalizeAccessCardCode(`RC${numeric}`)).toBe(`RC-${numeric}`);
    expect(normalizeAccessCardCode(`RC-${numeric}`)).toBe(`RC-${numeric}`);
  });

  it('matches legacy alphanumeric RC cards (v1)', () => {
    const legacy = legacyAccessCardCodeForStudent(STUDENT_ID);
    expect(legacy).toMatch(/^RC-[A-Z0-9]{8}$/);
    expect(accessCardCodeMatchesStudent(legacy, STUDENT_ID)).toBe(true);
    expect(normalizeAccessCardCode(legacy.replace(/^RC-/, ''))).toBe(legacy);
    expect(accessCardCodeMatchesStudent(legacy.replace(/^RC-/, ''), STUDENT_ID)).toBe(true);
  });

  it('recognises legacy portal UUID codes (oldest QR cards)', () => {
    expect(isStudentPortalUuid(STUDENT_ID)).toBe(STUDENT_ID);
    expect(isStudentPortalUuid(STUDENT_ID.toUpperCase())).toBe(STUDENT_ID);
    expect(normalizeAccessCardCode(STUDENT_ID)).toBe('');
    expect(isStudentPortalUuid('12345678')).toBeNull();
  });

  it('passes through long report / issued-card verification codes', () => {
    const reportCode = 'RPT-2025-TERM1-ABCDEF';
    expect(normalizeAccessCardCode(reportCode)).toBe(reportCode);
  });

  it('formats numeric input as ####-####', () => {
    expect(formatAccessCardCodeInput('12345678')).toBe('1234-5678');
    expect(formatAccessCardCodeInput('1234')).toBe('1234');
  });

  it('formats legacy alphanumeric input', () => {
    expect(formatAccessCardCodeInput('RCAB12CD34')).toBe('AB12-CD34');
    expect(formatAccessCardCodeInput('ab12cd34')).toBe('AB12-CD34');
  });

  it('displays codes with RC- prefix', () => {
    const numeric = accessCardCodeForStudent(STUDENT_ID);
    expect(formatAccessCardCodeDisplay(numeric)).toMatch(/^RC-\d{4}-\d{4}$/);
    const legacy = legacyAccessCardCodeForStudent(STUDENT_ID);
    expect(formatAccessCardCodeDisplay(legacy)).toMatch(/^RC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(formatAccessCardCodeDisplay(STUDENT_ID)).toBe(STUDENT_ID);
  });

  it('numeric and legacy bodies differ but both resolve the same student', () => {
    const numeric = accessCardCodeForStudent(STUDENT_ID);
    const legacy = legacyAccessCardCodeForStudent(STUDENT_ID);
    expect(numeric).not.toBe(legacy);
    expect(accessCardCodeMatchesStudent(numeric, STUDENT_ID)).toBe(true);
    expect(accessCardCodeMatchesStudent(legacy, STUDENT_ID)).toBe(true);
  });
});
