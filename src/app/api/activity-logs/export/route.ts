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
 * GET /api/activity-logs/export — Exports Activity or Audit Logs in CSV format.
 *
 * Query params:
 *   type       — 'audit' (admin only) | 'activity' (default)
 *   user_id, event_type, from, to — optional filters
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

  if (type === 'audit' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Audit log export is restricted to admins' }, { status: 403 });
  }

  const db = createAdminClient();
  const cfg = type === 'audit'
    ? { table: 'audit_logs', select: '*, portal_users!audit_logs_user_id_fkey(full_name, email, role)', eventCol: 'action' }
    : { table: 'activity_logs', select: '*, portal_users!activity_logs_user_id_fkey(full_name, email, role)', eventCol: 'event_type' };

  let query: any = db.from(cfg.table as any).select(cfg.select).order('created_at', { ascending: false }).limit(1000);

  if (type === 'activity' && user.role !== 'admin' && user.school_id) query = query.eq('school_id', user.school_id);
  if (userId) query = query.eq('user_id', userId);
  if (eventType) query = query.eq(cfg.eventCol, eventType);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No data to export' }, { status: 404 });

  // Format into clean CSV rows
  const headers = ['Timestamp', 'Event / Action', 'User Name', 'User Email', 'User Role', 'Details / Metadata', 'IP Address'];
  const csvRows = [
    headers.join(','),
    ...data.map((row: any) => {
      const u = row.portal_users;
      const eventName = type === 'audit' ? row.action : row.event_type;
      const details = type === 'audit'
        ? `${row.table_name || ''} ${row.record_id || ''}`.trim()
        : JSON.stringify(row.metadata || {});
      return [
        JSON.stringify(row.created_at || ''),
        JSON.stringify(eventName || ''),
        JSON.stringify(u?.full_name || 'System'),
        JSON.stringify(u?.email || ''),
        JSON.stringify(u?.role || ''),
        JSON.stringify(details),
        JSON.stringify(row.ip_address || ''),
      ].join(',');
    })
  ];

  const csvContent = csvRows.join('\n');
  const filename = `${type}_logs_${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
