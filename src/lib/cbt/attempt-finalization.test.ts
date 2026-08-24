import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/cbt/sessions/route.ts'), 'utf8');
const reviewRoute = readFileSync(join(process.cwd(), 'src/app/api/cbt/sessions/[id]/route.ts'), 'utf8');
const reviewPage = readFileSync(join(process.cwd(), 'src/app/dashboard/cbt/[id]/sessions/[sessionId]/grade/page.tsx'), 'utf8');
const reviewMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260929000094_version_cbt_grading_and_moderation.sql'), 'utf8');

describe('CBT attempt finalization authority', () => {
  it('conditions both normal and deadline finalization on the in-progress state', () => {
    const matches = route.match(/\.eq\('status', 'in_progress'\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the first durable outcome to duplicate final-submit requests', () => {
    expect(route).toContain('alreadyFinalized: true');
    expect(route).toContain('Your first final submission remains recorded.');
  });

  it('versions staff marking and rejects stale review saves', () => {
    expect(reviewMigration).toContain('grading_version integer not null default 1');
    expect(reviewMigration).toContain('moderation_status');
    expect(reviewMigration).toContain('new.grading_version := old.grading_version + 1');
    expect(reviewRoute).toContain("code: 'STALE_ASSESSMENT_REVIEW'");
    expect(reviewRoute).toContain("query.eq('grading_version', version)");
    expect(reviewRoute).toContain("code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED'");
    expect(reviewRoute).toContain("code: 'REVIEW_VERSION_REQUIRED'");
    expect(reviewPage).toContain('expected_version: session.grading_version');
    expect(reviewRoute).not.toContain('updateResult = await runUpdate(allowed, null)');
  });

  it('does not approve a sitting that still needs manual marking', () => {
    expect(reviewRoute).toContain('Complete all manual marking before approving this result.');
  });

  it('keeps totals server-derived and does not clear manual marks on a notes-only save', () => {
    expect(reviewRoute).toContain("if ('score' in body || 'status' in body || 'needs_grading' in body)");
    expect(reviewRoute).toContain('if (hasManualScores)');
    expect(reviewRoute).toContain('const rawManualScores = body.manual_scores as Record<string, unknown>');
  });

  it('makes duplicate final-submit requests idempotent', () => {
    expect(route).toContain('existing && FINAL_CBT_STATUSES.includes');
    expect(route).toContain('alreadyFinalized: true');
    expect(route).toContain('Your first final submission remains recorded.');
  });
});
