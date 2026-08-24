import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/progress-reports/[id]/email/route.ts'), 'utf8');
const results = readFileSync(join(process.cwd(), 'src/app/dashboard/results/page.tsx'), 'utf8');
const mutationRoute = readFileSync(join(process.cwd(), 'src/app/api/progress-reports/[id]/route.ts'), 'utf8');
const writerRoute = readFileSync(join(process.cwd(), 'src/app/api/progress-reports/route.ts'), 'utf8');
const bulkPublishRoute = readFileSync(join(process.cwd(), 'src/app/api/progress-reports/bulk-publish/route.ts'), 'utf8');
const builder = readFileSync(join(process.cwd(), 'src/app/dashboard/reports/builder/page.tsx'), 'utf8');
const autoFillRoute = readFileSync(join(process.cwd(), 'src/app/api/academic-spine/results/route.ts'), 'utf8');

describe('progress report sharing boundary', () => {
  it('shares only a version-verified published report through the dedicated endpoint', () => {
    expect(route).toContain("code: 'REPORT_NOT_PUBLISHED'");
    expect(route).toContain("code: 'STALE_REPORT_DRAFT'");
    expect(route).toContain('canAccessProgressReport');
    expect(route).toContain("event: 'sent'");
    expect(results).toContain('/email`');
    expect(results).toContain('expected_updated_at: reportToDisplay.updated_at');
    expect(results).not.toContain("btoa(JSON.stringify({ reportId:");
  });

  it('uses the signed tracking helper and accepts only a PDF attachment', () => {
    expect(route).toContain('buildEmailTrackingPixelUrl');
    expect(route).toContain("content.startsWith('JVBER')");
    expect(route).toContain("eventType: 'progress_report_shared'");
  });

  it('keeps every report lifecycle mutation on a loaded version', () => {
    expect(mutationRoute).toContain("code: 'REPORT_VERSION_REQUIRED'");
    expect(mutationRoute).toContain("updateQuery.is('updated_at', null)");
    expect(mutationRoute).toContain('{ expectedUpdatedAt }');
    expect(writerRoute).toContain("code: 'REPORT_VERSION_REQUIRED'");
    expect(builder).toContain('expected_updated_at: savedUpdatedAt');
    expect(results).toContain('expected_updated_at: selectedReport.updated_at');
    expect(bulkPublishRoute).toContain('{ expectedUpdatedAt: draft.updated_at ?? null }');
    expect(bulkPublishRoute).not.toContain('.update({ teacher_id: caller.id');
    expect(autoFillRoute).toContain("db.rpc('recalculate_academic_result_guarded'");
  });
});
