import { describe, expect, it } from 'vitest';
import {
  buildSchoolCourseDetections,
  curriculaAppliesToSchool,
  normalizeProgrammeLabel,
  programmeCourseKey,
  scopeCurriculaForSchool,
} from './school-curriculum-scope';

describe('school-curriculum-scope', () => {
  it('normalizes Young Innov variants to Young Innovators', () => {
    expect(normalizeProgrammeLabel('Young Innov 3')).toBe('Young Innovators');
    expect(normalizeProgrammeLabel('Young Innovators')).toBe('Young Innovators');
    expect(normalizeProgrammeLabel('Teen Dev')).toBe('Teen Developers');
  });

  it('merges programme/course keys across label variants', () => {
    expect(programmeCourseKey('Young Innov', 'Scratch')).toBe(
      programmeCourseKey('Young Innovators', 'Scratch'),
    );
  });

  it('includes school-specific and scoped platform curricula for enrolled active courses', () => {
    const schoolId = 'school-1';
    const schoolCourseIds = new Set(['course-a']);
    expect(curriculaAppliesToSchool({ school_id: schoolId, course_id: 'course-a' }, schoolId, schoolCourseIds)).toBe(true);
    expect(curriculaAppliesToSchool({ school_id: null, course_id: 'course-a' }, schoolId, schoolCourseIds)).toBe(true);
    expect(curriculaAppliesToSchool({ school_id: null, course_id: 'course-b' }, schoolId, schoolCourseIds)).toBe(false);
    expect(curriculaAppliesToSchool({ school_id: schoolId, course_id: 'course-b' }, schoolId, schoolCourseIds)).toBe(false);
  });

  it('scopeCurriculaForSchool keeps only active enrolled course syllabi', () => {
    const scope = [
      {
        programme: 'Young Innovators',
        course: 'Scratch',
        courseId: 'course-a',
        programmeId: 'p1',
        enrolledStudents: 12,
        classIds: ['cls1'],
        classNames: ['JSS1'],
      },
    ];
    const filtered = scopeCurriculaForSchool(
      [
        { id: 'cur1', school_id: 'school-1', course_id: 'course-a', courses: { is_active: true } },
        { id: 'cur2', school_id: 'school-1', course_id: 'course-b', courses: { is_active: true } },
        { id: 'cur3', school_id: null, course_id: 'course-a', courses: { is_active: false } },
      ],
      'school-1',
      scope,
    );
    expect(filtered.map((row) => row.id)).toEqual(['cur1']);
  });

  it('detects per-course tracking coverage', () => {
    const detections = buildSchoolCourseDetections({
      scope: [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          courseId: 'c1',
          programmeId: 'p1',
          enrolledStudents: 12,
          classIds: ['cls1'],
          classNames: ['Young Innov 3'],
        },
        {
          programme: 'Teen Developers',
          course: 'Python',
          courseId: 'c2',
          programmeId: 'p2',
          enrolledStudents: 8,
          classIds: ['cls2'],
          classNames: ['Teen Dev JSS1'],
        },
      ],
      curricula: [
        { id: 'cur1', course_id: 'c1', school_id: 'school-1' },
        { id: 'cur2', course_id: 'c2', school_id: null },
      ],
      trackingRows: [
        { curriculum_id: 'cur1', term_number: 1, week_number: 2, status: 'completed' },
        { curriculum_id: 'cur1', term_number: 1, week_number: 3, status: 'completed' },
      ],
      academicTermNumber: 1,
      inRange: () => true,
    });

    expect(detections).toHaveLength(2);
    expect(detections.find((row) => row.course === 'Scratch')?.trackedWeeks).toBe(2);
    expect(detections.find((row) => row.course === 'Scratch')?.inReportRange).toBe(true);
    expect(detections.find((row) => row.course === 'Python')?.inReportRange).toBe(false);
    expect(detections.find((row) => row.course === 'Python')?.enrolledStudents).toBe(8);
  });
});
