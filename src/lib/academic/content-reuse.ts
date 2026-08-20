/**
 * Copy a week that has already been generated instead of paying to generate it
 * again.
 *
 * 26 classes across 14 schools adopted the same curriculum release, so the same
 * Week 3 lesson is written 26 times by the AI. At 100 schools it approaches a
 * hundred. The duplicate rows cost nothing — 26 rows in a table is not a
 * problem. The 26 AI calls are the problem: minutes each, quota that
 * gemini-2.0-flash is already refusing with 429, and 8,000 calls at the scale
 * being planned against roughly 440 that would actually be needed.
 *
 * So this does not share a row between classes. Every class keeps its own copy,
 * exactly as today, which means nothing changes about who can see content, who
 * can edit it, or who can lock it — the three things that made the shared-row
 * design risky. The only change is that the second class to want a week copies
 * the first class's instead of asking the AI for it again.
 *
 * Falling through to generation is always safe. If no source is found, or a
 * source looks wrong, the caller generates as it does today.
 */

export type ExistingContent = {
  id: string;
  curriculum_release_id: string | null;
  curriculum_week_number: number | null;
  session_number?: number | null;
  lesson_plan_id: string | null;
  /** Content a teacher changed after generation. Never a source. */
  metadata?: Record<string, unknown> | null;
  status?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export type ReuseRequest = {
  releaseId: string | null | undefined;
  week: number | null | undefined;
  /** 1-based class meeting within the week; untagged school weeks are 1. */
  session?: number | null;
  /** The plan the copy will belong to. A plan never copies from itself. */
  targetPlanId: string;
};

export type ReuseDecision =
  | { action: 'generate'; reason: 'no_release' | 'no_week' | 'nothing_to_copy' }
  | { action: 'copy'; sourceId: string };

/**
 * Content a teacher has edited is not a master copy.
 *
 * The first class to generate a week becomes the source for the rest. If that
 * class then rewrites it for their own pupils, every later class would inherit
 * one school's local wording as though it were the curriculum. A customised row
 * is skipped and the next untouched one is used instead.
 */
export function isCustomised(row: ExistingContent | null | undefined): boolean {
  const meta = row?.metadata;
  if (!meta || typeof meta !== 'object') return false;
  return meta.is_customized === true || meta.customized_at != null;
}

/**
 * Whether a row may serve as the source for another class's copy.
 *
 * Deliberately strict. A bad copy is worse than a fresh generation: the class
 * pays nothing to generate, but a wrong copy is silently wrong for a term.
 */
export function canBeCopied(row: ExistingContent | null | undefined, req: ReuseRequest): boolean {
  if (!row || !req.releaseId || !req.week) return false;
  if (row.curriculum_release_id !== req.releaseId) return false;
  if (Number(row.curriculum_week_number) !== Number(req.week)) return false;
  if (Number(row.session_number ?? 1) !== Number(req.session ?? 1)) return false;

  // A plan copying from itself is a duplicate, not a reuse — and the uniqueness
  // index would reject it anyway.
  if (row.lesson_plan_id && row.lesson_plan_id === req.targetPlanId) return false;

  // Content with no plan was written directly by a teacher for one class. It is
  // that class's own material, not curriculum output, and must not spread.
  if (!row.lesson_plan_id) return false;

  if (isCustomised(row)) return false;

  return true;
}

/**
 * Decide whether this week can be copied, and from where.
 *
 * Prefers the oldest valid source. The first generation of a week is the one
 * most likely to have been reviewed, and picking consistently means every class
 * on a curriculum ends up with the same content rather than a scattering of
 * near-identical variants depending on who generated when.
 */
export function decideReuse(
  candidates: readonly ExistingContent[] | null | undefined,
  req: ReuseRequest,
): ReuseDecision {
  if (!req.releaseId) return { action: 'generate', reason: 'no_release' };
  if (!req.week || !Number.isFinite(Number(req.week))) return { action: 'generate', reason: 'no_week' };

  const usable = (candidates ?? [])
    .filter((row) => canBeCopied(row, req))
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

  const source = usable[0];
  return source ? { action: 'copy', sourceId: source.id } : { action: 'generate', reason: 'nothing_to_copy' };
}

/**
 * The row to write for the copying class.
 *
 * Identity belongs to the new class: its own id, its own plan, its own class.
 * Everything that makes the content what it is — title, body, slides, cards —
 * is carried across untouched.
 *
 * The copy is marked so it can be told apart later. Without that, a class that
 * received a copy and a class that generated one look identical, and there is
 * no way to find the classes that would benefit from a regenerated master.
 */
export function buildCopy<T extends Record<string, unknown>>(
  source: T,
  target: { planId: string; classId: string | null; sourceId: string },
): Record<string, unknown> {
  const {
    id: _id,
    created_at: _created,
    updated_at: _updated,
    content_locked_at: _locked,
    content_locked_by: _lockedBy,
    ...carried
  } = source as Record<string, unknown>;

  const meta = (carried.metadata && typeof carried.metadata === 'object' ? carried.metadata : {}) as Record<string, unknown>;

  return {
    ...carried,
    lesson_plan_id: target.planId,
    class_id: target.classId,
    // Never inherit a lock: the source class publishing its week to learners
    // must not arrive pre-frozen for a class that has not taught it yet.
    content_locked_at: null,
    content_locked_by: null,
    metadata: {
      ...meta,
      copied_from_content_id: target.sourceId,
      copied_at: new Date().toISOString(),
      // Explicitly not customised — this is curriculum output, and marking it
      // otherwise would stop it serving as a source for the next class.
      is_customized: false,
    },
  };
}
