import { describe, expect, it } from 'vitest';
import {
  humanAcademicSession,
  humanCalendarProgrammeLabel,
  humanCurriculumContext,
  humanEntryPoint,
  humanGradeLabel,
  humanTermLabel,
} from './humanLabels';

describe('human curriculum language', () => {
  it('never exposes term numbers as the main label', () => {
    expect(humanTermLabel(1)).toBe('First Term');
    expect(humanTermLabel(3)).toBe('Third Term');
  });

  it('uses familiar school level language', () => {
    expect(humanGradeLabel('basic_1')).toBe('Basic 1');
    expect(humanGradeLabel('jss_2')).toBe('JSS 2');
  });

  it('describes late school entry naturally', () => {
    expect(humanEntryPoint({ termNumber: 3, weekNumber: 3 })).toBe('Teaching begins in Third Term, Week 3');
  });

  it('uses calendar-first programme labels instead of release language', () => {
    expect(humanCalendarProgrammeLabel({ academicSession: '2025/2026', calendarTerm: 3, programmeYear: 1 }))
      .toBe('Third Term 2025/2026 (Programme Year 1)');
    expect(humanCalendarProgrammeLabel({ academicSession: '2026/2027', calendarTerm: 1, programmeYear: 1, programmeTerm: 2 }))
      .toBe('First Term 2026/2027 (Programme Year 1 · Second Term)');
  });

  it('keeps formal academic-session wording available for form fields', () => {
    expect(humanAcademicSession('2026/2027')).toBe('2026/2027 Academic Session');
    expect(humanCurriculumContext({ academicSession: '2026/2027', termNumber: 1, programmeYear: 1, gradeKey: 'basic_1' }))
      .toBe('First Term 2026/2027 (Programme Year 1) · Basic 1');
  });
});
