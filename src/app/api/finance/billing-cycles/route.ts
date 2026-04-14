import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

async function teacherScopedSchoolIds(
  db: ReturnType<typeof createAdminClient>,
  teacherId: string,
  primarySchoolId: string | null,
) {
  const ids = new Set<string>();
  if (primarySchoolId) ids.add(primarySchoolId);
  const { data: ts } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  (ts ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  const { data: cls } = await db.from('classes').select('school_id').eq('teacher_id', teacherId);
  (cls ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  return [...ids];
}

/**
 * GET /api/finance/billing-cycles?school_id=&subscription_id=&status=
 * Returns billing cycles with invoice + school info.
 */
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subscription_id = searchParams.get('subscription_id');
  const status = searchParams.get('status');

  const db = createAdminClient();

  let q = db.from('billing_cycles')
    .select('*, invoices(id, invoice_number, status, amount), schools(name, rillcod_quota_percent)')
    .order('due_date', { ascending: false })
    .limit(200);

  if (caller.role === 'admin') {
    const param = searchParams.get('school_id');
    if (param) {
      q = q.or(`school_id.eq.${param},owner_school_id.eq.${param}`) as typeof q;
    }
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    const sid = caller.school_id;
    q = q.or(`school_id.eq.${sid},owner_school_id.eq.${sid}`) as typeof q;
  } else if (caller.role === 'teacher') {
    const ids = await teacherScopedSchoolIds(db, caller.id, caller.school_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const inList = ids.join(',');
    q = q.or(
      `school_id.in.(${inList}),owner_school_id.in.(${inList}),owner_user_id.eq.${caller.id}`,
    ) as typeof q;
  }
  if (subscription_id) q = q.eq('subscription_id', subscription_id) as typeof q;
  if (status) q = q.eq('status', status) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * PATCH /api/finance/billing-cycles — mark a billing cycle as paid/cancelled
 * Body: { id, status: 'paid' | 'cancelled' }
 */
export async function PATCH(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id, status } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const allowed = ['paid', 'cancelled', 'due', 'past_due'];
  if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db.from('billing_cycles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
