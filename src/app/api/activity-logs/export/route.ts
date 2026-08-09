import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { parseLogQuery, postgrestEventFilter } from '@/lib/audit/log-query';
import { exportPageRanges, resolveLogScope } from '@/lib/audit/log-scope';
import {
  formatAuditDetail,
  formatAuditWho,
  getAuditAccessMethod,
  humanizeAuditAction,
} from '@/lib/audit/humanize';

const MAX_EXPORT_ROWS = 50_000;
const PAGE_SIZE = 1_000;

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data, error } = await supabase
    .from('portal_users')
    .select('role, school_id, is_active, is_deleted')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(`Staff access lookup failed: ${error.message}`);
  if (!data || !['admin', 'teacher'].includes(data.role) || !data.is_active || data.is_deleted) return null;
  return { id: user.id, role: data.role as 'admin' | 'teacher', school_id: data.school_id as string | null };
}

function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  // Quoting alone does not stop spreadsheet formula execution.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return JSON.stringify(text);
}

/** GET /api/activity-logs/export - complete, role-scoped CSV export. */
export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireStaff>>;
  try {
    actor = await requireStaff();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Staff access lookup failed' },
      { status: 500 },
    );
  }
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = parseLogQuery(searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const filters = parsed.value;

  const db = createAdminClient();
  let teacherSchoolIds: string[] = [];
  if (filters.type === 'activity' && actor.role === 'teacher') {
    try {
      teacherSchoolIds = await getTeacherSchoolIds(actor.id, actor.school_id, db as any);
    } catch (error) {
      return NextResponse.json(
        { error: `Teacher activity scope failed: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 },
      );
    }
  }

  // Identical decision to the listing route — an export is a listing with a
  // different Content-Type, and the two must never disagree about access.
  const access = resolveLogScope({ type: filters.type, role: actor.role, teacherSchoolIds });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.scope === 'none') {
    return NextResponse.json({ error: 'No school-scoped activity to export' }, { status: 404 });
  }

  const cfg = filters.type === 'audit'
    ? { table: 'audit_logs', select: '*, portal_users!audit_logs_user_id_fkey(full_name, email, role)', eventCol: 'action' }
    : { table: 'activity_logs', select: '*, portal_users!activity_logs_user_id_fkey(full_name, email, role)', eventCol: 'event_type' };

  const applyFilters = (query: any) => {
    let output = query;
    if (access.scope === 'schools') output = output.in('school_id', access.schoolIds);
    if (filters.userId) output = output.eq('user_id', filters.userId);
    if (filters.eventPatterns.length > 1) {
      output = output.or(postgrestEventFilter(cfg.eventCol, filters.eventPatterns).join(','));
    } else if (filters.eventPatterns[0]?.includes('*')) {
      output = output.like(cfg.eventCol, filters.eventPatterns[0].replace(/\*/g, '%'));
    } else if (filters.eventPatterns[0]) {
      output = output.eq(cfg.eventCol, filters.eventPatterns[0]);
    }
    if (filters.type === 'audit' && filters.accessMethod) {
      output = output.filter('new_values->>access_method', 'eq', filters.accessMethod);
    }
    if (filters.from) output = output.gte('created_at', filters.from);
    if (filters.to) output = output.lte('created_at', filters.to);
    return output;
  };

  const countResult = await applyFilters(
    db.from(cfg.table as any).select('id', { count: 'exact', head: true }),
  );
  if (countResult.error) return NextResponse.json({ error: countResult.error.message }, { status: 500 });
  const total = countResult.count ?? 0;
  if (total === 0) return NextResponse.json({ error: 'No data to export' }, { status: 404 });
  if (total > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      { error: `Export contains ${total.toLocaleString()} rows. Add a date or event filter to stay under ${MAX_EXPORT_ROWS.toLocaleString()} rows.` },
      { status: 413 },
    );
  }

  const data: any[] = [];
  for (const [start, end] of exportPageRanges(total, PAGE_SIZE)) {
    const result = await applyFilters(db.from(cfg.table as any).select(cfg.select))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, end);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    data.push(...(result.data ?? []));
  }
  if (data.length !== total) {
    return NextResponse.json(
      { error: `Export changed while it was being prepared (${data.length} of ${total} rows loaded). Retry for a consistent file.` },
      { status: 409 },
    );
  }

  const headers = filters.type === 'audit'
    ? ['Timestamp', 'What happened', 'How accessed', 'Who opened', 'Student / target', 'Summary', 'IP Address']
    : ['Timestamp', 'Event / Action', 'User Name', 'User Email', 'User Role', 'Details / Metadata', 'IP Address'];

  const csvRows = [
    headers.map(csvCell).join(','),
    ...data.map((row: any) => {
      const user = row.portal_users;
      if (filters.type === 'audit') {
        const who = formatAuditWho(row);
        // Not `access` — that name now holds the authorization decision for the
        // whole request, and shadowing it inside the row mapper is the kind of
        // thing that reads as scoped when it is not.
        const accessMethod = getAuditAccessMethod(row);
        const student = typeof row.new_values?.student_name === 'string'
          ? [row.new_values.student_name, row.new_values.school_name].filter(Boolean).join(' - ')
          : '';
        return [
          row.created_at,
          humanizeAuditAction(row.action || '', row),
          accessMethod.label,
          who.title,
          student,
          formatAuditDetail(row),
          row.ip_address,
        ].map(csvCell).join(',');
      }
      return [
        row.created_at,
        row.event_type,
        user?.full_name || 'System',
        user?.email,
        user?.role,
        JSON.stringify(row.metadata || {}),
        row.ip_address,
      ].map(csvCell).join(',');
    }),
  ];

  const csvContent = `\uFEFF${csvRows.join('\n')}`;
  const filename = `${filters.type}_logs_${new Date().toISOString().split('T')[0]}.csv`;
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Export-Row-Count': String(data.length),
    },
  });
}
