/**
 * How the hourly content sweep decides what to do.
 *
 * Windowing, skip, copy-vs-AI batching and "is this week actually done" used to
 * live as comments around the cron loop. They drifted: a title-only lesson
 * counted as prepared, later weeks never entered the window, and a class that
 * could copy still paid for one slow AI meeting while the 50-second budget
 * idled.
 *
 * Everything here is pure. The cron loads rows, this file says what they mean.
 */
import { hasCopyableSource, type ExistingContent } from "@/lib/academic/content-reuse";
import {
  listPlanMeetings,
  nextMeetingsToGenerate,
  planMeetingKey,
  type PlanMeeting,
} from "@/lib/academic/auto-generate-settings";
import { canonicalMeetingSession } from "@/lib/academic/session-identity";
import { expandPlanWeeksForMeetings } from "@/lib/academic/school-programme-standing";
import {
  generatedLessonIsUsable,
  type WeekLinkedAsset,
} from "@/lib/academic/week-package";

export type GenerationSkipCode =
  | "waiting_for_module"
  | "host_calendar"
  | "all_prepared";

/**
 * One AI meeting per plan per hour so the model stays on one class context.
 * Copies are inserts — drain several in the same run when a sibling already
 * wrote a usable package for this meeting.
 */
export function sweepMeetingCap(input: {
  configuredCap: number;
  canCopy: boolean;
}): number {
  if (!input.canCopy) return 1;
  const configured = Number(input.configuredCap);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(10, Math.max(configured, 4));
  }
  return 6;
}

export function describeGenerationSkip(input: {
  code: GenerationSkipCode;
  termHasStarted: boolean;
}): string {
  if (input.code === "waiting_for_module") {
    return "This module's weeks are not due yet — the calendar has not reached them.";
  }
  if (input.code === "host_calendar") {
    return "Host school is on a test, exam or break week — Rillcod will wait";
  }
  if (!input.termHasStarted) {
    return "Every week on this published plan already has a usable package.";
  }
  return "Every due class meeting already has a usable package. Later weeks wait until they are due.";
}

/** Waiting plans must not rotate to the front and spend the hourly slots. */
export function shouldStampSweepRun(
  code: GenerationSkipCode | "worked",
): boolean {
  return code === "all_prepared" || code === "worked";
}

/** Lets later classes in the same hour copy a week this run just wrote. */
export function meetingSeedKey(
  releaseId: string | null | undefined,
  week: number,
  session?: number | null,
): string | null {
  if (!releaseId) return null;
  return `${releaseId}:${week}:s${canonicalMeetingSession(session)}`;
}

export type SweepOrderPlan = {
  id: string;
  releaseId: string | null;
  lastRunAt: number;
  calendarReady: boolean;
  /** An already-started package has a genuine gap and should finish first. */
  repairReady?: boolean;
};

/**
 * Put one curriculum's classes together so the first pays for AI and the rest
 * copy in the same hour. Calendar-blocked plans go last so they do not fill
 * the 12-plan budget.
 */
export function orderPlansForSweep<T extends SweepOrderPlan>(plans: T[]): T[] {
  const ready = plans.filter((plan) => plan.calendarReady);
  const blocked = plans.filter((plan) => !plan.calendarReady);
  const groups = new Map<string, T[]>();
  for (const plan of ready) {
    const key = plan.releaseId || `solo:${plan.id}`;
    const list = groups.get(key) ?? [];
    list.push(plan);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        Number(Boolean(b.repairReady)) - Number(Boolean(a.repairReady)) ||
        a.lastRunAt - b.lastRunAt ||
        a.id.localeCompare(b.id),
    );
  }
  const grouped = [...groups.values()].sort(
    (a, b) =>
      Number(b.some((plan) => plan.repairReady)) -
        Number(a.some((plan) => plan.repairReady)) ||
      a[0].lastRunAt - b[0].lastRunAt || a[0].id.localeCompare(b[0].id),
  );
  blocked.sort((a, b) => a.lastRunAt - b.lastRunAt || a.id.localeCompare(b.id));
  return [...grouped.flat(), ...blocked];
}

