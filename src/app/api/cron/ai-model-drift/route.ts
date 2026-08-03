/**
 * GET|POST /api/cron/ai-model-drift
 *
 * Watches the free AI tier for model retirements.
 *
 * OpenRouter retires model ids without notice. When that happened here it was
 * invisible: every :free id in the codebase had been withdrawn, so the queue
 * 404'd its way down to a paid model on every single generation and simply
 * billed for it. Nothing failed, so nothing was reported.
 *
 * resolveModelQueue already heals each request by asking the catalogue, so this
 * job does not fix generation — it reports. It names the ids the source still
 * references that no longer exist, the free models newly available, and whether
 * the hardcoded fallback list has itself gone stale.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from "next/server";
import { runMonitoredCron } from "@/lib/operations/cron-monitor";
import { cronInterval } from "@/lib/operations/cron-registry";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";
import { detectFreeModelDrift } from "@/lib/ai/openrouter";
import { writeStoredFreeModels } from "@/lib/ai/model-catalogue-store";
import { referencedOpenRouterModels } from "@/lib/ai/referenced-models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return runMonitoredCron('ai-model-drift', cronInterval('ai-model-drift'), () =>
    handle(req)
  );
}
export async function POST(req: NextRequest) {
  return runMonitoredCron('ai-model-drift', cronInterval('ai-model-drift'), () =>
    handle(req)
  );
}

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const drift = await detectFreeModelDrift(referencedOpenRouterModels());

  if (!drift.catalogueReachable) {
    // Not a healthy result and not a failure either: nothing was learned.
    console.warn("[ai-model-drift] OpenRouter catalogue unreachable — skipped");
    return NextResponse.json({
      ok: true,
      skipped: "catalogue unreachable",
      checkedAt: drift.checkedAt,
    });
  }

  // Record the live list as the new safety net. This is the automatic part:
  // the fallback used when OpenRouter is unreachable is refreshed every day, so
  // it can never decay into the nine dead ids the constant had accumulated.
  const recorded = await writeStoredFreeModels(drift.live);
  if (!recorded) {
    console.warn(
      "[ai-model-drift] could not record the live model list — the fallback stays as it was"
    );
  }

  if (drift.retired.length) {
    console.warn(
      `[ai-model-drift] ${drift.retired.length} referenced free model(s) retired: ${drift.retired.join(", ")}. ` +
        `Generation still works — the live catalogue is used at request time — but these ids are dead weight.`
    );
  }
  if (drift.staleFallback.length) {
    console.warn(
      `[ai-model-drift] FREE_FALLBACK_MODELS contains ${drift.staleFallback.length} dead id(s): ` +
        `${drift.staleFallback.join(", ")}. That list is the safety net for when the catalogue is ` +
        `unreachable, so it must not rot. Replace from: ${drift.live.slice(0, 4).join(", ")}`
    );
  }

  return NextResponse.json({
    ok: true,
    checkedAt: drift.checkedAt,
    freeModelsLive: drift.live.length,
    retired: drift.retired,
    staleFallback: drift.staleFallback,
    newlyAvailable: drift.added,
    // The strongest free models on offer, for whoever reads this.
    suggestedFallback: drift.live.slice(0, 4),
    fallbackRecorded: recorded,
    healthy: drift.retired.length === 0 && drift.staleFallback.length === 0,
  });
}
