import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import {
  currentTermWeek,
  generatePlanWeek,
  notifyWeekReady,
} from '@/lib/academic/week-generation';
import {
  parseAutoGenerateSettings,
  type AutoGenerateSettings,
} from '@/lib/academic/auto-generate-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — each plan generates up to N weeks

// Shape, defaults and the publish rule all live in auto-generate-settings —
// this route reads them, it does not restate them.
type AutoGenSettings = AutoGenerateSettings;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
  // The sweep calls this app's own generator routes, so it must call the
  // deployment it is running in. NEXT_PUBLIC_APP_URL names production wherever
  // it is read, so preview and local runs were reaching across to production,
  // asking it to generate for plans it has never heard of and recording four
  // 404s as "types failed". The request's own origin is the only value that is
  // correct in every environment; the env var stays as a last resort for
  // invocations that arrive without one.
  const appBaseUrl = (
    req.nextUrl?.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');

  const { data: plans, error } = await db
    .from('lesson_plans')
    .select('id, term_start, class_id, metadata')
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
    notified?: string;
    error?: string;
  }> = [];

  let stoppedEarly = false;
  for (const plan of batch) {
    if (Date.now() > DEADLINE) { stoppedEarly = true; break; }
    try {
      const meta = plan.metadata as Record<string, unknown>;
      const ags = parseAutoGenerateSettings(meta.auto_generate_settings);
      const currentWeek = currentTermWeek(plan.term_start ?? null);

      // Target THIS week specifically rather than "the next N weeks". The teacher's button and
      // this sweep now run the identical path, so whichever fires first the other finds the work
      // already done and skips it.
      const outcome = await generatePlanWeek({
        planId: plan.id,
        week: currentWeek,
        types: ags.types,
        baseUrl: appBaseUrl,
        cronSecret,
        // Opt-in per plan. Left unset, the week is prepared for the teacher to
        // read and release rather than published to students overnight.
        autoPublish: ags.auto_publish,
      });

      // Tell the class teacher their week is waiting. Idempotent per plan+week, so a retry or a
      // teacher pressing the button afterwards does not notify twice.
      const notified = await notifyWeekReady(db, {
        planId: plan.id,
        classId: plan.class_id ?? null,
        week: currentWeek,
        outcome,
        autoPublish: ags.auto_publish,
      });

      // Stamp last_run_at so this plan sinks to the back of the rotation queue
      // and the next scheduled run picks up the other plans.
      //
      // Merged over what is stored, not over the parsed copy: parsing fills in
      // defaults, and writing those back would silently rewrite a teacher's own
      // selection every night. The sweep records when it ran, nothing else.
      await db.from('lesson_plans').update({
        metadata: {
          ...meta,
          auto_generate_settings: {
            ...((meta.auto_generate_settings as Record<string, unknown>) ?? {}),
            last_run_at: new Date().toISOString(),
          },
        },
      }).eq('id', plan.id);

      results.push({
        planId: plan.id,
        status: outcome.failedTypes.length && !outcome.generated && !outcome.skipped ? 'error' : 'ok',
        currentWeek,
        generated: outcome.generated,
        skipped: outcome.skipped,
        notified,
        ...(outcome.failedTypes.length ? { error: `types failed: ${outcome.failedTypes.join(', ')}` } : {}),
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
