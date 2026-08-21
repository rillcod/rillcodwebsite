import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('class promotion architecture', () => {
  it('promote API uses centralized class-promotion and reinstate modules', () => {
    const route = readFileSync(join(ROOT, 'app/api/classes/[id]/promote/route.ts'), 'utf8');
    const server = readFileSync(join(ROOT, 'lib/classes/promotion-server.ts'), 'utf8');

    expect(route).toContain('@/lib/classes/promotion-server');
    expect(route).toContain('buildSmartPromotionPlan');
    expect(route).toContain('applyIntelligentPromotionPlan');
    expect(server).toContain('reinstateStudentToClass');
    expect(server).toContain('buildClassPromotionPlan');
    expect(`${route}\n${server}`).not.toMatch(
      /from\s+['"]@\/lib\/classes\/naming['"].*nextSingleGrade/,
    );
  });

  it('class promotion UI delegates to promote API', () => {
    const src = readFileSync(join(ROOT, 'components/classes/ClassPromotionPanel.tsx'), 'utf8');
    expect(src).toContain('/promote');
    expect(src).toContain('ClassPromotionPlan');
  });
});
