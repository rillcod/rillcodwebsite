import { describe, expect, it } from 'vitest';
import { generateTempPassword } from './password';

describe('temporary account passwords', () => {
  it('uses the shared readable high-entropy format', () => {
    expect(generateTempPassword()).toMatch(/^Rillcod@[A-HJ-NP-Z2-9]{8}$/);
  });

  it('does not repeat across a normal registration batch', () => {
    const passwords = Array.from({ length: 100 }, generateTempPassword);
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});

