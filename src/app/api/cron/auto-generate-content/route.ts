import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { consumeSSEUntilDone } from '@/lib/lesson-plans/ai-fetch';

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
export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
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

  const results: Array<{
    planId: string;
    status: 'ok' | 'error';
    currentWeek?: number;
    generated?: number;
    skipped?: number;
    error?: string;
  }> = [];

  for (const plan of enabledPlans) {
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
    total: enabledPlans.length,
    results,
  });
}
