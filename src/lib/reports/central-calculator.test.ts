import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000109_include_written_exams_in_central_results.sql'),
  'utf8',
);
const resultApi = readFileSync(join(process.cwd(), 'src/app/api/academic-spine/results/route.ts'), 'utf8');
const weightsPage = readFileSync(join(process.cwd(), 'src/app/dashboard/academic/weights/page.tsx'), 'utf8');
const schemeApi = readFileSync(join(process.cwd(), 'src/app/api/academic-spine/schemes/route.ts'), 'utf8');

describe('central academic result calculator', () => {
  it('includes official CBT and written-exam evidence in theory', () => {
    expect(migration).toContain("e.evidence_type = 'cbt_session'");
    expect(migration).toContain("e.evidence_type = 'exam_attempt'");
    expect(migration).toContain('join public.exams x on x.id = e.assessment_id');
    expect(migration).toContain("e.evidence_status in ('graded','moderated')");
    expect(migration).toContain('e.percentage is not null');
  });

  it('decides expected evidence from the exact class, offering and period', () => {
    expect(migration).toContain('x.class_id = r.class_id and x.course_id = r.course_id');
    expect(migration).toContain('x.academic_offering_id = r.academic_offering_id');
    expect(migration).toContain('x.offering_period_id = r.offering_period_id');
    expect(migration).toContain("coalesce(x.metadata ->> 'result_eligible', 'true') <> 'false'");
  });

  it('keeps every report display field synchronized with the central calculation', () => {
    expect(migration).toContain("'classwork_score'");
    expect(migration).toContain("'assessment_score'");
    expect(migration).toContain("'score_weights', scheme.components");
    expect(migration).toContain('overall_grade = case');
    expect(migration).toContain("'overall_grade', case");
  });

  it('uses deterministic policy precedence and safely parses optional relative weights', () => {
    expect(migration).toContain('s.updated_at desc');
    expect(migration).toContain('s.id desc');
    expect(migration).toContain('public.valid_academic_assessment_components(s.components)');
    expect(schemeApi).toContain('scoreWeightsFromPublishedComponents(scheme.components)');
    expect(migration).toContain('public.safe_assessment_weight');
    expect(migration).toContain("v_text !~ '^[0-9]+([.][0-9]+)?$'");
  });

  it('does not rewrite source evidence or learner attempts', () => {
    expect(migration).not.toContain('update public.academic_assessment_evidence');
    expect(migration).not.toContain('update public.exam_attempts');
    expect(migration).not.toContain('update public.cbt_sessions');
    expect(migration).not.toContain('update public.assignment_submissions');
  });

  it('returns a professional recovery path when the central rule is absent', () => {
    expect(resultApi).toContain("code: 'ASSESSMENT_SCHEME_REQUIRED'");
    expect(resultApi).toContain("action_url: '/dashboard/academic/weights'");
    expect(resultApi).not.toContain('detail: calculationError.details');
    expect(weightsPage).toContain('Only an administrator can publish a replacement');
    expect(weightsPage).toContain('Administrator approval required');
    expect(weightsPage).not.toContain('automatic results fall back to the built-in defaults');
  });
});
