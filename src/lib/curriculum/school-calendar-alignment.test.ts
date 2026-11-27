import { describe, expect, it } from 'vitest';
import {
  alignCurriculumToSchoolCalendar,
  normalizeSchoolTermCalendar,
  resolveSchoolTermDates,
  sanitizeCurriculumForLearner,
  type AlignableCurriculumContent,
} from './school-calendar-alignment';

const SAMPLE_CURRICULUM: AlignableCurriculumContent = {
  course_title: 'Creative Coding & Robotics',
  overview: 'Three-term progressive coding curriculum.',
  learning_outcomes: ['Build interactive programs', 'Design smart sensors'],
  metadata: { format: 'school', program_start_term: 1 },
  terms: [
    {
      year: 1,
      term: 1,
      title: 'Foundations of Coding',
      objectives: ['Understand sequences and loops'],
      weeks: [
        {
          week: 1,
          type: 'lesson',
          topic: 'Algorithms & Loops',
          subtopics: ['Step-by-step thinking', 'Repeat blocks'],
          lesson_plan: {
            duration_minutes: 40,
            objectives: ['Write a 5-step algorithm'],
            teacher_activities: ['Demonstrate loop blocks on projector'],
            student_activities: ['Build a repeating animation'],
            classwork: { title: 'Loop Maze', instructions: 'Solve 3 levels' },
            assignment: { title: 'Home Algorithm', instructions: 'Write morning routine' },
            engagement_tips: ['Pair students in twos'],
          },
        },
        {
          week: 2,
          type: 'assessment',
          topic: 'Checkpoint 1',
          assessment_plan: {
            title: 'Loops Practical',
            format: 'Practical build',
            coverage: ['Algorithms & Loops'],
            scoring_guide: '10 marks for loop accuracy',
            teacher_prep: ['Load starter template'],
            sample_questions: ['How many times does repeat(4) run?'],
          },
        },
      ],
    },
    {
      year: 1,
      term: 2,
      title: 'Application & Events',
      objectives: ['Build event-driven games'],
      weeks: [
        {
          week: 1,
          type: 'lesson',
          topic: 'Events & Broadcasts',
          subtopics: ['Signals'],
        },
      ],
    },
    {
      year: 1,
      term: 3,
      title: 'Innovation Capstone',
      objectives: ['Ship a complete project'],
      weeks: [
        {
          week: 1,
          type: 'examination',
          topic: 'Showcase Defense',
        },
      ],
    },
    {
      year: 2,
      term: 1,
      title: 'Year 2 Systems Design',
      objectives: ['Modular functions'],
      weeks: [
        {
          week: 1,
          type: 'lesson',
          topic: 'Functions & Parameters',
        },
      ],
    },
  ],
};

