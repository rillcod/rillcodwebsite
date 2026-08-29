import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('complete teaching-package hold contract', () => {
  const migration = read(
    'supabase/migrations/20260929000122_hold_complete_teaching_package.sql'
  );

  it('withdraws every learner-facing package asset in one database function', () => {
    expect(migration).toContain('hold_prepared_week_atomic');
    expect(migration).toContain("SET status = 'draft'");
    expect(migration).toContain('SET is_active = false');
    expect(migration.match(/SET is_public = false/g)).toHaveLength(2);
  });

  it('never deletes submissions, scores, attendance or delivery history', () => {
    expect(migration.toLowerCase()).not.toContain('delete from');
    expect(migration).toContain('without deleting submissions, grades or attendance');
  });

  it('exposes a confirmed, audited correction action in the class workspace', () => {
    const route = read('src/app/api/classes/[id]/teaching-workspace/route.ts');
    const workspace = read('src/components/classes/ClassTeachingWorkspace.tsx');

    expect(route).toContain('body.action === "hold_week"');
    expect(route).toContain('action: "hold_teaching_package"');
    expect(route).toContain('learner_evidence_preserved: true');
    expect(workspace).toContain('Hold this package from students?');
    expect(workspace).toContain('Existing submissions, scores, attendance and delivery history remain safe.');
  });
});
