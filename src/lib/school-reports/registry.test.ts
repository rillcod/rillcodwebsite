import { describe, expect, it, vi } from 'vitest';
import { findActiveSchoolReportBook, openSchoolReportBook } from './registry';

function mockAdmin(rows: any[] | null, error: { message: string; code?: string } | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows?.[0] ?? null, error }),
  };
  return {
    from: vi.fn(() => chain),
    chain,
  };
}

describe('school report book registry', () => {
  it('findActiveSchoolReportBook returns the active draft or published row', async () => {
    const admin = mockAdmin([
      {
        id: 'book-1',
        school_id: 'school-a',
        title: 'Term report',
        status: 'draft',
        academic_term_id: 'term-1',
        academic_year: '2026/2027',
        term_label: 'First Term',
        created_by: 'teacher-1',
        published_at: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ]);
    const book = await findActiveSchoolReportBook(admin as any, 'school-a', 'term-1');
    expect(book?.id).toBe('book-1');
    expect(admin.chain.in).toHaveBeenCalledWith('status', ['draft', 'published']);
  });

  it('openSchoolReportBook reuses an existing book instead of creating a duplicate', async () => {
    const admin = mockAdmin([
      {
        id: 'existing-book',
        school_id: 'school-a',
        title: 'Shared draft',
        status: 'draft',
        academic_term_id: 'term-1',
        academic_year: '2026/2027',
        term_label: 'First Term',
        created_by: 'teacher-1',
        published_at: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ]);
    const create = vi.fn();
    const result = await openSchoolReportBook(admin as any, {
      schoolId: 'school-a',
      academicTermId: 'term-1',
      create,
    });
    expect(result.action).toBe('reused');
    if (result.action === 'reused') {
      expect(result.id).toBe('existing-book');
      expect(result.message).toMatch(/shared draft/i);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('openSchoolReportBook creates when no active book exists', async () => {
    const admin = mockAdmin(null);
    const create = vi.fn().mockResolvedValue('new-book');
    const result = await openSchoolReportBook(admin as any, {
      schoolId: 'school-a',
      academicTermId: 'term-1',
      create,
    });
    expect(result).toEqual({ action: 'created', id: 'new-book' });
    expect(create).toHaveBeenCalledOnce();
  });
});
