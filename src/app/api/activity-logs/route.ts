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
 * GET /api/activity-logs — page-numbered log listing (matches the UI: page + limit + total).
 *
 * Query params:
 *   type       — 'audit' (admin only, from audit_logs) | 'activity' (default, from activity_logs)
 *   page       — 1-based page number (default 1)
 *   limit      — rows per page (default 50, max 100)
 *   user_id, event_type, from, to — filters
 *
 * One code path serves both log types (config only) so ordering, filters and pagination never
 * drift between them.
 */
export async function GET(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'audit' ? 'audit' : 'activity';
  const userId = searchParams.get('user_id');
  const eventType = searchParams.get('event_type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;

  // The audit trail (sensitive deletes, approvals, role changes) is admin-only. Teachers/school
  // users get the school-scoped activity feed instead.
  if (type === 'audit' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Audit log is restricted to admins' }, { status: 403 });
  }

  const db = createAdminClient();
  // audit_logs has TWO FKs to portal_users (user_id + actor_id) so the embed MUST name one.
  const cfg = type === 'audit'
    ? { table: 'audit_logs', select: '*, portal_users!audit_logs_user_id_fkey(id, full_name, email, role)', eventCol: 'action' }
    : { table: 'activity_logs', select: '*, portal_users!activity_logs_user_id_fkey(id, full_name, email, role)', eventCol: 'event_type' };

  const applyFilters = <T extends { eq: any; gte: any; lte: any }>(q: T): T => {
    let out: any = q;
    if (type === 'activity' && user.role !== 'admin' && user.school_id) out = out.eq('school_id', user.school_id);
    if (userId) out = out.eq('user_id', userId);
    if (eventType) out = out.eq(cfg.eventCol, eventType);
    if (from) out = out.gte('created_at', from);
    if (to) out = out.lte('created_at', to);
    return out;
  };

  // Total (for page count) + this page's rows, same filters on both.
  const countQ = applyFilters(db.from(cfg.table as any).select('id', { count: 'exact', head: true }) as any);
  const rowsQ = applyFilters(
    db.from(cfg.table as any)
      .select(cfg.select)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1) as any,
  );

  const [{ count }, { data, error }] = await Promise.all([countQ, rowsQ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}
