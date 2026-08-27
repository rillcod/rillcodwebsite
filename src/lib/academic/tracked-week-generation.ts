import {
  generatePlanWeek,
  normaliseTypes,
  type WeekGenerationOutcome,
} from "./week-generation";
import { resolveGenerationRepairTypes } from "./generation-repair";

export type TeachingGenerationSource = "teacher" | "cron" | "bootstrap" | "repair";
export type TeachingGenerationStatus =
  | "succeeded"
  | "partial"
  | "failed";

export type TeachingGenerationRunSummary = {
  available: boolean;
  state: "idle" | "running" | "healthy" | "attention";
  message: string;
  week: number | null;
  session: number | null;
  failedTypes: string[];
  lastAttemptAt: string | null;
};

type GenerationRunRow = {
  status?: string | null;
  curriculum_week_number?: number | null;
  session_number?: number | null;
  failed_types?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
};

const CONTENT_LABELS: Record<string, string> = {
  lessons: "lesson",
  slides: "slides",
  flashcards: "flashcards",
  assignments: "assignment",
  projects: "project",
};

export function summarizeTeachingGenerationRuns(
  rows: readonly GenerationRunRow[] | null | undefined,
  available = true,
): TeachingGenerationRunSummary {
  if (!available) {
    return {
      available: false,
      state: "idle",
      message: "",
      week: null,
      session: null,
      failedTypes: [],
      lastAttemptAt: null,
    };
  }
  const latest = rows?.[0];
  if (!latest) {
    return {
      available: true,
      state: "idle",
      message: "No teaching package has been prepared yet.",
      week: null,
      session: null,
      failedTypes: [],
      lastAttemptAt: null,
    };
  }
  const failedTypes = Array.isArray(latest.failed_types)
    ? latest.failed_types.map(String).filter(Boolean)
    : [];
  const readable = failedTypes.map((type) => CONTENT_LABELS[type] ?? type).join(", ");
  const status = String(latest.status ?? "");
  const message =
    status === "running"
      ? "A teaching package is being prepared. Saved items will appear as they finish."
      : status === "succeeded"
        ? "The latest teaching package finished successfully."
        : status === "interrupted"
          ? "Preparation was interrupted. Retry it safely; completed items will be kept."
          : status === "partial"
            ? `Some content still needs attention${readable ? `: ${readable}` : ""}. Retry safely; completed items will be kept.`
            : "The latest teaching package did not finish. Retry it safely; completed items will be kept.";
  return {
    available: true,
    state:
      status === "running"
        ? "running"
        : status === "succeeded"
          ? "healthy"
          : "attention",
    message,
    week: Number(latest.curriculum_week_number) || null,
    session: Number(latest.session_number) || null,
    failedTypes,
    lastAttemptAt: latest.completed_at ?? latest.started_at ?? null,
  };
}

export function teachingGenerationStatus(
  outcome: WeekGenerationOutcome,
): TeachingGenerationStatus {
  if (outcome.failedTypes.length === 0) return "succeeded";
  return outcome.generated > 0 || outcome.skipped > 0 ? "partial" : "failed";
}

async function beginRun(
  db: any,
  input: {
    planId: string;
    classId?: string | null;
    week: number;
    session: number;
    source: TeachingGenerationSource;
    requestedTypes: string[];
    actorId?: string | null;
    retryOf?: string | null;
  },
): Promise<{
  runId: string | null;
  alreadyRunning: boolean;
  trackingAvailable: boolean;
}> {
  try {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 20 * 60_000).toISOString();
    // A browser may have disappeared while a request was running. Free only a
    // stale claim for this exact meeting before attempting a new one.
    await db
      .from("teaching_generation_runs")
      .update({
        status: "interrupted",
        error_summary: "Generation was interrupted before completion",
        completed_at: now.toISOString(),
        last_heartbeat_at: now.toISOString(),
      })
      .eq("lesson_plan_id", input.planId)
      .eq("curriculum_week_number", input.week)
      .eq("session_number", input.session)
      .eq("status", "running")
      .lt("last_heartbeat_at", staleCutoff);

    const { data, error } = await db
      .from("teaching_generation_runs")
      .insert({
        lesson_plan_id: input.planId,
        class_id: input.classId ?? null,
        curriculum_week_number: input.week,
        session_number: input.session,
        source: input.source,
        requested_types: input.requestedTypes,
        status: "running",
        started_by: input.actorId ?? null,
        retry_of: input.retryOf ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return {
          runId: null,
          alreadyRunning: true,
          trackingAvailable: true,
        };
      }
      console.warn("[teaching-generation] could not start durable run", {
        code: error.code ?? null,
        planId: input.planId,
        week: input.week,
        session: input.session,
      });
      return {
        runId: null,
        alreadyRunning: false,
        trackingAvailable: false,
      };
    }
    return {
      runId: String(data.id),
      alreadyRunning: false,
      trackingAvailable: true,
    };
  } catch (error) {
    console.warn("[teaching-generation] run tracking unavailable", error);
    return {
      runId: null,
      alreadyRunning: false,
      trackingAvailable: false,
    };
  }
}