/**
 * The meetings the teacher actually sees — Class 2 is not skipped just because
 * the stored plan still has one row per calendar week.
 */
export function planMeetingsForSweep(input: {
  planWeeks: Array<Record<string, unknown>>;
  sessionsPerWeek: number;
}): PlanMeeting[] {
  return listPlanMeetings(
    expandPlanWeeksForMeetings(input.planWeeks, input.sessionsPerWeek),
  );
}

/** Titles this class already taught earlier the same calendar week. */
export function titlesAlreadyTaughtThisWeek(input: {
  week: number;
  session: number;
  lessons:
    | Array<{
        curriculum_week_number?: unknown;
        session_number?: unknown;
        title?: unknown;
        description?: unknown;
      }>
    | null
    | undefined;
}): string[] {
  const week = Number(input.week);
  const session = canonicalMeetingSession(input.session);
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const row of input.lessons ?? []) {
    if (Number(row.curriculum_week_number) !== week) continue;
    if (canonicalMeetingSession(row.session_number) === session) continue;
    if (!generatedLessonIsUsable(row as WeekLinkedAsset)) continue;
    const title = String(row.title || row.description || "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

export function meetingsInPlanWeek(
  meetings: PlanMeeting[],
  week: number,
): number {
  return meetings.filter((meeting) => meeting.week === week).length;
}

/** True when another class on this curriculum already wrote a copyable lesson. */
export function siblingLessonCanBeCopied(input: {
  releaseId: string | null | undefined;
  week: number;
  session: number;
  targetPlanId: string;
  candidates: ExistingContent[] | null | undefined;
}): boolean {
  return hasCopyableSource(input.candidates, {
    releaseId: input.releaseId,
    week: input.week,
    session: input.session,
    targetPlanId: input.targetPlanId,
  });
}

export function decideSweepTargets(input: {
  meetings: PlanMeeting[];
  eligibleWeeks: number[];
  completedKeys: Iterable<string>;
  configuredCap: number;
  canCopy: boolean;
  /** When set, only drain consecutive copyable meetings — never mix in an AI write. */
  copyableMeetingKeys?: Iterable<string>;
}): PlanMeeting[] {
  const incomplete = nextMeetingsToGenerate({
    meetings: input.meetings,
    eligibleWeeks: input.eligibleWeeks,
    completedKeys: input.completedKeys,
    maxMeetingsPerBatch: 10,
  });
  if (!incomplete.length) return [];

  const copyable = new Set(
    [...(input.copyableMeetingKeys ?? [])].map(String).filter(Boolean),
  );
  const firstKey = planMeetingKey(incomplete[0]);
  const firstIsCopy =
    copyable.has(firstKey) || (input.canCopy && copyable.size === 0);

  if (!firstIsCopy) return incomplete.slice(0, 1);

  const cap = sweepMeetingCap({
    configuredCap: input.configuredCap,
    canCopy: true,
  });
  const next: PlanMeeting[] = [];
  for (const meeting of incomplete) {
    const key = planMeetingKey(meeting);
    const ok = copyable.size ? copyable.has(key) : input.canCopy;
    if (!ok) break;
    next.push(meeting);
    if (next.length >= cap) break;
  }
  return next;
}

export function copyableMeetingKeysFromSources(input: {
  meetings: PlanMeeting[];
  releaseId: string | null | undefined;
  targetPlanId: string;
  siblings: ExistingContent[] | null | undefined;
  writtenThisRun: Iterable<string>;
}): string[] {
  const written = new Set(
    [...input.writtenThisRun].map(String).filter(Boolean),
  );
  const keys: string[] = [];
  for (const meeting of input.meetings) {
    const seed = meetingSeedKey(
      input.releaseId,
      meeting.week,
      meeting.session,
    );
    const fromRun = Boolean(seed && written.has(seed));
    const fromSibling = siblingLessonCanBeCopied({
      releaseId: input.releaseId,
      week: meeting.week,
      session: meeting.session,
      targetPlanId: input.targetPlanId,
      candidates: input.siblings,
    });
    if (fromRun || fromSibling) keys.push(planMeetingKey(meeting));
  }
  return keys;
}
