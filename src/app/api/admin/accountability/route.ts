import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';
import { logAudit } from '@/lib/audit/log';

/**
 * Full accountability census: every account, where they are placed, what they
 * hold, and what is missing.
 *
 * People are read from accountability_people_mv. PostgREST caps a single select
 * at 1000 rows by default — `.range(0, 99999)` does NOT bypass that. Without
 * pagination the People census always showed exactly 1000 accounts (roles
 * summing to 1000) while the database held more.
 *
 * Refresh: POST /api/admin/accountability → refresh_accountability_cache().
 */

export const dynamic = 'force-dynamic';

const RPC_TIMEOUT_MS = 60_000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Server misconfiguration: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.',
    );
  }
  return createClient<Database>(url, key);
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Database query timed out after ${ms / 1000}s`)), ms),
  );
}

async function accountabilityActor(): Promise<{ actorId: string | null; error: NextResponse | null }> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { actorId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!roleHasCapability(caller?.role, 'view_accountability')) {
    return { actorId: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { actorId: user.id, error: null };
}

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

function countByRole(rows: Array<{ role?: string | null }>) {
  const m: Record<string, number> = {};
  for (const row of rows) {
    const r = String(row.role || 'unknown').toLowerCase();
    m[r] = (m[r] || 0) + 1;
  }
  return m;
}

export async function GET() {
  const actor = await accountabilityActor();
  if (actor.error) return actor.error;

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server misconfiguration' },
      { status: 500 },
    );
  }

  let coverageRes: Awaited<ReturnType<typeof db.rpc>>;
  let peopleRes: { data: any[]; error: { message: string } | null };
  let backlogRes: Awaited<ReturnType<typeof db.rpc>>;
  let liveRoleRes: { data: Array<{ role: string }> | null; error: { message: string } | null };

  try {
    [coverageRes, peopleRes, backlogRes, liveRoleRes] = await Promise.race([
      Promise.all([
        db.rpc('get_academic_coverage' as never),
        // Page past the 1000-row PostgREST cap so the census matches the DB.
        fetchAllSupabaseRows<any>((from, to) =>
          db.from('accountability_people_mv' as never).select('*').range(from, to),
        ),
        db.rpc('get_report_backlog' as never),
        fetchAllSupabaseRows<{ role: string }>((from, to) =>
          db
            .from('portal_users')
            .select('role')
            .eq('is_deleted', false)
            .range(from, to),
        ),
      ]),
      timeout(RPC_TIMEOUT_MS),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Database query failed' },
      { status: 500 },
    );
  }

  if (coverageRes.error) {
    return NextResponse.json({ error: coverageRes.error.message }, { status: 500 });
  }
  if (peopleRes.error) {
    return NextResponse.json({ error: peopleRes.error.message }, { status: 500 });
  }

  const people = peopleRes.data ?? [];
  const mvRoleCounts = countByRole(people);
  const liveRoleCounts = liveRoleRes.error ? null : countByRole(liveRoleRes.data ?? []);
  const liveTotal = liveRoleCounts
    ? Object.values(liveRoleCounts).reduce((a, b) => a + b, 0)
    : null;
  const dataQualityWarnings: string[] = [];
  if (backlogRes.error) dataQualityWarnings.push(`Report backlog unavailable: ${backlogRes.error.message}`);
  if (liveRoleRes.error) dataQualityWarnings.push(`Live account census unavailable: ${liveRoleRes.error.message}`);
  if (liveTotal !== null && liveTotal !== people.length) {
    dataQualityWarnings.push(`The accountability cache contains ${people.length} people while the live account source contains ${liveTotal}. Refresh the cache before acting on totals.`);
  }

  return NextResponse.json(
    {
      coverage: coverageRes.data ?? null,
      people,
      backlog: backlogRes.error ? null : (backlogRes.data ?? null),
      census: {
        total: people.length,
        by_role: mvRoleCounts,
        live_total: liveTotal,
        live_by_role: liveRoleCounts,
        source: 'accountability_people_mv',
      },
      data_quality: {
        complete: dataQualityWarnings.length === 0,
        warnings: dataQualityWarnings,
        checked_at: new Date().toISOString(),
      },
    },
    NO_STORE,
  );
}

export async function POST() {
  const actor = await accountabilityActor();
  if (actor.error) return actor.error;

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server misconfiguration' },
      { status: 500 },
    );
  }

  let refreshRes: Awaited<ReturnType<typeof db.rpc>>;
  try {
    [refreshRes] = await Promise.race([
      Promise.all([db.rpc('refresh_accountability_cache' as never)]),
      timeout(RPC_TIMEOUT_MS),
    ]);
  } catch (e) {
    await logAudit(db as any, {
      action: 'refresh_accountability_cache_failed', actorId: actor.actorId,
      resourceType: 'accountability_cache',
      newValue: e instanceof Error ? e.message : 'Refresh timed out',
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Refresh timed out' },
      { status: 500 },
    );
  }

  if (refreshRes.error) {
    await logAudit(db as any, {
      action: 'refresh_accountability_cache_failed', actorId: actor.actorId,
      resourceType: 'accountability_cache', newValue: refreshRes.error.message,
    });
    return NextResponse.json({ error: refreshRes.error.message }, { status: 500 });
  }

  await logAudit(db as any, {
    action: 'refresh_accountability_cache', actorId: actor.actorId,
    resourceType: 'accountability_cache',
    newValue: 'Refreshed the central administrative accountability census',
    newValues: { refreshed_at: refreshRes.data },
  });

  return NextResponse.json({ refreshed_at: refreshRes.data }, NO_STORE);
}
