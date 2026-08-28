import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('class-plan assignment and project release contract', () => {
  it('does not weaken the five AI generators or their explicit automatic-release setting', () => {
    expect(read('src/app/api/lesson-plans/[id]/generate-lessons/route.ts'))
      .toContain('body.auto_publish === true ? "active" : "draft"');
    expect(read('src/app/api/lesson-plans/[id]/generate-slides/route.ts'))
      .toContain('body.auto_publish === true');
    expect(read('src/app/api/lesson-plans/[id]/generate-flashcards/route.ts'))
      .toContain('body.auto_publish === true');
    expect(read('src/app/api/lesson-plans/[id]/generate-assignments/route.ts'))
      .toContain('body.auto_publish === true');
    expect(read('src/app/api/lesson-plans/[id]/generate-projects/route.ts'))
      .toContain('body.auto_publish === true');
  });

  it('holds every assignment created through the general API when it belongs to a plan', () => {
    const route = read('src/app/api/assignments/route.ts');
    expect(route).toContain('if (lessonPlanId) payload.is_active = false');
  });

  it('rejects individual release-state changes for an existing plan item', () => {
    const route = read('src/app/api/assignments/[id]/route.ts');
    expect(route).toContain("code: 'PACKAGE_RELEASE_MANAGED'");
    expect(route).toContain('body.is_active !== existing.is_active');
  });

  it('saves plan-linked manual work as held and preserves its class meeting', () => {
    const assignmentPage = read('src/app/dashboard/assignments/new/page.tsx');
    const projectPage = read('src/app/dashboard/projects/new/page.tsx');
    const planPage = read('src/app/dashboard/lesson-plans/[id]/page.tsx');

    expect(assignmentPage).toContain('is_active: !lessonPlanId');
    expect(assignmentPage).toContain('session_number: lessonSession');
    expect(projectPage).toContain('preLessonPlanId ? false : !isDraft');
    expect(projectPage).toContain('Save to Class Plan');
    expect(planPage).toContain('&session=${canonicalMeetingSession');
  });
});
