import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const detail = readFileSync(join(ROOT, 'app/dashboard/assignments/[id]/page.tsx'), 'utf8');

describe('learner assignment submission feedback', () => {
  it('uses the authoritative server result in the learner receipt', () => {
    expect(detail).toContain("submission?.status === 'graded' && submission?.grade != null");
    expect(detail).toContain('graded by the assessment engine');
    expect(detail).toContain('work is in the teacher review queue');
  });

  it('makes local draft protection failures visible without implying server loss', () => {
    expect(detail).toContain('Automatic draft backup is unavailable on this device.');
    expect(detail).toContain('Server-saved submissions are unchanged.');
    expect(detail).toContain('submission is safely stored on the server');
    expect(detail).toContain('Dismiss draft warning');
  });
});
