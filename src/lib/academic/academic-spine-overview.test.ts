import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  join(process.cwd(), 'src/app/api/academic-spine/route.ts'),
  'utf8',
);
const page = readFileSync(
  join(process.cwd(), 'src/app/dashboard/academic/page.tsx'),
  'utf8',
);

describe('academic office overview truth', () => {
  it('uses exact database counts for downstream academic stages', () => {
    expect(route).toContain("select('id', { count: 'exact', head: true })");
    expect(route).toContain('linked_assessments: linkedAssessments.count ?? 0');
    expect(route).toContain('linked_evidence: linkedEvidence.count ?? 0');
    expect(route).toContain('published_reports: publishedReports.count ?? 0');
  });

  it('never returns unpublished report rows or staff attention work to a learner', () => {
    expect(route).toContain("scoped.eq('student_id', studentId).eq('is_published', true)");
    expect(route).toContain("attention: user.role === 'student'");
  });

  it('keeps the office focused and moves diagnostics behind one disclosure', () => {
    expect(page).toContain('Continue the single next action from curriculum to class teaching and results.');
    expect(page).toContain('More academic tools');
    expect(page).not.toContain('label: "Assigned"');
    expect(page).not.toContain('showPipeline');
    expect(page).not.toContain('showWorkflowDetails');
  });

  it('surfaces the delivery bottleneck and gives every role a useful landing', () => {
    expect(page).toContain('/api/teaching/pending-approval?summary=1');
    expect(page).toContain('Teaching delivery');
    expect(page).toContain('Review delivery');
    expect(page).toContain('Continue teaching');
    expect(page).toContain('/dashboard/classes/${klass.id}?operation=teaching');
    expect(page).toContain('Open my learning');
    expect(page).toContain('Only results that have been checked and published for you.');
  });
});
