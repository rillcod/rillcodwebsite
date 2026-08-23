import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('written exam review authority', () => {
  const migration = read('supabase/migrations/20260929000096_version_written_exam_marking.sql');
  const action = read('src/lib/exams/manual-grade-action.ts');
  const service = read('src/services/grading.service.ts');
  const reviewPage = read('src/app/dashboard/exams/[id]/attempts/[attemptId]/page.tsx');

  it('versions corrections and maps approved marks into central evidence', () => {
    expect(migration).toContain('grading_version integer not null default 1');
    expect(migration).toContain('version_written_exam_marking');
    expect(migration).toContain("when new.moderation_status = 'approved' then 'moderated'");
    expect(migration).toContain("evidence.evidence_type = 'exam_attempt'");
  });

  it('accepts explicit stale-review and moderation context at the server boundary', () => {
    expect(action).toContain('expected_version: z.number().int().positive().optional()');
    expect(action).toContain("moderation_status: z.enum(['unreviewed', 'reviewed', 'approved', 'returned'])");
    expect(service).toContain('STALE_ASSESSMENT_REVIEW');
    expect(service).toContain("query.eq('grading_version', version)");
  });

  it('never approves an incompletely marked written exam', () => {
    expect(migration).toContain("moderation_status <> 'approved' or status = 'graded'");
    expect(service).toContain('Complete all manual marking before approving this result.');
  });

  it('carries version and optional moderation context through the staff review screen', () => {
    expect(reviewPage).toContain("{ expected_version: attempt.grading_version }");
    expect(reviewPage).toContain('moderation_status: moderationStatus');
    expect(reviewPage).toContain('Optional quality control; normal marking remains available.');
  });
});
