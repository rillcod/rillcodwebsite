import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  formatAuditDetail,
  formatAuditWho,
  getAuditAccessMethod,
  humanizeAuditAction,
} from '@/lib/audit/humanize';

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
 *   user_id, event_type, from, to, access_method — optional filters
 *   event_type may end with * for prefix match
 */
export async function GET(request: Request) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') === 'audit' ? 'audit' : 'activity';
  const userId = searchParams.get('user_id');
  const eventType = searchParams.get('event_type');
  const accessMethodRaw = (searchParams.get('access_method') || '').trim().toLowerCase();
  const accessMethod = ['qr', 'typed', 'link'].includes(accessMethodRaw) ? accessMethodRaw : null;
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
  if (eventType) {
    const patterns = eventType.split(',').map((p) => p.trim()).filter(Boolean);
    if (patterns.length > 1) {
      const orParts = patterns.map((p) => {
        if (p.includes('*')) return `${cfg.eventCol}.like.${p.replace(/\*/g, '%')}`;
        return `${cfg.eventCol}.eq.${p}`;
      });
      query = query.or(orParts.join(','));
    } else if (patterns[0]?.includes('*')) {
      query = query.like(cfg.eventCol, patterns[0].replace(/\*/g, '%'));
    } else if (patterns[0]) {
      query = query.eq(cfg.eventCol, patterns[0]);
    }
  }
  if (type === 'audit' && accessMethod) {
    query = query.filter('new_values->>access_method', 'eq', accessMethod);
  }
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No data to export' }, { status: 404 });

  const headers = type === 'audit'
    ? ['Timestamp', 'What happened', 'How accessed', 'Who opened', 'Student / target', 'Summary', 'IP Address']
    : ['Timestamp', 'Event / Action', 'User Name', 'User Email', 'User Role', 'Details / Metadata', 'IP Address'];

  const csvRows = [
    headers.join(','),
    ...data.map((row: any) => {
      const u = row.portal_users;
      if (type === 'audit') {
        const who = formatAuditWho(row);
        const access = getAuditAccessMethod(row);
        const student = typeof row.new_values?.student_name === 'string'
          ? [row.new_values.student_name, row.new_values.school_name].filter(Boolean).join(' · ')
          : '';
        return [
          JSON.stringify(row.created_at || ''),
          JSON.stringify(humanizeAuditAction(row.action || '', row)),
          JSON.stringify(access.label || ''),
          JSON.stringify(who.title),
          JSON.stringify(student),
          JSON.stringify(formatAuditDetail(row) || ''),
          JSON.stringify(row.ip_address || ''),
        ].join(',');
      }
      return [
        JSON.stringify(row.created_at || ''),
        JSON.stringify(row.event_type || ''),
        JSON.stringify(u?.full_name || 'System'),
        JSON.stringify(u?.email || ''),
        JSON.stringify(u?.role || ''),
        JSON.stringify(JSON.stringify(row.metadata || {})),
        JSON.stringify(row.ip_address || ''),
      ].join(',');
    }),
  ];

  const csvContent = csvRows.join('\n');
  const filename = `${type}_logs_${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
