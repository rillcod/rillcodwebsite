import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

describe('one evaluation and result authority', () => {
  it('keeps Gradebook focused on marking and routes result preparation to Auto-fill', () => {
    const gradebook = read('app/dashboard/grades/page.tsx');

    expect(gradebook).toContain("pathname: '/dashboard/academic/results'");
    expect(gradebook).toContain('Prepare results');
    expect(gradebook).not.toContain('/api/reports/batch-sync');
    expect(gradebook).not.toContain('Batch-Sync Reports');
  });

  it('keeps the old endpoint as a non-writing compatibility boundary', () => {
    const retiredApi = read('app/api/reports/batch-sync/route.ts');

    expect(retiredApi).toContain("action_href: '/dashboard/academic/results'");
    expect(retiredApi).toContain('{ status: 410 }');
    expect(retiredApi).not.toContain('student_progress_reports');
    expect(retiredApi).not.toContain('recalculate_academic_result');
  });

  it('uses the central evidence calculator for automatic results', () => {
    const autoFillApi = read('app/api/academic-spine/results/route.ts');
    const writer = read('app/dashboard/reports/builder/page.tsx');

    expect(autoFillApi).toContain("db.rpc('recalculate_academic_result_guarded'");
    expect(autoFillApi).toContain('p_expected_updated_at');
    expect(autoFillApi).toContain('academic_offering_id: klass.academic_offering_id');
    expect(autoFillApi).toContain('offering_period_id: klass.offering_period_id');
    expect(autoFillApi).not.toContain('projectCount / 3');
    expect(writer).not.toContain('projectCount / 3');
    expect(writer).not.toContain('handleBulkBuild');
    expect(writer).toContain('Academic Auto-fill owns evidence calculation');
  });
});
