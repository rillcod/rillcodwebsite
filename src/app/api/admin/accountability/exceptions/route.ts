import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildStudentExceptionQueues } from '@/lib/accountability/student-exceptions';
import type { Person } from '@/lib/accountability/types';
import { collectHollowAccounts } from '@/lib/admin/platform-sanitation';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfiguration: SUPABASE keys not set');
  return createClient<Database>(url, key);
}

async function assertAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (caller?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, caller };
}

/**
 * GET /api/admin/accountability/exceptions
 * Exception queues for Academic Office — displaced, hollow, placeholder noise, etc.
 */
export async function GET(req: Request) {
  const auth = await assertAdmin();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const hollowMinAge = Number(url.searchParams.get('hollow_min_age_days') || '90');

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }

  const [{ data: people, error: peopleErr }, hollowAccounts] = await Promise.all([
    db.from('accountability_people_mv' as never).select('*').range(0, 99999),
    collectHollowAccounts(db, { minAgeDays: hollowMinAge }),
  ]);

  if (peopleErr) {
    return NextResponse.json({ error: peopleErr.message }, { status: 500 });
  }

  const exceptions = buildStudentExceptionQueues((people ?? []) as Person[], hollowAccounts);

  return NextResponse.json({
    exceptions,
    hollow_scan: {
      min_age_days: hollowMinAge,
      matched: hollowAccounts.length,
    },
    automation: {
      engine: 'accountability-student-exceptions',
      rules_version: exceptions.rules_version,
      observable: true,
      purge_endpoint: '/api/admin/manage-account',
      purge_action: 'purge',
    },
  }, NO_STORE);
}
