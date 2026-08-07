/**
 * Copy a week's content from the class that already generated it — once, for
 * every content type.
 *
 * The decision rules live in content-reuse.ts and are pure. This is the part
 * that talks to the database: find the candidates, ask decideReuse, copy the
 * row. It exists because the first version of this was written inline inside
 * generate-lessons, and the four other generators were about to receive their
 * own copies of the same eighty lines. This codebase has learned that lesson
 * repeatedly — model queues in six routes, auto-generate settings in four,
 * cron cadence in five — and the shape of the bug is always the same: one copy
 * gets a fix and the others quietly do not.
 *
 * A week is five pieces of content and only the lesson was being copied, so a
 * class still paid the AI four times for a week it was handed for free. That is
 * the gap this closes.
 *
 * Everything here fails soft. Every path that cannot copy returns a reason and
 * the caller generates exactly as it does today — so wiring a generator into
 * this can make it cheaper, never broken.
 */
import { buildCopy, decideReuse, type ExistingContent } from './content-reuse';

type DbClient = { from: (table: string) => any };

/** Tables that carry the curriculum lineage added by migration 41. */
export type ReuseTable =
  | 'lessons'
  | 'assignments'
  | 'flashcard_decks'
  | 'lesson_materials';

/**
 * Who the copy belongs to.
 *
 * Required, because getting it wrong is silent. buildCopy repoints the plan and
 * the class, which is what makes a copy "this class's content" — but every one
 * of these tables also carries school_id, term_id, course_id and created_by,
 * and those were being carried across from the source untouched. A school that
 * copied Week 3 got a row stamped with ANOTHER school's id and name.
 *
 * Nothing looked wrong on the page that generated it, which is why it survived:
 * the teacher sees their own class's lesson either way. It is every other
 * surface that breaks — anything filtering lessons by school, any RLS policy
 * keyed on school_id, and any report counting a school's own content. The
 * copying school's row would be counted as the source school's.
 *
 * So identity is an argument, not an inherited field, and there is one map
 * below of which column each table keeps it in.
 */
export type TargetScope = {
  schoolId: string | null;
  schoolName?: string | null;
  termId?: string | null;
  courseId?: string | null;
  /** Whoever is credited with the content in the copying class. */
  createdBy?: string | null;
  /** The copying class's own lesson row, for content that hangs off a lesson. */
  lessonId?: string | null;
  /**
   * Which pathway this copy is delivered through, and in which period.
   *
   * As load-bearing as school_id, and easier to overlook. A special programme
   * runs two active classes at once on separate offerings, and a copy that
   * inherited the source's offering would be filed under the wrong one — the
   * lesson would appear in a programme nobody delivered it in, and 20260929000025
   * exists precisely because content without a correct period falls off the
   * spine and becomes reachable only through its course.
   *
   * Left alone when the caller does not pass them, so the binding triggers keep
   * whatever they would have set.
   */
  offeringId?: string | null;
  periodId?: string | null;
};

/**
 * Where each table keeps the identity fields, since they do not agree.
 *
 * lessons calls its term academic_term_id and carries a denormalised
 * school_name; the other three call it term_id and do not. Writing a column a
 * table does not have fails the whole insert, so this is spelled out per table
 * rather than guessed.
 */
const IDENTITY_COLUMNS: Record<ReuseTable, Partial<Record<keyof TargetScope, string>>> = {
  lessons: {
    schoolId: 'school_id',
    schoolName: 'school_name',
    termId: 'academic_term_id',
    courseId: 'course_id',
    createdBy: 'created_by',
    offeringId: 'academic_offering_id',
    periodId: 'offering_period_id',
  },
  assignments: {
    schoolId: 'school_id',
    schoolName: 'school_name',
    termId: 'term_id',
    courseId: 'course_id',
    createdBy: 'created_by',
    lessonId: 'lesson_id',
    offeringId: 'academic_offering_id',
    periodId: 'offering_period_id',
  },
  flashcard_decks: {
    schoolId: 'school_id',
    termId: 'term_id',
    courseId: 'course_id',
    createdBy: 'created_by',
    lessonId: 'lesson_id',
    offeringId: 'academic_offering_id',
    periodId: 'offering_period_id',
  },
  lesson_materials: {
    schoolId: 'school_id',
    termId: 'term_id',
    courseId: 'course_id',
    createdBy: 'created_by',
    lessonId: 'lesson_id',
    offeringId: 'academic_offering_id',
    periodId: 'offering_period_id',
  },
};

