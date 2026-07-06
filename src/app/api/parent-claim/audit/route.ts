import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const search = searchParams.get('search')?.trim().toLowerCase() || '';
  const offset = (page - 1) * limit;

  let query = (admin as any)
    .from('parent_claim_audit')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq('action', action);
  if (search) query = query.or(`email.ilike.%${search}%,phone.ilike.%${search}%,note.ilike.%${search}%`);

  const { data: rows, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  const schoolRole = profile.role === 'school';
  const scopedRows = (rows ?? []).filter((row: { student_id?: string; parent_id?: string }) => {
    if (!schoolRole || !profile.school_id) return true;
    const child = row.student_id ? nameById.get(row.student_id) : null;
    const parent = row.parent_id ? nameById.get(row.parent_id) : null;
    const sid = profile.school_id;
    return child?.school_id === sid || parent?.school_id === sid;
  }).map((row: Record<string, unknown>) => {
    const sid = row.student_id as string | undefined;
    const pid = row.parent_id as string | undefined;
    return {
      ...row,
      student_name: sid ? nameById.get(sid)?.full_name ?? null : null,
      parent_name: pid ? nameById.get(pid)?.full_name ?? null : null,
    };
  });

  return NextResponse.json({
    rows: scopedRows,
    total: schoolRole ? scopedRows.length : (count ?? 0),
    page,
    limit,
  });
}
