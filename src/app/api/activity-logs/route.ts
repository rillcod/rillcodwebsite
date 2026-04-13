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

// GET /api/activity-logs — paginated activity + audit logs (admin/teacher)
export async function GET(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'activity'; // 'activity' | 'audit'
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = (page - 1) * limit;
  const userId = searchParams.get('user_id');
  const eventType = searchParams.get('event_type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const db = createAdminClient();

  if (type === 'audit') {
    let query = db
      .from('audit_logs')
      .select('*, portal_users(id, full_name, email, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);
    if (eventType) query = query.eq('action', eventType);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
  }

  // activity logs
  let query = db
    .from('activity_logs')
    .select('*, portal_users(id, full_name, email, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (user.role !== 'admin' && user.school_id) query = query.eq('school_id', user.school_id);
  if (userId) query = query.eq('user_id', userId);
  if (eventType) query = query.eq('event_type', eventType);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}
