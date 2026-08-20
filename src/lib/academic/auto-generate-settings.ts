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
import {
  planMeetingLookupKey,
  planRowMeetingSession,
} from "@/lib/academic/session-identity";

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
  'flashcards',
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
   * How many upcoming in-plan weeks to prep beyond the delivery week.
   * 0 = only the current delivery week (when it is on the plan).
   * 1 = current + next (so after week 1, week 2 starts flowing into approvals).
   */
  prep_ahead_weeks: number;
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
  prep_ahead_weeks: 1,
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
  // existing plan asks for lessons without them. A lesson week is incomplete
  // without slides and recall cards, so requesting lessons implies both.
  if (picked.has('lessons')) {
    picked.add('slides');
    picked.add('flashcards');
  }

  return WEEK_CONTENT_TYPES.filter((t) => picked.has(t));
}

/** Reads whatever is stored on the plan into a complete, trustworthy shape. */
export function parseAutoGenerateSettings(raw: unknown): AutoGenerateSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const batch = Number(source.maxWeeksPerBatch);
  const ahead = Number(source.prep_ahead_weeks);
  return {
    enabled: source.enabled === false ? false : true,
    types: normaliseTypes(source.types),
    maxWeeksPerBatch:
      Number.isFinite(batch) && batch > 0 ? Math.min(10, Math.floor(batch)) : 0,
    prep_ahead_weeks:
      Number.isFinite(ahead) && ahead >= 0
        ? Math.min(4, Math.floor(ahead))
        : DEFAULT_AUTO_GENERATE_SETTINGS.prep_ahead_weeks,
    // Anything other than an explicit true holds for approval. An absent flag
    // must never be read as permission to publish to learners.
    auto_publish: source.auto_publish === true,
    ...(typeof source.last_run_at === 'string'
      ? { last_run_at: source.last_run_at }
      : {}),
  };
}

/**
 * Which plan weeks the sweep / launch should prepare now.
 *
 * Never invents weeks outside the plan. Cron waits until delivery enters the
 * module window (no mid-cohort bleed). Launch may set allowEarlyPrep so a
 * module can be staged before its calendar week arrives.
 */
export function weeksToGenerateForPlan(input: {
  planWeekNumbers: number[];
  deliveryWeek: number;
  prepAheadWeeks?: number;
  maxWeeksPerBatch?: number;
  /** When true, prep the module's first week even if delivery is still earlier. */
  allowEarlyPrep?: boolean;
}): number[] {
  const plan = [...new Set(
    input.planWeekNumbers.filter((n) => Number.isFinite(n) && n > 0),
  )].sort((a, b) => a - b);
  if (!plan.length) return [];

  const delivery = Math.max(1, Math.floor(Number(input.deliveryWeek) || 1));
  const ahead = Math.max(0, Math.floor(Number(input.prepAheadWeeks) || 0));
  const batchCap = Number(input.maxWeeksPerBatch);
  const cap =
    Number.isFinite(batchCap) && batchCap > 0
      ? Math.min(10, Math.floor(batchCap))
      : Math.max(1, ahead + 1);

  let anchor: number | null = null;
  if (plan.includes(delivery)) {
    anchor = delivery;
  } else if (delivery < plan[0]) {
    anchor = input.allowEarlyPrep ? plan[0] : null;
  } else if (delivery > plan[plan.length - 1]) {
    return [];
  } else {
    // Between sparse plan weeks — wait rather than jump ahead.
    return [];
  }

  if (anchor == null) return [];

  const fromAnchor = plan.filter((w) => w >= anchor!);
  const withAhead = fromAnchor.slice(0, Math.max(1, ahead + 1));
  return withAhead.slice(0, cap);
}

/** One class meeting on the teaching plan (calendar week + class number). */
export type PlanMeeting = {
  week: number;
  session: number;
};

export function planMeetingKey(meeting: PlanMeeting): string {
  return planMeetingLookupKey(meeting.week, meeting.session);
}

/** Flatten plan rows into ordered class meetings. Untagged rows = Class 1. */
export function listPlanMeetings(
  planWeeks: Array<Record<string, unknown>>,
): PlanMeeting[] {
  const out: PlanMeeting[] = [];
  for (const row of planWeeks) {
    const week = Number(row.week ?? row.week_number ?? 0);
    if (!Number.isFinite(week) || week < 1) continue;
    const session = planRowMeetingSession(row) || 1;
    out.push({ week: Math.floor(week), session });
  }
  out.sort((a, b) => a.week - b.week || a.session - b.session);
  // De-dupe identical meetings
  const seen = new Set<string>();
  return out.filter((m) => {
    const key = planMeetingKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Next class meetings to prepare — one meeting at a time so AI stays in context.
 * Skips meetings that already have a lesson pack; stays inside eligible weeks.
 */
export function nextMeetingsToGenerate(input: {
  meetings: PlanMeeting[];
  /** Keys like "1:s1" for meetings that already have content. */
  completedKeys?: Iterable<string>;
  eligibleWeeks: number[];
  maxMeetingsPerBatch?: number;
}): PlanMeeting[] {
  const eligible = new Set(
    input.eligibleWeeks.filter((n) => Number.isFinite(n) && n > 0),
  );
  if (!eligible.size) return [];
  const done = new Set(
    [...(input.completedKeys ?? [])].map(String).filter(Boolean),
  );
  const cap = Math.max(
    1,
    Math.min(10, Math.floor(Number(input.maxMeetingsPerBatch) || 1)),
  );
  const next: PlanMeeting[] = [];
  for (const meeting of input.meetings) {
    if (!eligible.has(meeting.week)) continue;
    const key = planMeetingKey(meeting);
    // Legacy single-meeting weeks may be stored without a session tag.
    const legacyKey = `${meeting.week}`;
    if (done.has(key) || (meeting.session === 1 && done.has(legacyKey))) {
      continue;
    }
    next.push(meeting);
    if (next.length >= cap) break;
  }
  return next;
}

export const WEEK_CONTENT_TYPE_LABELS: Record<WeekContentType, string> = {
  lessons: 'Lessons',
  slides: 'Slides',
  flashcards: 'Practice cards',
  assignments: 'Homework',
  projects: 'Projects',
};

/** One sentence a teacher can check at a glance. */
export function describeAutoGenerateSettings(s: AutoGenerateSettings): string {
  if (!s.enabled) return 'Automatic week prep is turned off for this plan.';
  const scope =
    s.maxWeeksPerBatch === 0
      ? 'the whole term'
      : s.maxWeeksPerBatch === 1
        ? 'one week at a time'
        : `${s.maxWeeksPerBatch} weeks at a time`;
  const ahead =
    s.prep_ahead_weeks > 0
      ? `, keeping ${s.prep_ahead_weeks} week${s.prep_ahead_weeks === 1 ? '' : 's'} ahead`
      : '';
  const typeList = s.types
    .map((t) => WEEK_CONTENT_TYPE_LABELS[t] ?? t)
    .join(', ');
  const release = s.auto_publish
    ? 'published straight to students'
    : 'held for your approval';
  return `Preparing ${typeList}, ${scope}${ahead}, ${release}.`;
}
