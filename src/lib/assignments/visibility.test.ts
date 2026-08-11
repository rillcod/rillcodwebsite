import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentProgramScope } from './visibility';
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
    // Mock enrollments query returning empty
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            data: [],
          }),
        }),
      }),
    }));
    // Mock classes query returning a program_id
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { program_id: 'prog-123' } }),
        }),
      }),
    }));
    // Mock courses query returning no courses (not needed for this test)
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        in: () => ({ data: [] }),
      }),
    }));

    const result = await resolveStudentProgramScope(mockAdmin, 'student-1', 'class-1');
    expect(result.programIds.has('prog-123')).toBe(true);
    expect(result.courseIds.size).toBe(0);
  });
});
