import { describe, expect, it, vi } from 'vitest';
import { loadSchoolReportFinance } from './finance';
import type { SchoolReportRange } from './types';

const range: SchoolReportRange = {
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  curriculumStartTerm: 1,
  curriculumStartWeek: 1,
  curriculumEndTerm: 1,
  curriculumEndWeek: 12,
  academicTermId: 'term-1',
  academicYear: '2026/2027',
  termLabel: 'First Term',
  academicTermNumber: 1,
};

describe('loadSchoolReportFinance', () => {
  it('records invoice and payment account source statuses', async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'academic_terms') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        if (table === 'invoices') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          })),
        };
      }),
    };

    const result = await loadSchoolReportFinance(admin as any, 'school-1', range, '2026-01-01T00:00:00.000Z');
    expect(result.dataSources).toHaveLength(2);
    expect(result.dataSources.map((row) => row.source)).toEqual(['invoices', 'payment_accounts']);
    expect(result.data.attached).toBe(false);
    expect(result.invoiceRequest).toMatch(/Action required/i);
  });
});
