import { describe, expect, it, vi } from 'vitest';
import { reuseWeekContent, type ReuseTable } from './content-reuse-server';

/**
 * The copy must belong to the class that made it.
 *
 * decideReuse decides WHETHER to copy and is tested next door. What is tested
 * here is what the copy comes out looking like, because that is where the
 * damage is silent: the teacher who triggered it sees their own class's lesson
 * either way, and only other surfaces — school filters, RLS, reports, the
 * offering spine — see the row wearing another school's identity.
 */

const RELEASE = 'release-1';
const SOURCE_PLAN = 'plan-source';
const TARGET_PLAN = 'plan-target';

type Row = Record<string, unknown>;

/**
 * The narrow slice of the Supabase builder this helper uses.
 *
 * Hand-written rather than mocked wholesale so the chain under test is the real
 * one: a missed .eq() would quietly widen the candidate search, and a mock that
 * accepts anything would never show it.
 */
function fakeDb(options: {
  candidates: Row[];
  source?: Row | null;
  onInsert?: (row: Row) => { data: Row | null; error: { message: string } | null };
  children?: Row[];
}) {
  const inserted: { table: string; row: Row }[] = [];
  const deleted: { table: string; id: unknown }[] = [];
  const filters: Record<string, unknown> = {};

  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    let selection: 'candidates' | 'source' | 'children' = 'candidates';

    const chain = () => builder;
    Object.assign(builder, {
      select: (cols: string) => {
        if (cols === '*') selection = 'source';
        else if (cols.includes('front')) selection = 'children';
        return chain();
      },
      eq: (col: string, val: unknown) => {
        filters[`${table}.${col}`] = val;
        return chain();
      },
      neq: (col: string, val: unknown) => {
        filters[`${table}.neq.${col}`] = val;
        return chain();
      },
      order: () => chain(),
      limit: () => Promise.resolve({ data: options.candidates, error: null }),
      maybeSingle: () =>
        Promise.resolve(
          selection === 'source'
            ? { data: options.source ?? null, error: null }
            : { data: null, error: null }
        ),
      delete: () => ({
        eq: (_c: string, id: unknown) => {
          deleted.push({ table, id });
          return Promise.resolve({ error: null });
        },
      }),
      insert: (row: Row | Row[]) => {
        const rows = Array.isArray(row) ? row : [row];
        for (const r of rows) inserted.push({ table, row: r });
        const result = options.onInsert
          ? options.onInsert(rows[0])
          : { data: { id: 'copy-1' }, error: null };
        return {
          select: () => ({ maybeSingle: () => Promise.resolve(result) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ error: result.error }),
        };
      },
    });

    // Reading children resolves straight off the builder rather than .limit().
    if (table === 'flashcard_cards') {
      Object.assign(builder, {
        order: () => Promise.resolve({ data: options.children ?? [], error: null }),
      });
    }
    return builder;
  };

  return { db: { from } as never, inserted, deleted, filters };
}

/** A source row wearing the SOURCE school's identity, as a real one would. */
function sourceRow(extra: Row = {}): Row {
  return {
    id: 'source-content',
    curriculum_release_id: RELEASE,
    curriculum_week_number: 3,
    lesson_plan_id: SOURCE_PLAN,
    class_id: 'class-source',
    school_id: 'school-SOURCE',
    school_name: 'Source Academy',
    academic_term_id: 'term-SOURCE',
    term_id: 'term-SOURCE',
    course_id: 'course-SOURCE',
    created_by: 'teacher-SOURCE',
    academic_offering_id: 'offering-SOURCE',
    offering_period_id: 'period-SOURCE',
    lesson_id: 'lesson-SOURCE',
    title: 'Loops',
    metadata: { generated_from: 'progression_lesson_route' },
    created_at: '2026-01-01T00:00:00Z',
    id_should_not_carry: undefined,
  };
}

