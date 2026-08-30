import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const lessonPage = readFileSync(join(ROOT, 'app/dashboard/lessons/[id]/page.tsx'), 'utf8');

describe('lesson optional-generation fallbacks', () => {
  it('checks failed HTTP responses instead of treating error JSON as content', () => {
    expect(lessonPage.match(/!response\.ok/g)).toHaveLength(3);
  });

  it('keeps learner-facing fallbacks for explanation and recap, and surfaces opener failures', () => {
    expect(lessonPage).toContain('Your quiz result is safe');
    expect(lessonPage).toContain('Your lesson is complete and your progress is saved');
    expect(lessonPage).toContain('setHookError');
    expect(lessonPage).toContain('Could not create the lesson opener');
  });

  it('does not silently swallow optional lesson generation failures', () => {
    expect(lessonPage).not.toMatch(/\.catch\(\(\) => \{\}\)/);
  });
});
