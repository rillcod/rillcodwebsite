import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isParentClaimAuditAction,
  parentClaimActivitySummary,
  parentClaimNextAction,
  PARENT_CLAIM_ACTION_LABELS,
} from '@/lib/parent-claim/audit-display';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['admin', 'teacher', 'school']);

// GET /api/parent-claim/audit?page=1&limit=50&action=&search=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.role || !STAFF_ROLES.has(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)));
  const action = searchParams.get('action')?.trim() || '';
  const search = (searchParams.get('search')?.trim().toLowerCase() || '')
    .replace(/[(),]/g, ' ')
    .slice(0, 120);
  const offset = (page - 1) * limit;

  let scopedStudentIds: string[] | null = null;
  if (profile.role !== 'admin') {
    if (!profile.school_id) {
      return NextResponse.json({ rows: [], total: 0, page, limit });
    }
    const { data: students, error: scopeError } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'student')
      .eq('school_id', profile.school_id);
    if (scopeError) {
      console.error('[parent-claim/audit] failed to resolve staff scope:', scopeError);
      return NextResponse.json({ error: 'Could not load parent claim activity.' }, { status: 500 });
    }
    scopedStudentIds = (students ?? []).map((student) => student.id);
    if (!scopedStudentIds.length) {
      return NextResponse.json({ rows: [], total: 0, page, limit });
    }
  }

  let query = (admin as any)
    .from('parent_claim_audit')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (scopedStudentIds) query = query.in('student_id', scopedStudentIds);
  if (action) query = query.eq('action', action);
  if (search) query = query.or(`email.ilike.%${search}%,phone.ilike.%${search}%,note.ilike.%${search}%`);
  query = query.range(offset, offset + limit - 1);

  const { data: rows, error, count } = await query;
  if (error) {
    console.error('[parent-claim/audit] query failed:', error);
    return NextResponse.json({ error: 'Could not load parent claim activity.' }, { status: 500 });
  }

  const studentIds = [...new Set((rows ?? []).map((r: { student_id?: string }) => r.student_id).filter(Boolean))] as string[];
  const parentIds = [...new Set((rows ?? []).map((r: { parent_id?: string }) => r.parent_id).filter(Boolean))] as string[];
  const userIds = [...new Set([...studentIds, ...parentIds])];

  const nameById = new Map<string, { full_name: string | null; school_id: string | null }>();
  if (userIds.length) {
    const { data: users } = await admin
      .from('portal_users')
      .select('id, full_name, school_id')
      .in('id', userIds);
    for (const u of users ?? []) nameById.set(u.id, { full_name: u.full_name, school_id: u.school_id });
  }

  const scopedRows = (rows ?? []).map((row: Record<string, unknown>) => {
    const sid = row.student_id as string | undefined;
    const pid = row.parent_id as string | undefined;
    const actionKey = String(row.action ?? '');
    const knownAction = isParentClaimAuditAction(actionKey) ? actionKey : null;
    return {
      ...row,
      action_label: knownAction ? PARENT_CLAIM_ACTION_LABELS[knownAction] : 'Parent claim activity',
      note: knownAction ? parentClaimActivitySummary(knownAction, Number(row.siblings_linked ?? 0)) : 'Parent claim activity was recorded.',
      next_action: knownAction ? parentClaimNextAction(knownAction) : null,
      student_name: sid ? nameById.get(sid)?.full_name ?? null : null,
      parent_name: pid ? nameById.get(pid)?.full_name ?? null : null,
    };
  });

  return NextResponse.json({
    rows: scopedRows,
    total: count ?? 0,
    page,
    limit,
  });
}
