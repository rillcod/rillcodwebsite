import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('school paper entry and report display workflow', () => {
  it('gives teachers explicit class-level entry for every official paper', () => {
    const classPage = read('src/app/dashboard/classes/[id]/page.tsx');
    const sheet = read('src/components/academic/HostPaperDatasheet.tsx');
    const topNavigation = read('src/components/layout/DesktopTopNavbar.tsx');
    const shell = read('src/components/layout/DashboardShell.tsx');

    expect(classPage).toContain('Record official school papers');
    expect(classPage).toContain("kind === 'first_test' ? 'First Test'");
    expect(classPage).toContain("kind === 'second_test' ? 'Second Test'");
    expect(classPage).toContain("hostPaperDatasheetHref({");
    expect(sheet).toContain('School paper mark sheets');
    expect(sheet).toContain('Only changed rows are saved');
    expect(topNavigation).toContain(".replace(/[-_]+/g, ' ')");
    expect(shell).toContain('isSchoolPaperSheet');
  });

  it('does not wipe typed marks while creating the backing paper and only submits dirty rows', () => {
    const sheet = read('src/components/academic/HostPaperDatasheet.tsx');

    expect(sheet).toContain("setExam((current) => ({ ...(current ?? {}), ...(json.data ?? {}), id }))");
    expect(sheet).toContain('.filter((student) => dirtyStudentIds.has(student.id))');
    expect(sheet).toContain('preserveStudentIds: failedIds');
    expect(sheet).toContain('offset += 80');
    expect(sheet).toContain('paper_kind: props.kind');
    expect(sheet).toContain('paper_max: hallMax');
  });

  it('validates one paper total and rejects ambiguous or duplicate server writes', () => {
    const sessionsRoute = read('src/app/api/cbt/sessions/route.ts');

    expect(sessionsRoute).toContain('Every learner on this sheet must use the same paper total.');
    expect(sessionsRoute).toContain('A learner appears more than once on this mark sheet.');
    expect(sessionsRoute).toContain("body.paper_kind !== paperKind");
    expect(sessionsRoute).toContain("return klass?.teacher_id === caller.id");
    expect(sessionsRoute).toContain('No marks were changed.');
  });

  it('prints explicit paper columns and never reduces parent labels to 1, 2 and Ex', () => {
    const results = read('src/app/dashboard/results/page.tsx');
    const parent = read('src/app/dashboard/parent-results/page.tsx');

    expect(results).toContain('<th>First Test</th><th>Second Test</th><th>Examination</th>');
    expect(results).toContain('School Paper Total');
    expect(results).toContain('engagement_metrics');
    expect(parent).toContain('label: row.label');
    expect(parent).not.toContain("row.kind === 'examination' ? 'Ex' : row.kind === 'second_test' ? '2' : '1'");
  });
});
