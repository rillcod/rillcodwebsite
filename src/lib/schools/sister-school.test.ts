import { describe, expect, it } from 'vitest';
import {
  areSisterSchools,
  extractSchoolBrandRoot,
  isSisterSchoolTransitionGrade,
} from './sister-school';

describe('sister-school matching & Basic 5/6 transition policy', () => {
  it('matches sister school branches sharing a brand root', () => {
    expect(extractSchoolBrandRoot('Quincy Academy')).toBe('quincy');
    expect(extractSchoolBrandRoot('Quincy Secondary')).toBe('quincy');
    expect(extractSchoolBrandRoot('Quincy Secondary School')).toBe('quincy');
    expect(areSisterSchools('Quincy Academy', 'Quincy Secondary')).toBe(true);
    expect(areSisterSchools('Quincy Primary School', 'Quincy High School')).toBe(true);
    expect(areSisterSchools('St. Jude Primary', 'St. Jude College')).toBe(true);
  });

  it('does not match unrelated schools or generic-only names', () => {
    expect(areSisterSchools('Quincy Academy', 'Greenfield Academy')).toBe(false);
    expect(areSisterSchools('Primary School', 'Secondary School')).toBe(false);
    expect(areSisterSchools('Abc Academy', 'Abc Secondary')).toBe(false);
  });

  it('permits ONLY Basic 5 and Basic 6 (and Primary/Grade 5-6 aliases)', () => {
    expect(isSisterSchoolTransitionGrade('Basic 5')).toBe(true);
    expect(isSisterSchoolTransitionGrade('Basic 6')).toBe(true);
    expect(isSisterSchoolTransitionGrade('Primary 5')).toBe(true);
    expect(isSisterSchoolTransitionGrade('Primary 6')).toBe(true);
    expect(isSisterSchoolTransitionGrade(null, 'Basic 6')).toBe(true);

    expect(isSisterSchoolTransitionGrade('Basic 4')).toBe(false);
    expect(isSisterSchoolTransitionGrade('Basic 3')).toBe(false);
    expect(isSisterSchoolTransitionGrade('JSS 1')).toBe(false);
    expect(isSisterSchoolTransitionGrade('SS 1')).toBe(false);
    expect(isSisterSchoolTransitionGrade('KG 2')).toBe(false);
  });
});