/**
 * The target's identity, as columns for this table.
 *
 * Only fields the caller actually supplied are written. A plan with no term
 * should leave the source's term in place no more than it should invent one —
 * but an explicit null is a real answer and is written as null.
 */
function identityFor(table: ReuseTable, scope: TargetScope): Record<string, unknown> {
  const columns = IDENTITY_COLUMNS[table];
  const row: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(columns) as [keyof TargetScope, string][]) {
    if (field in scope) row[column] = scope[field] ?? null;
  }
  return row;
}

export type ReuseInput = {
  db: DbClient;
  table: ReuseTable;
  /** The copying class's own identity. Never inherited from the source. */
  scope: TargetScope;
  /** The edition the target plan was built from. No edition, no copying. */
  releaseId: string | null | undefined;
  week: number | null | undefined;
  targetPlanId: string;
  classId: string | null;
  /**
   * Extra equality filters that decide what counts as the same content.
   *
   * Assignments and projects share one table and are told apart by
   * assignment_type. Without this an exercise could be copied over a project,
   * which is worse than generating: it is silently the wrong content for a
   * whole term.
   */
  match?: Record<string, string | number>;
  /**
   * Columns to set on the copy beyond plan and class.
   *
   * Slides hang off a lesson_id, and the copying class has its own lesson row,
   * so the copy must be repointed at it rather than at the source's lesson.
   */
  overrides?: Record<string, unknown>;
  /**
   * Columns derived from the source row, computed before the copy is written.
   *
   * Slide decks need this: the row stores the storage keys of its rendered
   * slides, and the copying class must own its own files rather than share the
   * source's. Only reachable once the source is known, and it has to be settled
   * before the insert, so neither overrides nor afterCopy can do it.
   *
   * Throwing here abandons the copy and the caller generates instead.
   */
  transform?: (source: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Child rows or side effects, once the parent copy exists.
   *
   * A flashcard deck without its cards is an empty deck — worse than no deck,
   * because the generator will then skip the week as already done. Throwing
   * from here rolls the copy back.
   */
  afterCopy?: (copy: { id: string }, sourceId: string) => Promise<void>;
};

export type ReuseResult =
  | { copied: true; id: string; sourceId: string }
  | { copied: false; reason: string };

/** The lineage columns decideReuse needs, for any of the four tables. */
const CANDIDATE_COLUMNS =
  'id, curriculum_release_id, curriculum_week_number, lesson_plan_id, metadata, created_at';

/**
 * Tables where one master body is mirrored to every class that adopted it.
 *
 * lessons and assignments hold their whole body in their own row, so a
 * correction to the master can be pushed down by the triggers in
 * 20260929000044.
 *
 * flashcard_decks and lesson_materials deliberately do not. A deck's content is
 * its child cards, and a slide deck's content is storage objects each class now
 * owns its own copies of — propagating either means rewriting rows and files
 * this table cannot see, which is a different and much larger change than
 * updating a column. They stay independent copies, and that is a real limit,
 * not an oversight.
 */
const MIRRORED_TABLES: ReuseTable[] = ['lessons', 'assignments'];

/**
 * Columns buildCopy writes that a given table does not have.
 *
 * buildCopy clears the lock on every copy, which is right — a copy must never
 * arrive pre-frozen — but only lessons and assignments have lock columns to
 * clear. Writing them to the other two makes Postgres reject the whole insert
 * with "column does not exist", and because reuseWeekContent treats a failed
 * copy as "generate instead", that failure was invisible: decks and slides
 * quietly went on paying the AI while appearing to be wired for reuse.
 *
 * Slides and decks are frozen through the lesson they belong to, which
 * 20260929000044 already refuses to rewrite while it is locked, so nothing is
 * lost by their not carrying a lock of their own.
 */
const UNSUPPORTED_COLUMNS: Partial<Record<ReuseTable, readonly string[]>> = {
  flashcard_decks: ['content_locked_at', 'content_locked_by'],
  lesson_materials: ['content_locked_at', 'content_locked_by'],
};

function withoutUnsupported(table: ReuseTable, row: Record<string, unknown>) {
  const drop = UNSUPPORTED_COLUMNS[table];
  if (!drop?.length) return row;
  const cleaned = { ...row };
  for (const column of drop) delete cleaned[column];
  return cleaned;
}

/**
 * The master a new mirror should point at.
 *
 * Points at the source's own master when the source is itself a mirror, so
 * chains flatten to one generation. decideReuse prefers the oldest source and
 * so rarely builds them, but a chain would mean a correction reaching the first
 * copy and stopping there.
 */
function masterIdFor(table: ReuseTable, source: Record<string, unknown>, sourceId: string) {
  if (!MIRRORED_TABLES.includes(table)) return {};
  const existing = source.shared_master_id;
  return { shared_master_id: typeof existing === 'string' && existing ? existing : sourceId };
}

/**
 * Enough candidates to find an uncustomised one, few enough to stay cheap.
 *
 * decideReuse discards rows a teacher has edited. Reading only the oldest row
 * would mean one school customising the first copy stops every later class from
 * reusing anything at all.
 */
const CANDIDATE_LIMIT = 20;

export async function reuseWeekContent(input: ReuseInput): Promise<ReuseResult> {
  const { db, table, releaseId, week, targetPlanId, classId } = input;

  if (!releaseId) return { copied: false, reason: 'no_release' };
  if (!week || !Number.isFinite(Number(week))) return { copied: false, reason: 'no_week' };

  try {
    let query = db
      .from(table)
      .select(CANDIDATE_COLUMNS)
      .eq('curriculum_release_id', releaseId)
      .eq('curriculum_week_number', week)
      .neq('lesson_plan_id', targetPlanId);

    // Narrowing happens before ordering and limiting, not after. Applied last,
    // these ran against a builder that had already been limited — so the twenty
    // rows were chosen first and filtered second, and a project could be picked
    // as the source for homework whenever the week held both.
    for (const [column, value] of Object.entries(input.match ?? {})) {
      query = query.eq(column, value);
    }

    const { data: candidates, error: findError } = await query
      .order('created_at', { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (findError) return { copied: false, reason: `lookup_failed:${findError.message}` };

    const decision = decideReuse(candidates as ExistingContent[] | null, {
      releaseId,
      week,
      targetPlanId,
    });
    if (decision.action === 'generate') return { copied: false, reason: decision.reason };

    const { data: source, error: readError } = await db
      .from(table)
      .select('*')
      .eq('id', decision.sourceId)
      .maybeSingle();
    if (readError || !source) return { copied: false, reason: 'source_unreadable' };

    let derived: Record<string, unknown> = {};
    if (input.transform) {
      try {
        derived = await input.transform(source as Record<string, unknown>);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'transform_failed';
        return { copied: false, reason: `transform_failed:${detail}` };
      }
    }

    const row = {
      ...withoutUnsupported(
        table,
        buildCopy(source as Record<string, unknown>, {
          planId: targetPlanId,
          classId,
          sourceId: decision.sourceId,
        })
      ),
      // Identity beats anything carried from the source; the caller's own
      // overrides beat everything, since they describe this specific week.
      ...identityFor(table, input.scope),
      ...masterIdFor(table, source as Record<string, unknown>, decision.sourceId),
      ...derived,
      ...(input.overrides ?? {}),
    };

    const { data: inserted, error: writeError } = await db
      .from(table)
      .insert(row)
      .select('id')
      .maybeSingle();

    // The uniqueness indexes are the real duplicate guard, and a conflict here
    // means another run already placed this week. That is a success for the
    // caller — the content exists — but not a copy this call made.
    if (writeError) return { copied: false, reason: `insert_failed:${writeError.message}` };
    if (!inserted?.id) return { copied: false, reason: 'insert_returned_nothing' };

    if (input.afterCopy) {
      try {
        await input.afterCopy(inserted as { id: string }, decision.sourceId);
      } catch (error) {
        // A half-copied package would be counted as done and never regenerated,
        // so the parent row is removed and the caller generates instead.
        await db.from(table).delete().eq('id', inserted.id);
        const detail = error instanceof Error ? error.message : 'children_failed';
        return { copied: false, reason: `children_failed:${detail}` };
      }
    }

    return { copied: true, id: inserted.id, sourceId: decision.sourceId };
  } catch (error) {
    // Reuse is an optimisation. It may never be the reason a week fails.
    const detail = error instanceof Error ? error.message : 'unknown';
    return { copied: false, reason: `reuse_threw:${detail}` };
  }
}
