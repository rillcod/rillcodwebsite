import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!data || !['admin', 'teacher'].includes(data.role)) return null;
  return { ...user, role: data.role, school_id: data.school_id };
}

/**
 * GET /api/activity-logs
 * Cursor-based pagination (Req 10): 20 rows per page ordered by created_at DESC, id DESC.
 *
 * Query params:
 *   type              — 'activity' (default) | 'audit'
 *   cursor_created_at — ISO timestamp cursor
 *   cursor_id         — UUID cursor
 *   user_id, event_type, from, to — filters
 */
export async function GET(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'activity';
  const cursorCreatedAt = searchParams.get('cursor_created_at');
  const cursorId = searchParams.get('cursor_id');
  const userId = searchParams.get('user_id');
  const eventType = searchParams.get('event_type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const db = createAdminClient();

  if (type === 'audit') {
    let q = db
      .from('audit_logs')
      .select('*, portal_users(id, full_name, email, role)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21);

    if (userId) q = q.eq('user_id', userId) as any;
    if (eventType) q = q.eq('action', eventType) as any;
    if (from) q = q.gte('created_at', from) as any;
    if (to) q = q.lte('created_at', to) as any;
    if (cursorCreatedAt && cursorId) {
      q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`) as any;
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const hasMore = rows.length === 21;
    const page = hasMore ? rows.slice(0, 20) : rows;
    const last = page[page.length - 1] as any;
    return NextResponse.json({
      data: page,
      nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
    });
  }

  // activity logs
  let q = db
    .from('activity_logs')
    .select('*, portal_users(id, full_name, email, role)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(21);

  if (user.role !== 'admin' && user.school_id) q = q.eq('school_id', user.school_id) as any;
  if (userId) q = q.eq('user_id', userId) as any;
  if (eventType) q = q.eq('event_type', eventType) as any;
  if (from) q = q.gte('created_at', from) as any;
  if (to) q = q.lte('created_at', to) as any;
  if (cursorCreatedAt && cursorId) {
    q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`) as any;
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length === 21;
  const page = hasMore ? rows.slice(0, 20) : rows;
  const last = page[page.length - 1] as any;
  return NextResponse.json({
    data: page,
    nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
  });
}
