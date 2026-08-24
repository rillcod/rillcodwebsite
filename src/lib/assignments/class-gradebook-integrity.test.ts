import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const classPage = readFileSync(join(ROOT, 'app/dashboard/classes/[id]/page.tsx'), 'utf8');

describe('class gradebook integrity', () => {
  it('uses the canonical submission route for existing academic evidence', () => {
    expect(classPage).toContain('/api/assignment-submissions/${sub.id}');
    expect(classPage).toContain('grade: numVal');
    expect(classPage).toContain('feedback: sub.feedback || null');
    expect(classPage).toContain('expected_version: sub.version');
  });

  it('does not create an empty manual-score record when there is nothing to clear', () => {
    expect(classPage).toContain('if (!sub && numVal === null) return;');
  });

  it('restores the displayed value and surfaces save failures to the teacher', () => {
    expect(classPage).toContain('Grade was not saved');
    expect(classPage).toContain('The recorded grade remains unchanged.');
    expect(classPage).toContain("input.value = score != null ? String(score) : ''");
    expect(classPage).not.toContain('catch (err) {\n                                            console.error(err);');
  });
});
