import type { WeekContentType } from "./auto-generate-settings";

export type WeekGenerationClientResult = {
  success: boolean;
  generated: number;
  skipped: number;
  byType: Record<
    string,
    { generated?: number; skipped?: number; error?: string }
  >;
  failedTypes: string[];
  retriedTypes: string[];
  recoveredTypes: string[];
  alreadyRunning: boolean;
  connectionRecovered: boolean;
  complete?: boolean;
  status?: string;
  auto_publish?: boolean;
  error?: string;
};

export class WeekGenerationRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly connectionInterrupted = false
  ) {
    super(message);
    this.name = "WeekGenerationRequestError";
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalizeResult(
  value: Record<string, unknown>,
  connectionRecovered = false
): WeekGenerationClientResult {
  const status = typeof value.status === "string" ? value.status : undefined;
  const failedTypes = Array.isArray(value.failedTypes)
    ? value.failedTypes.map(String)
    : [];
  const retriedTypes = Array.isArray(value.retriedTypes)
    ? value.retriedTypes.map(String)
    : [];
  const recoveredTypes = Array.isArray(value.recoveredTypes)
    ? value.recoveredTypes.map(String)
    : [];
  return {
    success:
      value.success === false
        ? false
        : status !== "failed" && status !== "interrupted",
    generated: Number(value.generated) || 0,
    skipped: Number(value.skipped) || 0,
    byType:
      value.byType && typeof value.byType === "object"
        ? (value.byType as WeekGenerationClientResult["byType"])
        : {},
    failedTypes,
    retriedTypes,
    recoveredTypes,
    alreadyRunning:
      value.alreadyRunning === true || status === "running",
    connectionRecovered,
    complete: value.complete === true,
    status,
    auto_publish: value.auto_publish === true,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

async function readGenerationStatus(input: {
  fetcher: FetchLike;
  planId: string;
  week: number;
  session: number;
  initiatedAt: string;
  waitFor?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  progressOnly?: boolean;
}): Promise<WeekGenerationClientResult | null> {
  const attempts = Math.max(1, input.attempts ?? 3);
  const pause = input.waitFor ?? wait;
  const params = new URLSearchParams({
    week: String(input.week),
    session: String(input.session),
    after: input.initiatedAt,
  });
  if (input.progressOnly) params.set("progress", "1");

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await pause(600 * attempt);
    try {
      const response = await input.fetcher(
        `/api/lesson-plans/${input.planId}/generate-week?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) continue;
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const status = String(body.status ?? "idle");
      // The POST may have disconnected before the server claimed its run. Give
      // it two short chances to appear instead of starting another paid call.
      if (status === "idle" && body.complete !== true) continue;
      return normalizeResult(body, true);
    } catch {
      // The recovery read is deliberately best-effort. The caller receives one
      // stable, human message if the connection itself is still unavailable.
    }
  }
  return null;
}

/**
 * Start one tracked teaching meeting and recover its durable state if the long
 * browser request disconnects. Recovery is read-only: it never starts a second
 * AI run, so teacher work and generation quota remain safe.
 */
export async function requestTrackedWeekGeneration(input: {
  planId: string;
  week: number;
  session?: number | null;
  types?: readonly WeekContentType[];
  autoPublish?: boolean;
  fetcher?: FetchLike;
  waitFor?: (milliseconds: number) => Promise<void>;
  recoveryAttempts?: number;
  /** Receives real, saved per-item progress while the generation request runs. */
  onProgress?: (result: WeekGenerationClientResult) => void;
  progressIntervalMs?: number;
}): Promise<WeekGenerationClientResult> {
  const fetcher = input.fetcher ?? fetch;
  const sessionRaw = Number(input.session);
  const session = Number.isFinite(sessionRaw) && sessionRaw > 0
    ? Math.floor(sessionRaw)
    : 1;
  const initiatedAt = new Date().toISOString();
  let requestFinished = false;
  const progressMonitor = input.onProgress
    ? (async () => {
        const pause = input.waitFor ?? wait;
        while (!requestFinished) {
          await pause(Math.max(1_500, input.progressIntervalMs ?? 2_500));
          if (requestFinished) break;
          const progress = await readGenerationStatus({
            fetcher,
            planId: input.planId,
            week: input.week,
            session,
            initiatedAt,
            waitFor: input.waitFor,
            attempts: 1,
            progressOnly: true,
          });
          if (progress) {
            try {
              input.onProgress?.(progress);
            } catch {
              // Rendering progress must never interrupt paid generation work.
            }
          }
        }
      })()
    : null;

  try {
    const response = await fetcher(
      `/api/lesson-plans/${input.planId}/generate-week`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: input.week,
          session,
          ...(input.types ? { types: input.types } : {}),
          ...(input.autoPublish === true ? { auto_publish: true } : {}),
        }),
      }
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new WeekGenerationRequestError(
        typeof body.error === "string"
          ? body.error
          : "This teaching package could not be prepared.",
        response.status
      );
    }
    return normalizeResult(body);
  } catch (error) {
    // A real API refusal is authoritative. Only transport failures need the
    // durable-status handshake.
    if (error instanceof WeekGenerationRequestError) throw error;

    const recovered = await readGenerationStatus({
      fetcher,
      planId: input.planId,
      week: input.week,
      session,
      initiatedAt,
      waitFor: input.waitFor,
      attempts: input.recoveryAttempts,
    });
    if (recovered) return recovered;

    throw new WeekGenerationRequestError(
      "The connection was interrupted. Preparation may still be running, and saved items are safe. Refresh this week before retrying.",
      undefined,
      true
    );
  } finally {
    requestFinished = true;
    // Do not delay the final result by up to one polling interval. The monitor
    // observes requestFinished and exits before issuing another status read.
    void progressMonitor;
  }
}
