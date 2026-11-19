import { describe, expect, it } from 'vitest';
import { generateTempPassword } from './password';

describe('temporary account passwords', () => {
  it('uses the canonical rillcod@XXXX 4-digit format', () => {
    expect(generateTempPassword()).toMatch(/^rillcod@\d{4}$/);
  });

  it('produces varied passwords across a registration batch', () => {
    const passwords = Array.from({ length: 30 }, generateTempPassword);
    expect(new Set(passwords).size).toBeGreaterThan(25);
  });
});

