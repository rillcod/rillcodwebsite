import { describe, expect, it } from 'vitest';
import { buildOfficialClosingRemark } from './closing-remark';

describe('buildOfficialClosingRemark', () => {
  it('builds a warm school-facing sign-off without internal tooling language', () => {
    const text = buildOfficialClosingRemark(
      {
        school: { name: 'Grace Academy' },
        period: { termLabel: 'Third Term', academicYear: '2025/2026' },
        summary: { averageScore: 72 },
      } as any,
      { achievements: ['Strong Python progress this term.'] } as any,
    );
    expect(text).toContain('Grace Academy');
    expect(text).toContain('Third Term');
    expect(text).toContain('strong python progress this term');
    expect(text).not.toMatch(/manual result entry/i);
  });
});
