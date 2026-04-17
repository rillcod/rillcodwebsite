import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/payments/transactions
 * Cursor-based pagination (Req 10): 20 rows per page ordered by created_at DESC, id DESC.
 *
 * Query params:
 *   cursor_created_at  — ISO timestamp of the last row from the previous page
 *   cursor_id          — UUID of the last row from the previous page
 *   school_id          — filter by school (admin only; non-admins are scoped automatically)
 *   status             — filter by payment_status
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const cursorCreatedAt = searchParams.get('cursor_created_at');
  const cursorId = searchParams.get('cursor_id');
  const statusFilter = searchParams.get('status');
  const schoolIdParam = searchParams.get('school_id');

  const db = createAdminClient();
  let q = db
    .from('payment_transactions')
    .select('*, portal_users(full_name, email)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(21); // fetch 21 to detect next page

  // Scope by school
  if (profile.role === 'admin' && schoolIdParam) {
    q = q.eq('school_id', schoolIdParam) as any;
  } else if (profile.role !== 'admin' && profile.school_id) {
    q = q.eq('school_id', profile.school_id) as any;
  } else if (profile.role === 'student' || profile.role === 'parent') {
    q = q.eq('portal_user_id', user.id) as any;
  }

  if (statusFilter) q = q.eq('payment_status', statusFilter) as any;

  // Cursor (Req 10.3)
  if (cursorCreatedAt && cursorId) {
    q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`) as any;
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length === 21;
  const page = hasMore ? rows.slice(0, 20) : rows;
  const last = page[page.length - 1] as any;
  const nextCursor = hasMore && last
    ? { created_at: last.created_at, id: last.id }
    : null;

  return NextResponse.json({ data: page, nextCursor });
}
