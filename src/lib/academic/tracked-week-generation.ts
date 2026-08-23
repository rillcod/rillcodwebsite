import {
  generatePlanWeek,
  normaliseTypes,
  type WeekGenerationOutcome,
} from "./week-generation";

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
): Promise<string | null> {
  try {
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
      console.warn("[teaching-generation] could not start durable run", {
        code: error.code ?? null,
        planId: input.planId,
        week: input.week,
        session: input.session,
      });
      return null;
    }
    return String(data.id);
  } catch (error) {
    console.warn("[teaching-generation] run tracking unavailable", error);
    return null;
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
}): Promise<{ outcome: WeekGenerationOutcome; runId: string | null }> {
  const sessionRaw = Number(input.session);
  const session = Number.isFinite(sessionRaw) && sessionRaw > 0
    ? Math.floor(sessionRaw)
    : 1;
  const requestedTypes = normaliseTypes(input.types);
  const runId = await beginRun(input.db, {
    planId: input.planId,
    classId: input.classId,
    week: input.week,
    session,
    source: input.source,
    requestedTypes,
    actorId: input.actorId,
    retryOf: input.retryOf,
  });

  const outcome = await generatePlanWeek({
    planId: input.planId,
    week: input.week,
    session,
    types: requestedTypes,
    cronSecret: input.cronSecret,
    cookie: input.cookie,
    autoPublish: input.autoPublish,
  });
  await finishRun(input.db, runId, outcome);
  return { outcome, runId };
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