const candidate: Row = {
  id: 'source-content',
  curriculum_release_id: RELEASE,
  curriculum_week_number: 3,
  lesson_plan_id: SOURCE_PLAN,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const TARGET_SCOPE = {
  schoolId: 'school-TARGET',
  schoolName: null,
  termId: 'term-TARGET',
  courseId: 'course-TARGET',
  createdBy: 'teacher-TARGET',
  offeringId: 'offering-TARGET',
  periodId: 'period-TARGET',
};

async function copyOnce(table: ReuseTable = 'lessons', extra: Partial<Row> = {}) {
  const fake = fakeDb({ candidates: [candidate], source: sourceRow() });
  const result = await reuseWeekContent({
    db: fake.db,
    table,
    releaseId: RELEASE,
    week: 3,
    targetPlanId: TARGET_PLAN,
    classId: 'class-TARGET',
    scope: { ...TARGET_SCOPE, lessonId: 'lesson-TARGET' },
    ...extra,
  });
  return { ...fake, result };
}

describe('a copy wears the copying class identity, never the source', () => {
  it('takes school, term, course, author and pathway from the target', async () => {
    const { inserted, result } = await copyOnce('lessons');
    expect(result.copied).toBe(true);

    const row = inserted[0].row;
    expect(row.school_id).toBe('school-TARGET');
    expect(row.academic_term_id).toBe('term-TARGET');
    expect(row.course_id).toBe('course-TARGET');
    expect(row.created_by).toBe('teacher-TARGET');
    expect(row.lesson_plan_id).toBe(TARGET_PLAN);
    expect(row.class_id).toBe('class-TARGET');
  });

  it('files the copy under the target pathway, not the source offering', async () => {
    // A special programme runs two active classes on separate offerings. A copy
    // carrying the source's offering lands in a programme that never taught it.
    const { inserted } = await copyOnce('lessons');
    expect(inserted[0].row.academic_offering_id).toBe('offering-TARGET');
    expect(inserted[0].row.offering_period_id).toBe('period-TARGET');
  });

  it('does not carry the source school name across', async () => {
    const { inserted } = await copyOnce('lessons');
    expect(inserted[0].row.school_name).toBeNull();
  });

  it('keeps the teaching itself — a copy is the same lesson', async () => {
    const { inserted } = await copyOnce('lessons');
    expect(inserted[0].row.title).toBe('Loops');
    expect(inserted[0].row.curriculum_release_id).toBe(RELEASE);
    expect(inserted[0].row.curriculum_week_number).toBe(3);
  });

  it('records where it came from, so copies can be told from originals', async () => {
    const { inserted } = await copyOnce('lessons');
    const meta = inserted[0].row.metadata as Record<string, unknown>;
    expect(meta.copied_from_content_id).toBe('source-content');
    expect(meta.is_customized).toBe(false);
  });
});

describe('the search is scoped before anything is copied', () => {
  it('never offers the target its own row as a source', async () => {
    const { filters } = await copyOnce('lessons');
    expect(filters['lessons.neq.lesson_plan_id']).toBe(TARGET_PLAN);
    expect(filters['lessons.curriculum_release_id']).toBe(RELEASE);
    expect(filters['lessons.curriculum_week_number']).toBe(3);
  });

  it('applies extra match filters, so a project cannot be copied over homework', async () => {
    const { filters } = await copyOnce('assignments', {
      match: { 'metadata->>generated_from': 'progression_project_route' },
    });
    expect(filters['assignments.metadata->>generated_from']).toBe(
      'progression_project_route'
    );
  });
});

describe('reuse never becomes the reason a week fails', () => {
  it('says generate when there is no curriculum edition', async () => {
    const fake = fakeDb({ candidates: [], source: null });
    const result = await reuseWeekContent({
      db: fake.db,
      table: 'lessons',
      releaseId: null,
      week: 3,
      targetPlanId: TARGET_PLAN,
      classId: null,
      scope: TARGET_SCOPE,
    });
    expect(result).toEqual({ copied: false, reason: 'no_release' });
    expect(fake.inserted).toHaveLength(0);
  });

  it('says generate when the insert is rejected', async () => {
    const fake = fakeDb({
      candidates: [candidate],
      source: sourceRow(),
      onInsert: () => ({ data: null, error: { message: 'duplicate key' } }),
    });
    const result = await reuseWeekContent({
      db: fake.db,
      table: 'lessons',
      releaseId: RELEASE,
      week: 3,
      targetPlanId: TARGET_PLAN,
      classId: null,
      scope: TARGET_SCOPE,
    });
    expect(result.copied).toBe(false);
  });

  it('says generate when a derived value cannot be built', async () => {
    // Slides fail here when the source's storage objects cannot be duplicated.
    const { result, inserted } = await copyOnce('lesson_materials', {
      transform: async () => {
        throw new Error('source deck has no slides');
      },
    });
    expect(result.copied).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe('a half-copied package is removed rather than left behind', () => {
  it('deletes the parent when its children fail', async () => {
    // An empty deck satisfies the "already exists" check, so the week would
    // never be generated again and the class would simply have no cards.
    const afterCopy = vi.fn().mockRejectedValue(new Error('cards failed'));
    const { result, deleted } = await copyOnce('flashcard_decks', { afterCopy });

    expect(result.copied).toBe(false);
    expect(deleted).toEqual([{ table: 'flashcard_decks', id: 'copy-1' }]);
  });
});
