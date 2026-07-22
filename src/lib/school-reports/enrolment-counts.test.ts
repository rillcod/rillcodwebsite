import { describe, expect, it } from 'vitest';
import { reconcileSchoolReportEnrolments } from './enrolment-counts';

describe('reconcileSchoolReportEnrolments', () => {
  it('counts every course once, including courses without assessment rows', () => {
    const result = reconcileSchoolReportEnrolments({
      schoolProgrammes: [
        { programme: 'Teen Developers', course: 'HTML & CSS', enrolledStudents: 4 },
        { programme: 'Young Innovators', course: 'Scratch', enrolledStudents: 24 },
        { programme: 'Young Innovators', course: 'Introduction to Computers', enrolledStudents: 20 },
      ],
      programmeCoursePerformance: [
        { programme: 'Young Innovators', course: 'Scratch', students: 24, enrolledStudents: 24 },
      ],
      learnerIds: Array.from({ length: 24 }, (_, index) => `learner-${index + 1}`),
      activeStudents: 24,
    });

    expect(result).toEqual({ programmeEnrolments: 48, totalStudents: 24 });
  });
});