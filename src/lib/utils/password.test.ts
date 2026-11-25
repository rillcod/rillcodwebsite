import { describe, expect, it } from 'vitest';
import { generateTempPassword, normalizeRillcodTempPassword } from './password';

describe('temporary account passwords', () => {
  it('uses the canonical Rillcod@XXXX 4-digit format', () => {
    expect(generateTempPassword()).toMatch(/^Rillcod@\d{4}$/);
    expect(normalizeRillcodTempPassword('rillcod@4821')).toBe('Rillcod@4821');
  });

  it('produces varied passwords across a registration batch', () => {
    const passwords = Array.from({ length: 30 }, generateTempPassword);
    expect(new Set(passwords).size).toBeGreaterThan(25);
  });
});
