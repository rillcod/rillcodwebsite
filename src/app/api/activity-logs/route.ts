import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { parseLogQuery, postgrestEventFilter } from '@/lib/audit/log-query';
import { resolveLogScope } from '@/lib/audit/log-scope';

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

/** GET /api/activity-logs - role-scoped, page-numbered activity/audit listing. */
export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireStaff>>;
  try {
    actor = await requireStaff();
  } catch (error) {
    console.error('[activity-logs] staff access lookup failed', error);
    return NextResponse.json(
      { error: 'The activity trail could not be opened right now. Please try again.' },
      { status: 500 },
    );
  }
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = parseLogQuery(searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const filters = parsed.value;

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;
  const db = createAdminClient();

  let teacherSchoolIds: string[] = [];
  if (filters.type === 'activity' && actor.role === 'teacher') {
    try {
      teacherSchoolIds = await getTeacherSchoolIds(actor.id, actor.school_id, db as any);
    } catch (error) {
      console.error('[activity-logs] teacher scope lookup failed', error);
      return NextResponse.json(
        { error: 'Your school activity scope could not be verified. Please try again.' },
        { status: 500 },
      );
    }
  }

  // One decision, shared with the export route, so the screen and the CSV can
  // never answer the same request differently.
  const access = resolveLogScope({ type: filters.type, role: actor.role, teacherSchoolIds });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.scope === 'none') return NextResponse.json({ data: [], total: 0, page, limit });

  const cfg = filters.type === 'audit'
    ? { table: 'audit_logs', select: '*, portal_users!audit_logs_user_id_fkey(id, full_name, email, role)', eventCol: 'action' }
    : { table: 'activity_logs', select: '*, portal_users!activity_logs_user_id_fkey(id, full_name, email, role)', eventCol: 'event_type' };

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

  const [countResult, rowsResult] = await Promise.all([
    applyFilters(db.from(cfg.table as any).select('id', { count: 'exact', head: true })),
    applyFilters(db.from(cfg.table as any).select(cfg.select))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1),
  ]);
  if (countResult.error || rowsResult.error) {
    console.error('[activity-logs] query failed', countResult.error || rowsResult.error);
    return NextResponse.json(
      { error: 'The activity trail could not be loaded right now. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: rowsResult.data ?? [],
    total: countResult.count ?? 0,
    page,
    limit,
  });
}
