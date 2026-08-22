import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000095_align_review_states_with_academic_evidence.sql'),
  'utf8',
);

describe('central evaluation evidence authority', () => {
  it('maps assignment and project publication through one evidence lifecycle', () => {
    expect(migration).toContain("when new.status in ('moderated', 'published') then 'moderated'");
    expect(migration).toContain("evidence.evidence_type = 'assignment_submission'");
    expect(migration).toContain("'review_version', new.version");
  });

  it('keeps CBT evidence ungraded until manual review is complete', () => {
    expect(migration).toContain("new.status in ('completed', 'passed', 'failed') and coalesce(new.needs_grading, false) = false");
    expect(migration).toContain("when new.moderation_status = 'approved' then 'moderated'");
    expect(migration).toContain('cbt_sessions_approved_marking_complete');
  });

  it('does not rewrite learner scores or answers during reconciliation', () => {
    expect(migration).toContain('update public.assignment_submissions set updated_at = updated_at');
    expect(migration).toContain('update public.cbt_sessions set updated_at = updated_at');
    expect(migration).not.toMatch(/set\s+(grade|score|answers|manual_scores)\s*=/i);
  });
});
