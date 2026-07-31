import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { consumeSSEUntilDone } from '@/lib/lesson-plans/ai-fetch';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — each plan generates up to N weeks

type AutoGenSettings = {
  enabled?: boolean;
  types?: string[];
  maxWeeksPerBatch?: number;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function currentTermWeek(termStart: string | null): number {
  if (!termStart) return 1;
  const elapsed = Date.now() - new Date(termStart).getTime();
  return Math.max(1, Math.ceil(elapsed / (7 * 24 * 60 * 60 * 1000)));
}

// GET or POST /api/cron/auto-generate-content
// Finds all published plans with auto_generate_settings.enabled = true
// and generates the next N weeks of content for each plan.
// Chained once a day from academic-readiness, so the health interval is daily. A shorter one
// marks this job Late for most of every day.
export async function GET(req: NextRequest) {
  return runMonitoredCron('auto-generate-content', cronInterval('auto-generate-content'), () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('auto-generate-content', cronInterval('auto-generate-content'), () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  const cronSecret = extractCronSecret(req);
  if (!isValidCronSecret(cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminClient();
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { data: plans, error } = await db
    .from('lesson_plans')
    .select('id, term_start, metadata')
    .eq('status', 'published')
    .not('metadata', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enabledPlans = (plans ?? []).filter((p) => {
    const meta = p.metadata as Record<string, unknown> | null;
    const ags = meta?.auto_generate_settings as AutoGenSettings | undefined;
    return ags?.enabled === true;
  });

  // Hobby-safe batching (no extra cron jobs): each run handles only the few
  // least-recently-generated plans and stops before the serverless cap, so
  // successive scheduled runs rotate through every plan without ever timing out.
  // maxDuration=300 above is honoured on Pro; on Hobby the 50s budget guards it.
  const MAX_PLANS_PER_RUN = Number(process.env.AUTO_GEN_PLANS_PER_RUN) || 3;
  const DEADLINE = Date.now() + 50_000; // ~10s headroom under the 60s Hobby cap
  const lastRunAt = (p: any): number => {
    const t = (p.metadata?.auto_generate_settings as AutoGenSettings & { last_run_at?: string })?.last_run_at;
    const ms = t ? new Date(t).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  };
  enabledPlans.sort((a, b) => lastRunAt(a) - lastRunAt(b)); // oldest first
  const batch = enabledPlans.slice(0, MAX_PLANS_PER_RUN);

  const results: Array<{
    planId: string;
    status: 'ok' | 'error';
    currentWeek?: number;
    generated?: number;
    skipped?: number;
    error?: string;
  }> = [];

  let stoppedEarly = false;
  for (const plan of batch) {
    if (Date.now() > DEADLINE) { stoppedEarly = true; break; }
    try {
      const meta = plan.metadata as Record<string, unknown>;
      const ags = meta.auto_generate_settings as AutoGenSettings;
      const types = (ags.types ?? ['lessons', 'assignments']).filter((t) =>
        ['lessons', 'assignments', 'projects'].includes(t),
      );
      const maxWeeksPerBatch = typeof ags.maxWeeksPerBatch === 'number' && ags.maxWeeksPerBatch > 0
        ? ags.maxWeeksPerBatch
        : 1;
      const currentWeek = currentTermWeek(plan.term_start ?? null);

      let totalGenerated = 0;
      let totalSkipped = 0;

      for (const type of types) {
        const res = await fetch(
          `${appBaseUrl}/api/lesson-plans/${plan.id}/generate-${type}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': cronSecret,
            },
            body: JSON.stringify({ max_weeks: maxWeeksPerBatch }),
          },
        );

        if (!res.ok) {
          console.warn(`Auto-gen ${type} failed for plan ${plan.id}: HTTP ${res.status}`);
          continue;
        }

        const { generated, skipped } = await consumeSSEUntilDone(res);
        totalGenerated += generated;
        totalSkipped += skipped;
      }

      // Stamp last_run_at so this plan sinks to the back of the rotation queue
      // and the next scheduled run picks up the other plans.
      await db.from('lesson_plans').update({
        metadata: {
          ...meta,
          auto_generate_settings: { ...ags, last_run_at: new Date().toISOString() },
        },
      }).eq('id', plan.id);

      results.push({
        planId: plan.id,
        status: 'ok',
        currentWeek,
        generated: totalGenerated,
        skipped: totalSkipped,
      });
    } catch (err) {
      console.error(`Auto-gen error for plan ${plan.id}:`, err);
      results.push({
        planId: plan.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    processed: results.filter((r) => r.status === 'ok').length,
    failed: results.filter((r) => r.status === 'error').length,
    batch: batch.length,
    total_enabled: enabledPlans.length,
    stopped_early: stoppedEarly,
    results,
  });
}
