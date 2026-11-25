import { describe, expect, it } from 'vitest';
import {
  canonicalizeEnrollmentType,
  inferCanonicalEnrollmentTypeForClass,
  isTermlySchoolCalendar,
} from './enrollment-type';
import { classifyStudentSessionStatus, getSessionBoundary } from './session-scope';

describe('canonical enrollment_type & session/term awareness', () => {
  it('canonicalizes all legacy enrollment_type variants to the 4 DB pathway values', () => {
    expect(canonicalizeEnrollmentType('school')).toBe('school');
    expect(canonicalizeEnrollmentType('online_school')).toBe('online');
    expect(canonicalizeEnrollmentType('in-person')).toBe('in_person');
    expect(canonicalizeEnrollmentType('summer_school')).toBe('special');
    expect(canonicalizeEnrollmentType('bootcamp')).toBe('special');
    expect(canonicalizeEnrollmentType('independent')).toBe('special');
    expect(canonicalizeEnrollmentType('')).toBeNull();
    expect(canonicalizeEnrollmentType(null)).toBeNull();
  });

  it('always matches class academic_offerings.enrollment_type so DB triggers never reject class assignment', () => {
    expect(
      inferCanonicalEnrollmentTypeForClass({
        academicOfferings: [{ enrollment_type: 'school' }],
        schoolId: 'sch-1',
        fallbackEnrollmentType: 'summer_school',
      }),
    ).toBe('school');

    expect(
      inferCanonicalEnrollmentTypeForClass({
        academicOfferings: null,
        className: 'JSS 1',
        schoolId: 'sch-1',
        fallbackEnrollmentType: null,
      }),
    ).toBe('school');

    expect(
      inferCanonicalEnrollmentTypeForClass({
        academicOfferings: [{ enrollment_type: 'special' }],
        className: 'August Coding Bootcamp',
        schoolId: null,
        fallbackEnrollmentType: null,
      }),
    ).toBe('special');
  });

  it('distinguishes termly school calendars from fixed-date cohorts in session classification', () => {
    expect(isTermlySchoolCalendar('school')).toBe(true);
    expect(isTermlySchoolCalendar('online')).toBe(true);
    expect(isTermlySchoolCalendar('special')).toBe(false);
    expect(isTermlySchoolCalendar('in_person')).toBe(false);

    const boundary = getSessionBoundary('2026/2027');
    const augCohortStudent = {
      is_active: true,
      enrollment_type: 'special',
      created_at: '2026-08-10T10:00:00.000Z',
      metadata: {},
    };
    const augSchoolStudent = {
      is_active: true,
      enrollment_type: 'school',
      created_at: '2026-05-10T10:00:00.000Z',
      metadata: {},
    };

    expect(
      classifyStudentSessionStatus(
        augCohortStudent,
        { status: 'active', started_at: '2026-08-10T10:00:00.000Z' },
        { boundary, classEnrollmentType: 'special' },
      ),
    ).toBe('confirmed_current');

    expect(
      classifyStudentSessionStatus(
        augSchoolStudent,
        { status: 'active', started_at: '2026-05-10T10:00:00.000Z' },
        { boundary, classEnrollmentType: 'school' },
      ),
    ).toBe('carryover_unconfirmed');
  });
});
