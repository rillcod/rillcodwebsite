import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const registry = readFileSync(join(ROOT, 'app/dashboard/students/page.tsx'), 'utf8');
const lessonPlan = readFileSync(join(ROOT, 'app/dashboard/lesson-plans/[id]/page.tsx'), 'utf8');

describe('staff workflow failure visibility', () => {
  it('keeps linked registry data failures visible and retryable', () => {
    expect(registry).toContain('Retry linked data');
    expect(registry).toContain('Promise.allSettled(fetches)');
    expect(registry).toContain('Existing student records remain visible and unchanged.');
  });

  it('distinguishes a failed class lookup from an empty class list', () => {
    expect(lessonPlan).toContain('classLoadError');
    expect(lessonPlan).toContain('onRetryClasses');
    expect(lessonPlan).toContain('The lesson plan is unchanged.');
  });

  it('does not silently swallow failures in these central staff pages', () => {
    for (const source of [registry, lessonPlan]) {
      expect(source).not.toMatch(/\.catch\(\(\) => \{\s*\}\)/);
      expect(source).not.toMatch(/catch\s*\{\s*\/\*\s*ignore\s*\*\/\s*\}/);
    }
  });
});
