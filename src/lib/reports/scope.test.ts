import { describe, expect, it } from 'vitest';
import { teacherCanReportCourse } from './scope';

const base = { actorId: 'teacher-1', courseId: 'course-1', courseProgramId: 'program-1', courseSchoolId: 'school-1', ownedClasses: [{ current_course_id: null, program_id: 'program-1', school_id: 'school-1' }] };
describe('teacherCanReportCourse', () => {
  it('allows an explicitly assigned course', () => expect(teacherCanReportCourse({ ...base, courseTeacherId: 'teacher-1', ownedClasses: [] })).toBe(true));
  it('allows a shared programme course for an owned class even if course is assigned to another teacher', () =>
    expect(teacherCanReportCourse({ ...base, courseTeacherId: 'teacher-2' })).toBe(true));
  it('blocks a course assigned to another teacher when no owned class links it', () =>
    expect(teacherCanReportCourse({ ...base, courseTeacherId: 'teacher-2', ownedClasses: [] })).toBe(false));
  it('allows a shared programme course for an owned class', () => expect(teacherCanReportCourse({ ...base, courseTeacherId: null })).toBe(true));
  it('blocks an unrelated shared course', () => expect(teacherCanReportCourse({ ...base, courseTeacherId: null, courseProgramId: 'program-2' })).toBe(false));
});
