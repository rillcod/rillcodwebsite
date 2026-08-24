import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const consumers = [
  'src/app/api/parents/portal/route.ts',
  'src/app/api/cron/weekly-summary/route.ts',
  'src/app/api/cron/at-risk-students/route.ts',
  'src/app/dashboard/attendance/page.tsx',
  'src/app/dashboard/parent-attendance/page.tsx',
  'src/app/dashboard/leaderboard/page.tsx',
  'src/app/dashboard/school-overview/page.tsx',
  'src/lib/progression/promotion-settings.ts',
  'src/lib/school-reports/progress-report.ts',
  'src/services/attendance.service.ts',
] as const;

describe('one attendance policy across product surfaces', () => {
  it.each(consumers)('%s consumes the shared attendance policy', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    expect(source).toMatch(/attendanceRate|measuredAttendancePercentage/);
  });

  it('keeps parent activity language aligned with late and excused policy', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/parents/portal/route.ts'), 'utf8');
    expect(source).toContain('countsAsAttended(r.status)');
    expect(source).toContain('isExcluded(r.status)');
    expect(source).toContain('Not counted against attendance');
  });

  it('keeps attendance print branding on the approved company name', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/dashboard/attendance/page.tsx'), 'utf8');
    expect(source).toContain('RILLCOD <span>TECHNOLOGIES</span>');
    expect(source).not.toContain('RILLCOD <span>ACADEMY</span>');
  });
});
