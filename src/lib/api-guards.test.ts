import { describe, it, expect } from 'vitest';
import { validateLessonPlanForGeneration } from './api-guards';

/**
 * The generation gate is not just a boolean any more — the teaching workspace
 * and the week generator both branch on `reason` and render `action_href`, so
 * the shape of a refusal is part of the contract, not an implementation detail.
 */
describe('validateLessonPlanForGeneration', () => {
  const published = {
    id: 'plan-1',
    status: 'published',
    course_id: 'course-1',
    school_id: 'school-1',
  };

  it('allows a published plan with both bindings', () => {
    expect(validateLessonPlanForGeneration(published)).toBeNull();
  });

  it('refuses a draft plan with a publish action pointing at that plan', () => {
    const block = validateLessonPlanForGeneration({ ...published, status: 'draft' });
    expect(block).not.toBeNull();
    expect(block!.status).toBe(422);
    expect(block!.reason).toBe('not_published');
    expect(block!.action_href).toBe('/dashboard/lesson-plans/plan-1');
    expect(block!.action_label).toBeTruthy();
    // The teacher must be told which state the plan is actually in.
    expect(block!.detail).toContain('draft');
  });

  it('names the real status for a non-draft, non-published plan', () => {
    const block = validateLessonPlanForGeneration({ ...published, status: 'archived' });
    expect(block!.reason).toBe('not_published');
    expect(block!.detail).toContain('archived');
  });

  it('refuses a missing plan without inventing an action link', () => {
    const block = validateLessonPlanForGeneration(null);
    expect(block!.status).toBe(404);
    expect(block!.reason).toBe('not_found');
    expect(block!.action_href).toBeUndefined();
  });

  it('refuses a published plan that is missing a course or school binding', () => {
    const noCourse = validateLessonPlanForGeneration({ ...published, course_id: null });
    expect(noCourse!.reason).toBe('missing_binding');
    expect(noCourse!.status).toBe(422);

    const noSchool = validateLessonPlanForGeneration({ ...published, school_id: null });
    expect(noSchool!.reason).toBe('missing_binding');
  });

  it('omits the action link when the plan carries no id', () => {
    const block = validateLessonPlanForGeneration({ status: 'draft' });
    expect(block!.reason).toBe('not_published');
    expect(block!.action_href).toBeUndefined();
    expect(block!.action_label).toBeUndefined();
  });
});