describe('school-calendar-alignment', () => {
  it('normalizes both term1 and numeric term_calendar shapes', () => {
    expect(
      normalizeSchoolTermCalendar({
        term1: { start: '2025-09-08', end: '2025-12-12' },
        term2: { start: '2026-01-12', end: '2026-04-03' },
      }),
    ).toEqual({
      '1': { start: '2025-09-08', end: '2025-12-12' },
      '2': { start: '2026-01-12', end: '2026-04-03' },
    });

    expect(
      normalizeSchoolTermCalendar({
        '3': { start: '2026-05-04', end: '2026-07-24' },
      }),
    ).toEqual({
      '3': { start: '2026-05-04', end: '2026-07-24' },
    });
  });

  it('resolves custom school term_calendar dates and shifts across future sessions', () => {
    const termCal = {
      term1: { start: '2025-09-08', end: '2025-12-12' },
    };
    expect(
      resolveSchoolTermDates({
        termNumber: 1,
        academicSession: '2025/2026',
        baseAcademicSession: '2025/2026',
        termCalendar: termCal,
      }),
    ).toEqual({ start: '2025-09-08', end: '2025-12-12' });

    expect(
      resolveSchoolTermDates({
        termNumber: 1,
        academicSession: '2026/2027',
        baseAcademicSession: '2025/2026',
        termCalendar: termCal,
      }),
    ).toEqual({ start: '2026-09-08', end: '2026-12-12' });
  });

  it('aligns a multi-year curriculum to a mid-year Third Term school start with entryWeek offset', () => {
    const roadmap = alignCurriculumToSchoolCalendar({
      content: SAMPLE_CURRICULUM,
      academicSession: '2025/2026',
      termCalendar: {
        term1: { start: '2025-09-08', end: '2025-12-12' },
        term2: { start: '2026-01-12', end: '2026-04-03' },
        term3: { start: '2026-05-04', end: '2026-07-24' },
      },
      schedule: {
        entryTerm: 3,
        entryWeek: 3,
        sessionsPerWeek: 2,
        source: 'school_schedule',
      },
      todayIso: '2026-05-20',
    });

    expect(roadmap.years).toEqual([1, 2]);
    expect(roadmap.totalTerms).toBe(4);
    expect(roadmap.totalWeeks).toBe(5);

    // Programme Year 1 Term 1 (Foundations) -> Third Term 2025/2026, Week 1 shifted to School Calendar Week 3 (18 May - 22 May)
    expect(roadmap.terms[0].nationalTerm).toBe(3);
    expect(roadmap.terms[0].academicSession).toBe('2025/2026');
    expect(roadmap.terms[0].weeks[0].calendarWeek).toBe(3);
    expect(roadmap.terms[0].weeks[0].startDateIso).toBe('2026-05-18');
    expect(roadmap.terms[0].weeks[0].timelineState).toBe('current');

    // Programme Year 1 Term 2 (Application) -> wraps to First Term 2026/2027!
    expect(roadmap.terms[1].nationalTerm).toBe(1);
    expect(roadmap.terms[1].academicSession).toBe('2026/2027');
    expect(roadmap.terms[1].weeks[0].calendarWeek).toBe(1);

    // Programme Year 1 Term 3 (Innovation) -> Second Term 2026/2027
    expect(roadmap.terms[2].nationalTerm).toBe(2);
    expect(roadmap.terms[2].academicSession).toBe('2026/2027');

    // Programme Year 2 Term 1 -> Third Term 2026/2027
    expect(roadmap.terms[3].programmeYear).toBe(2);
    expect(roadmap.terms[3].nationalTerm).toBe(3);
    expect(roadmap.terms[3].academicSession).toBe('2026/2027');

    expect(roadmap.currentFocus).toMatchObject({
      programmeYear: 1,
      programmeTerm: 1,
      nationalTerm: 3,
      academicSession: '2025/2026',
      week: 1,
      calendarWeek: 3,
      topic: 'Algorithms & Loops',
    });
  });

  it('preserves full learner scope while stripping staff-only answer keys and prep notes', () => {
    const clean = sanitizeCurriculumForLearner(SAMPLE_CURRICULUM)!;
    expect(clean.terms).toHaveLength(4);
    const w1 = clean.terms![0].weeks![0];
    expect(w1.lesson_plan?.objectives).toEqual(['Write a 5-step algorithm']);
    expect(w1.lesson_plan?.student_activities).toEqual(['Build a repeating animation']);
    expect(w1.lesson_plan?.classwork?.title).toBe('Loop Maze');
    expect(w1.lesson_plan?.assignment?.title).toBe('Home Algorithm');
    expect((w1.lesson_plan as any)?.teacher_activities).toBeUndefined();
    expect((w1.lesson_plan as any)?.engagement_tips).toBeUndefined();

    const w2 = clean.terms![0].weeks![1];
    expect(w2.assessment_plan?.title).toBe('Loops Practical');
    expect(w2.assessment_plan?.coverage).toEqual(['Algorithms & Loops']);
    expect((w2.assessment_plan as any)?.scoring_guide).toBeUndefined();
    expect((w2.assessment_plan as any)?.teacher_prep).toBeUndefined();
    expect((w2.assessment_plan as any)?.sample_questions).toBeUndefined();
  });
});