async function finishRun(
  db: any,
  runId: string | null,
  outcome: WeekGenerationOutcome,
): Promise<void> {
  if (!runId) return;
  const failed = outcome.failedTypes;
  const errorSummary = failed.length
    ? `${failed.join(", ")} did not finish`
    : null;
  try {
    const { error } = await db
      .from("teaching_generation_runs")
      .update({
        status: teachingGenerationStatus(outcome),
        generated_count: outcome.generated,
        skipped_count: outcome.skipped,
        by_type: outcome.byType,
        failed_types: failed,
        error_summary: errorSummary,
        last_heartbeat_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (error) {
      console.warn("[teaching-generation] could not finish durable run", {
        code: error.code ?? null,
        runId,
      });
    }
  } catch (error) {
    console.warn("[teaching-generation] completion tracking unavailable", error);
  }
}

function failureIsRetryable(outcome: WeekGenerationOutcome, type: string): boolean {
  const result = outcome.byType[type];
  return Boolean(result && "error" in result && result.retryable === true);
}

function markRecovered(
  outcome: WeekGenerationOutcome,
  recoveredTypes: readonly string[],
): WeekGenerationOutcome {
  if (recoveredTypes.length === 0) return outcome;
  const recovered = new Set(recoveredTypes);
  const failedTypes = outcome.failedTypes.filter((type) => !recovered.has(type));
  const byType = { ...outcome.byType };
  for (const type of recovered) {
    byType[type] = { generated: 0, skipped: 1 };
  }
  return {
    ...outcome,
    skipped: outcome.skipped + recovered.size,
    byType,
    failedTypes,
    recoveredTypes: [...new Set([...(outcome.recoveredTypes ?? []), ...recovered])],
  };
}

function mergeRetryOutcome(
  first: WeekGenerationOutcome,
  retry: WeekGenerationOutcome,
  retryCandidates: readonly string[],
): WeekGenerationOutcome {
  const candidates = new Set(retryCandidates);
  const byType = { ...first.byType };
  for (const [type, result] of Object.entries(retry.byType)) {
    // A dependency may be included to make slides/cards valid. Do not replace
    // a successful first result with a later dependency failure.
    if (candidates.has(type) || !(type in byType)) byType[type] = result;
  }
  const failed = new Set(first.failedTypes);
  for (const type of retryCandidates) {
    if (retry.failedTypes.includes(type)) failed.add(type);
    else failed.delete(type);
  }
  return {
    ...first,
    generated: first.generated + retry.generated,
    skipped: first.skipped + retry.skipped,
    byType,
    failedTypes: [...failed],
    retriedTypes: [...new Set([...(first.retriedTypes ?? []), ...retryCandidates])],
  };
}

/**
 * Reconcile a partial run against durable content, then make at most one
 * transient-only retry for items the database confirms are still missing.
 * This is intentionally inside the existing run claim: it cannot create a
 * second concurrent paid job for the same teaching meeting.
 */
async function recoverIncompleteOutcome(input: {
  db: any;
  planId: string;
  week: number;
  session: number;
  outcome: WeekGenerationOutcome;
  cronSecret?: string;
  cookie?: string;
  autoPublish?: boolean;
}): Promise<WeekGenerationOutcome> {
  if (input.outcome.failedTypes.length === 0) return input.outcome;

  const failedTypes = [...input.outcome.failedTypes];
  const inventory = await resolveGenerationRepairTypes({
    db: input.db,
    planId: input.planId,
    week: input.week,
    session: input.session,
    requestedTypes: failedTypes,
  });
  if (!inventory) return input.outcome;

  const stillMissing = new Set(inventory.typesToRun);
  let outcome = markRecovered(
    input.outcome,
    failedTypes.filter((type) => !stillMissing.has(type)),
  );
  const retryCandidates = outcome.failedTypes.filter(
    (type) => stillMissing.has(type) && failureIsRetryable(outcome, type),
  );
  if (retryCandidates.length === 0) return outcome;

  // Ask the repair resolver for dependencies too (for example, a missing
  // lesson before retrying slides) while keeping the retry to one bounded pass.
  const retryTypes = inventory.typesToRun.filter(
    (type) => retryCandidates.includes(type) || type === "lessons",
  );
  const retry = await generatePlanWeek({
    planId: input.planId,
    week: input.week,
    session: input.session,
    types: retryTypes,
    cronSecret: input.cronSecret,
    cookie: input.cookie,
    autoPublish: input.autoPublish,
  });
  outcome = mergeRetryOutcome(outcome, retry, retryCandidates);

  // A generator can save successfully and lose its response. Trust the
  // database, not the transport, before declaring the retry unsuccessful.
  const finalInventory = await resolveGenerationRepairTypes({
    db: input.db,
    planId: input.planId,
    week: input.week,
    session: input.session,
    requestedTypes: retryCandidates,
  });
  if (!finalInventory) return outcome;
  const finallyMissing = new Set(finalInventory.typesToRun);
  const unresolvedAfterRetry = retryCandidates.filter((type) =>
    outcome.failedTypes.includes(type)
  );
  outcome = markRecovered(
    outcome,
    unresolvedAfterRetry.filter((type) => !finallyMissing.has(type)),
  );
  for (const type of retryCandidates) {
    if (!finallyMissing.has(type)) continue;
    outcome.byType[type] = {
      error: "This item is still missing after a safe retry. Completed work was kept.",
      retryable: false,
    };
    if (!outcome.failedTypes.includes(type)) outcome.failedTypes.push(type);
  }
  return outcome;
}

/**
 * Run the existing idempotent generators with durable, best-effort evidence.
 * Tracking failure never blocks teaching generation during a rolling deploy.
 */
export async function generateTrackedPlanWeek(input: {
  db: any;
  planId: string;
  classId?: string | null;
  week: number;
  session?: number | null;
  types?: unknown;
  cronSecret?: string;
  cookie?: string;
  autoPublish?: boolean;
  source: TeachingGenerationSource;
  actorId?: string | null;
  retryOf?: string | null;
}): Promise<{
  outcome: WeekGenerationOutcome;
  runId: string | null;
  alreadyRunning: boolean;
  effectiveTypes: string[];
}> {
  const sessionRaw = Number(input.session);
  const session = Number.isFinite(sessionRaw) && sessionRaw > 0
    ? Math.floor(sessionRaw)
    : 1;
  const requestedTypes = normaliseTypes(input.types);
  const claim = await beginRun(input.db, {
    planId: input.planId,
    classId: input.classId,
    week: input.week,
    session,
    source: input.source,
    requestedTypes,
    actorId: input.actorId,
    retryOf: input.retryOf,
  });

  if (claim.alreadyRunning) {
    return {
      outcome: {
        week: input.week,
        generated: 0,
        skipped: 0,
        byType: {},
        failedTypes: [],
      },
      runId: null,
      alreadyRunning: true,
      effectiveTypes: [],
    };
  }

  const repair = await resolveGenerationRepairTypes({
    db: input.db,
    planId: input.planId,
    week: input.week,
    session,
    requestedTypes,
  });
  const effectiveTypes = repair?.typesToRun ?? requestedTypes;

  if (effectiveTypes.length === 0) {
    const outcome: WeekGenerationOutcome = {
      week: input.week,
      generated: 0,
      skipped: requestedTypes.length,
      byType: Object.fromEntries(
        requestedTypes.map((type) => [type, { generated: 0, skipped: 1 }])
      ),
      failedTypes: [],
    };
    await finishRun(input.db, claim.runId, outcome);
    return {
      outcome,
      runId: claim.runId,
      alreadyRunning: false,
      effectiveTypes,
    };
  }

  let outcome = await generatePlanWeek({
    planId: input.planId,
    week: input.week,
    session,
    types: effectiveTypes,
    cronSecret: input.cronSecret,
    cookie: input.cookie,
    autoPublish: input.autoPublish,
  });
  outcome = await recoverIncompleteOutcome({
    db: input.db,
    planId: input.planId,
    week: input.week,
    session,
    outcome,
    cronSecret: input.cronSecret,
    cookie: input.cookie,
    autoPublish: input.autoPublish,
  });
  await finishRun(input.db, claim.runId, outcome);
  return {
    outcome,
    runId: claim.runId,
    alreadyRunning: false,
    effectiveTypes,
  };
}

/** Mark abandoned running rows so operations never silently show them forever. */
export async function markInterruptedTeachingGenerationRuns(
  db: any,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 20 * 60_000).toISOString();
  try {
    const { data, error } = await db
      .from("teaching_generation_runs")
      .update({
        status: "interrupted",
        error_summary: "Generation was interrupted before completion",
        completed_at: now.toISOString(),
        last_heartbeat_at: now.toISOString(),
      })
      .eq("status", "running")
      .lt("last_heartbeat_at", cutoff)
      .select("id");
    if (error) return 0;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}
