import { describe, expect, it } from 'vitest';
import { programLabel, registeredConsentGrade } from './onboard-lead-children';

describe('consent canonical intake mapping', () => {
  it('accepts only canonical registered grade levels', () => {
    expect(registeredConsentGrade('basic 2')).toBe('Basic 2');
    expect(registeredConsentGrade('Young Innovators')).toBeNull();
    expect(registeredConsentGrade('Basic 2A')).toBe('Basic 2');
    expect(registeredConsentGrade(null)).toBeNull();
  });

  it('keeps programme labels separate from grade and section', () => {
    expect(programLabel('young_innovators')).toBe('Young Innovators');
    expect(programLabel('teen_developers')).toBe('Teen Developers');
  });
});