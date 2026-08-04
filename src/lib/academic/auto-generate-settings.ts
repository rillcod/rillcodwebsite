/**
 * One place that decides how a class generates its weeks.
 *
 * This shape was written out by hand in four places — the cron that runs the
 * sweep, the readiness automation that seeds it, the plan page that edits it,
 * and the generator that consumes it. They had already drifted: the page
 * offered three content types while the pipeline ran four, and it filtered
 * `slides` out of anything it saved. A rule written in four places is enforced
 * in none.
 *
 * Everything here is pure so the plan page can import it without dragging the
 * generation stack (Gemini, OpenRouter, R2) into the browser bundle.
 */

/**
 * Listed in dependency order, and run in it.
 *
 * Slides are rendered from the saved lesson, so they must follow it — running
 * them first produces "generate the lesson before creating its slides" every
 * time.
 */
export const WEEK_CONTENT_TYPES = [
  'lessons',
  'slides',
  'assignments',
  'projects',
] as const;
export type WeekContentType = (typeof WEEK_CONTENT_TYPES)[number];

export type AutoGenerateSettings = {
  enabled: boolean;
  types: WeekContentType[];
  /** 0 means the whole term; otherwise the cap per sweep. */
  maxWeeksPerBatch: number;
  /**
   * Publish generated content straight to students.
   *
   * False by default, and deliberately: nobody has read it yet. A prepared week
   * waits on the approvals screen until a teacher releases it.
   */
  auto_publish: boolean;
  /** Stamped by the sweep so plans rotate rather than one plan hogging the run. */
  last_run_at?: string;
};

export const DEFAULT_AUTO_GENERATE_SETTINGS: AutoGenerateSettings = {
  enabled: true,
  types: [...WEEK_CONTENT_TYPES],
  maxWeeksPerBatch: 1,
  auto_publish: false,
};

/**
 * The content types to generate, in dependency order.
 *
 * Anything unrecognised is dropped, and an empty selection falls back to
 * everything rather than silently generating nothing.
 */
export function normaliseTypes(raw: unknown): WeekContentType[] {
  const list = Array.isArray(raw) ? raw : WEEK_CONTENT_TYPES;
  const picked = new Set(
    list.filter((t): t is WeekContentType =>
      WEEK_CONTENT_TYPES.includes(t as WeekContentType),
    ),
  );
  if (!picked.size) return [...WEEK_CONTENT_TYPES];

  // Slides came into the pipeline after these settings were written, so every
  // existing plan asks for lessons without them. A lesson without its slides is
  // an incomplete week, and slides are derived from the lesson rather than
  // being a separate decision — so wanting the lesson is taken as wanting them.
  if (picked.has('lessons')) picked.add('slides');

  return WEEK_CONTENT_TYPES.filter((t) => picked.has(t));
}

/** Reads whatever is stored on the plan into a complete, trustworthy shape. */
export function parseAutoGenerateSettings(raw: unknown): AutoGenerateSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const batch = Number(source.maxWeeksPerBatch);
  return {
    enabled: source.enabled === true,
    types: normaliseTypes(source.types),
    maxWeeksPerBatch:
      Number.isFinite(batch) && batch > 0 ? Math.min(10, Math.floor(batch)) : 0,
    // Anything other than an explicit true holds for approval. An absent flag
    // must never be read as permission to publish to learners.
    auto_publish: source.auto_publish === true,
    ...(typeof source.last_run_at === 'string'
      ? { last_run_at: source.last_run_at }
      : {}),
  };
}

/** One sentence a teacher can check at a glance. */
export function describeAutoGenerateSettings(s: AutoGenerateSettings): string {
  if (!s.enabled) return 'Auto-generation is currently disabled for this plan.';
  const scope =
    s.maxWeeksPerBatch === 0 ? 'Full Term' : `${s.maxWeeksPerBatch}-week`;
  const release = s.auto_publish
    ? 'published straight to students'
    : 'held for your approval';
  return `Currently auto-generating ${s.types.join(
    ', ',
  )} in ${scope} chunks, ${release}.`;
}
