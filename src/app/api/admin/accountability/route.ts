import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

/**
 * Full accountability census: every account, where they are placed, what they
 * hold, and what is missing.
 *
 * Both RPCs read from materialised views (accountability_people_mv and
 * accountability_coverage_mv) so every GET is near-instant regardless of
 * account count. The views are refreshed either:
 *   - automatically via pg_cron every 30 minutes (if enabled), or
 *   - on demand when the admin clicks Refresh → POST /api/admin/accountability
 *
 * Both RPCs are granted to service_role ONLY — anon and authenticated hold no
 * EXECUTE privilege, so this route is the only way to reach them. The caller
 * is authenticated with the session client first and must be an admin.
 */

export const dynamic = 'force-dynamic';

/** Timeout (ms) applied to RPC calls. */
const RPC_TIMEOUT_MS = 25_000;

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

/** Rejects after `ms` milliseconds with a descriptive error. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Database query timed out after ${ms / 1000}s`)), ms),
  );
}

/** Authenticate caller and assert admin role. Returns error response or null. */
async function assertAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

// ── GET — read from the materialised view cache ──────────────────────────────

export async function GET() {
  const authErr = await assertAdmin();
  if (authErr) return authErr;

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
  let peopleRes: Awaited<ReturnType<typeof db.rpc>>;

  try {
    [coverageRes, peopleRes] = await Promise.race([
      Promise.all([
        db.rpc('get_academic_coverage' as never),
        db.rpc('get_people_accountability' as never),
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

  return NextResponse.json(
    { coverage: coverageRes.data ?? null, people: peopleRes.data ?? [] },
    NO_STORE,
  );
}

// ── POST — trigger a materialised view refresh ───────────────────────────────
// Called when the admin clicks the Refresh button on the dashboard.
// The refresh runs CONCURRENTLY so existing readers are never blocked.

export async function POST() {
  const authErr = await assertAdmin();
  if (authErr) return authErr;

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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Refresh timed out' },
      { status: 500 },
    );
  }

  if (refreshRes.error) {
    return NextResponse.json({ error: refreshRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ refreshed_at: refreshRes.data }, NO_STORE);
}
