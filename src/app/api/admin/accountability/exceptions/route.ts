import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildStudentExceptionQueues, filterExceptionQueuesByClassName } from '@/lib/accountability/student-exceptions';
import type { Person } from '@/lib/accountability/types';
import { collectHollowAccounts } from '@/lib/admin/platform-sanitation';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';

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
  if (!roleHasCapability(caller?.role, 'view_accountability')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, caller };
}

/**
 * GET /api/admin/accountability/exceptions
 * Exception queues for Academic Office — displaced, hollow, placeholder noise, etc.
 * Optional: class_id filters queues to students linked to that class (roster or profile).
 */
export async function GET(req: Request) {
  const auth = await assertAdmin();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const hollowMinAge = Number(url.searchParams.get('hollow_min_age_days') || '90');
  if (!Number.isInteger(hollowMinAge) || hollowMinAge < 1 || hollowMinAge > 3650) {
    return NextResponse.json({ error: 'hollow_min_age_days must be a whole number from 1 to 3650.' }, { status: 400 });
  }
  const classId = (url.searchParams.get('class_id') || '').trim();

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }

  let peopleResult: { data: Person[]; error: { message: string } | null };
  let hollowAccounts;
  let classRow;
  try {
    [peopleResult, hollowAccounts, classRow] = await Promise.all([
      fetchAllSupabaseRows<Person>((from, to) => db.from('accountability_people_mv' as never).select('*').range(from, to)),
      collectHollowAccounts(db, { minAgeDays: hollowMinAge }),
      classId
        ? db.from('classes').select('id, name').eq('id', classId).maybeSingle()
        : Promise.resolve({ data: null as { id: string; name: string } | null, error: null }),
    ]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Accountability exception scan failed' }, { status: 500 });
  }

  if (peopleResult.error) {
    return NextResponse.json({ error: peopleResult.error.message }, { status: 500 });
  }
  if (classRow.error) {
    return NextResponse.json({ error: classRow.error.message }, { status: 500 });
  }
  if (classId && !classRow.data) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  let exceptions = buildStudentExceptionQueues(peopleResult.data ?? [], hollowAccounts);
  if (classRow.data?.name) {
    exceptions = filterExceptionQueuesByClassName(exceptions, classRow.data.name);
  }

  return NextResponse.json({
    exceptions,
    class_filter: classRow.data
      ? { class_id: classRow.data.id, class_name: classRow.data.name }
      : null,
    hollow_scan: {
      min_age_days: hollowMinAge,
      matched: hollowAccounts.length,
      people_scanned: peopleResult.data.length,
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
