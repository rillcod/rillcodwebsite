import { describe, expect, it } from 'vitest';
import {
  ASSET_TABLE,
  ASSET_TABLES,
  assignmentAssetKind,
  auditContent,
  contentVerdict,
  findOrphanedAssets,
  findOrphanedLessonChildren,
  isOrphanedFromPlan,
  planIdOf,
} from './content-inventory';
import { WEEK_PACKAGE_ASSETS } from './week-package';

describe('every week-package asset has a home', () => {
  it('maps all five assets to a table', () => {
    for (const asset of WEEK_PACKAGE_ASSETS) {
      expect(ASSET_TABLE[asset]).toBeTruthy();
    }
  });

  it('collapses assignment and project onto one table', () => {
    expect(ASSET_TABLE.assignment).toBe(ASSET_TABLE.project);
    // lessons, lesson_materials, flashcard_decks, assignments
    expect(ASSET_TABLES).toHaveLength(4);
  });

  it('covers the two tables the sweep could never see', () => {
    // These child tables are part of the same plan package and use their own
    // lesson_plan_id column for identity.
    expect(ASSET_TABLES).toContain('flashcard_decks');
    expect(ASSET_TABLES).toContain('lesson_materials');
  });
});

describe('plan link resolution', () => {
  it('uses the real foreign-key column as the only identity', () => {
    expect(planIdOf({ lesson_plan_id: 'col', metadata: { lesson_plan_id: 'meta' } })).toBe('col');
  });

  it('does not turn authoring metadata into a plan link', () => {
    expect(planIdOf({ lesson_plan_id: null, metadata: { lesson_plan_id: 'meta' } })).toBeNull();
  });

  it('treats blank and whitespace as no link', () => {
    expect(planIdOf({ lesson_plan_id: '   ' })).toBeNull();
    expect(planIdOf({ metadata: { lesson_plan_id: '' } })).toBeNull();
    expect(planIdOf(null)).toBeNull();
  });
});

describe('orphan rule', () => {
  const plans = new Set(['plan-1']);

  it('flags a row whose plan is gone', () => {
    expect(isOrphanedFromPlan({ lesson_plan_id: 'plan-gone' }, plans)).toBe(true);
  });

  it('never flags a row that has no plan link at all', () => {
    // Content made outside the plan flow is real teaching material. Treating
    // "unlinked" as "orphaned" would offer it up for deletion.
    expect(isOrphanedFromPlan({ lesson_plan_id: null, metadata: null }, plans)).toBe(false);
    expect(isOrphanedFromPlan({}, plans)).toBe(false);
  });

  it('never flags a row whose plan still exists', () => {
    expect(isOrphanedFromPlan({ lesson_plan_id: 'plan-1' }, plans)).toBe(false);
  });

  it('filters a mixed batch without touching the unlinked ones', () => {
    const rows = [
      { id: 'a', lesson_plan_id: 'plan-1' },
      { id: 'b', lesson_plan_id: 'plan-gone' },
      { id: 'c', lesson_plan_id: null },
      { id: 'd', metadata: { lesson_plan_id: 'plan-gone' } },
    ];
    expect(findOrphanedAssets(rows, plans).map((r) => r.id)).toEqual(['b']);
  });
});

describe('slides and decks follow their lesson', () => {
  const plans = new Set<string>(); // every plan gone — the harshest case
  const surviving = new Set(['lesson-alive']);

  it('keeps a deck whose lesson survives, however dead its plan link', () => {
    // Slides are generated inside the lesson. A stale plan link must never be
    // enough to strip a live lesson of its slide deck.
    const rows = [{ id: 'deck', lesson_id: 'lesson-alive', lesson_plan_id: 'plan-gone' }];
    expect(findOrphanedLessonChildren(rows, plans, surviving)).toEqual([]);
  });

  it('collects a deck once its lesson is gone too', () => {
    const rows = [{ id: 'deck', lesson_id: 'lesson-purged', lesson_plan_id: 'plan-gone' }];
    expect(findOrphanedLessonChildren(rows, plans, surviving).map((r) => r.id)).toEqual(['deck']);
  });

  it('still spares an unparented deck that has no dead plan link', () => {
    const rows = [{ id: 'deck', lesson_id: null, lesson_plan_id: null }];
    expect(findOrphanedLessonChildren(rows, plans, surviving)).toEqual([]);
  });

  it('collects an unparented deck whose plan is gone', () => {
    const rows = [{ id: 'deck', lesson_id: null, lesson_plan_id: 'plan-gone' }];
    expect(findOrphanedLessonChildren(rows, plans, surviving).map((r) => r.id)).toEqual(['deck']);
  });

  it('judges against post-purge survivors, not pre-purge presence', () => {
    // The lesson exists right now but is itself being purged this run, so its
    // deck must go with it rather than being left behind as fresh debris.
    const rows = [{ id: 'deck', lesson_id: 'lesson-being-purged', lesson_plan_id: 'plan-gone' }];
    const survivingAfterPurge = new Set(['lesson-alive']);
    expect(findOrphanedLessonChildren(rows, plans, survivingAfterPurge).map((r) => r.id)).toEqual(['deck']);
  });
});

