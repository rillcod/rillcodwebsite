import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const CLASS_PLAN_ROUTES = [
  'src/app/api/lesson-plans/[id]/route.ts',
  'src/app/api/lesson-plans/[id]/operations/route.ts',
  'src/app/api/lesson-plans/[id]/release-week/route.ts',
  'src/app/api/lesson-plans/[id]/schedule/route.ts',
  'src/app/api/lesson-plans/[id]/performance/route.ts',
  'src/app/api/lesson-plans/[id]/syllabus-qa/route.ts',
  'src/app/api/lesson-plans/[id]/progression-week-guide/route.ts',
  'src/app/api/lesson-plans/[id]/generate-progression/route.ts',
  'src/app/api/lesson-plans/[id]/generate-lessons/route.ts',
  'src/app/api/lesson-plans/[id]/generate-slides/route.ts',
  'src/app/api/lesson-plans/[id]/generate-flashcards/route.ts',
  'src/app/api/lesson-plans/[id]/generate-assignments/route.ts',
  'src/app/api/lesson-plans/[id]/generate-projects/route.ts',
];

describe('one class-plan authorization rule', () => {
  it.each(CLASS_PLAN_ROUTES)('%s uses the central lesson-plan authority', (path) => {
    const source = read(path);
    expect(source).toContain('canAccessLessonScope');
    expect(source).not.toContain("allowedSchoolIds.includes(plan.school_id");
    expect(source).not.toContain('plan.created_by === staff.id || klass?.teacher_id === staff.id');
  });

  it('generate-week keeps class ownership on canGenerateForClass', () => {
    const source = read('src/app/api/lesson-plans/[id]/generate-week/route.ts');
    expect(source).toContain('canGenerateForClass');
  });
});
