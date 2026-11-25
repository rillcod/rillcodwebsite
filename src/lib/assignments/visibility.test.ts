import type { SupabaseClient } from '@supabase/supabase-js';
import { assignmentVisibleToStudent, resolveStudentProgramScope } from './visibility';
import { vi } from 'vitest';

describe('resolveStudentProgramScope', () => {
  const mockFrom = vi.fn();
  const mockAdmin = {
    from: mockFrom,
  } as unknown as SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes program from class when student has no enrollments', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'enrollments') {
        return { select: () => ({ eq: () => ({ in: () => ({ data: [] }) }) }) };
      }
      if (table === 'class_term_rosters') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: { status: 'active' } }) }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'classes') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { program_id: 'prog-123' } }) }) }) };
      }
      if (table === 'courses') {
        return { select: () => ({ in: () => ({ data: [] }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await resolveStudentProgramScope(mockAdmin, 'student-1', 'class-1');
    expect(result.programIds.has('prog-123')).toBe(true);
    expect(result.courseIds.size).toBe(0);
  });

  it('returns empty scope when student is soft-withdrawn from the class roster', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'enrollments') {
        return { select: () => ({ eq: () => ({ in: () => ({ data: [{ program_id: 'prog-123' }] }) }) }) };
      }
      if (table === 'class_term_rosters') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: { status: 'withdrawn' } }) }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await resolveStudentProgramScope(mockAdmin, 'student-1', 'class-1');
    expect(result.programIds.size).toBe(0);
    expect(result.courseIds.size).toBe(0);
  });
});

describe('assignmentVisibleToStudent', () => {
  it('allows any course in the learner programme instead of only the class current course', () => {
    const visible = assignmentVisibleToStudent(
      {
        id: 'assignment-2',
        program_id: 'prog-123',
        course_id: 'course-module-2',
        school_id: null,
        school_name: null,
        created_by: 'admin-1',
        metadata: {},
      },
      {
        id: 'student-1',
        school_id: null,
        school_name: null,
        class_id: 'class-1',
        section_class: null,
        primary_teacher_id: null,
        enrollment_type: 'special',
      },
      {
        programIds: new Set(['prog-123']),
        courseIds: new Set(['course-module-1', 'course-module-2']),
      },
      { 'admin-1': 'admin' },
      null,
    );

    expect(visible).toBe(true);
  });
});