describe('assignment vs project', () => {
  it('splits the shared table by assignment_type', () => {
    expect(assignmentAssetKind({ assignment_type: 'project' })).toBe('project');
    expect(assignmentAssetKind({ assignment_type: 'PROJECT' })).toBe('project');
    expect(assignmentAssetKind({ assignment_type: 'homework' })).toBe('assignment');
    expect(assignmentAssetKind({ assignment_type: 'coding' })).toBe('assignment');
    expect(assignmentAssetKind({ assignment_type: null })).toBe('assignment');
  });
});

describe('class content audit', () => {
  it('reports an empty class as empty, not as complete', () => {
    const audit = auditContent({});
    expect(audit.empty).toBe(true);
    expect(audit.preparedCount).toBe(0);
    expect(audit.missing).toHaveLength(5);
    expect(contentVerdict(audit)).toBe('No teaching content prepared');
  });

  it('catches the live shape: everything prepared, nothing released', () => {
    // This is the whole platform as of the audit — 10 draft lessons, 8 decks all
    // is_public=false, projects inactive. Presence alone called this "ready".
    const audit = auditContent({
      lessons: [{ status: 'draft', curriculum_week_number: 1 }],
      slides: [{ curriculum_week_number: 1 }],
      flashcards: [{ is_public: false, curriculum_week_number: 1 }],
      assignments: [
        { assignment_type: 'homework', is_active: false, curriculum_week_number: 1 },
        { assignment_type: 'project', is_active: false, curriculum_week_number: 1 },
      ],
    });
    expect(audit.preparedCount).toBe(5);
    expect(audit.releasedCount).toBe(0);
    expect(audit.preparedButInvisible).toBe(true);
    expect(audit.heldBack).toHaveLength(5);
    expect(contentVerdict(audit)).toBe('Prepared 5/5, but nothing released to students');
  });

  it('holds slides back while the class has no live lesson to carry them', () => {
    const held = auditContent({
      lessons: [{ status: 'draft' }],
      slides: [{ curriculum_week_number: 2 }],
    });
    expect(held.byAsset.slides.held).toBe(1);
    expect(held.byAsset.slides.live).toBe(0);

    const live = auditContent({
      lessons: [{ status: 'active' }],
      slides: [{ curriculum_week_number: 2 }],
    });
    expect(live.byAsset.slides.live).toBe(1);
  });

  it('counts a fully released class as complete', () => {
    const audit = auditContent({
      lessons: [{ status: 'active', curriculum_week_number: 1 }],
      slides: [{ curriculum_week_number: 1 }],
      flashcards: [{ is_public: true, curriculum_week_number: 1 }],
      assignments: [
        { assignment_type: 'homework', is_active: true, curriculum_week_number: 1 },
        { assignment_type: 'project', is_active: true, curriculum_week_number: 1 },
      ],
    });
    expect(audit.releasedCount).toBe(5);
    expect(audit.missing).toHaveLength(0);
    expect(audit.heldBack).toHaveLength(0);
    expect(audit.preparedButInvisible).toBe(false);
    expect(contentVerdict(audit)).toBe('All five prepared and released');
  });

  it('does not let a live lesson disguise four missing assets', () => {
    // The regression the sweep had: seeing lessons and calling the class done.
    const audit = auditContent({ lessons: [{ status: 'active', curriculum_week_number: 1 }] });
    expect(audit.preparedCount).toBe(1);
    expect(audit.releasedCount).toBe(1);
    expect(audit.missing).toEqual(['slides', 'flashcards', 'assignment', 'project']);
    expect(contentVerdict(audit)).toContain('missing slides, flashcards, assignment, project');
  });

  it('counts distinct weeks, including the legacy metadata week', () => {
    const audit = auditContent({
      lessons: [
        { status: 'active', curriculum_week_number: 1 },
        { status: 'active', metadata: { week: 2 } },
        { status: 'active', curriculum_week_number: 1 },
      ],
    });
    expect(audit.weeksTouched).toBe(2);
    expect(audit.byAsset.lesson.present).toBe(3);
  });
});
