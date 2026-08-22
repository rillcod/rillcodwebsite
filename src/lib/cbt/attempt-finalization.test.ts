import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/cbt/sessions/route.ts'), 'utf8');

describe('CBT attempt finalization authority', () => {
  it('conditions both normal and deadline finalization on the in-progress state', () => {
    const matches = route.match(/\.eq\('status', 'in_progress'\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the first durable outcome to duplicate final-submit requests', () => {
    expect(route).toContain('alreadyFinalized: true');
    expect(route).toContain('Your first final submission remains recorded.');
  });
});
