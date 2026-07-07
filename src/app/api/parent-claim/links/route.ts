import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrCreateStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['admin', 'teacher', 'school']);

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, school_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.role || !STAFF_ROLES.has(profile.role)) {
    return { error: 'Forbidden', status: 403 as const };
  }
  return { admin, profile };
}

/** Whether a non-admin caller may act on a student in this school. */
function inScope(profile: any, schoolId: string | null, schoolName: string | null): boolean {
  if (profile.role === 'admin') return true;
  if (profile.role === 'school') return !!schoolId && schoolId === profile.school_id;
  // teacher: match by school name (their assignment denormalised on the profile)
  return !!schoolName && !!profile.school_name && schoolName.trim().toLowerCase() === profile.school_name.trim().toLowerCase();
}

// GET /api/parent-claim/links
//   ?find=parent|student&q=…  → picker search (for the "link" form)
//   (default)                 → list current parent↔child links (?search=&page=&limit=)
export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { admin, profile } = guard;
  const { searchParams } = new URL(req.url);
  const find = searchParams.get('find');
  const q = (searchParams.get('q') || '').trim();

  // ── Picker search ──────────────────────────────────────────────────────────
  if (find === 'parent' || find === 'student') {
    if (q.length < 2) return NextResponse.json({ rows: [] });
    const role = find === 'parent' ? 'parent' : 'student';
    let query = admin
      .from('portal_users')
      .select('id, full_name, email, phone, school_id, school_name, section_class')
      .eq('role', role)
      .neq('is_deleted', true)
      .limit(12);
    query = find === 'parent'
      ? query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      : query.ilike('full_name', `%${q}%`);
    if (profile.role === 'school' && profile.school_id) query = query.eq('school_id', profile.school_id);
    const { data } = await query;
    const rows = (data ?? [])
      .filter((u: any) => inScope(profile, u.school_id, u.school_name))
      .map((u: any) => ({
        id: u.id, full_name: u.full_name, email: u.email, phone: u.phone,
        school_name: u.school_name, class_name: u.section_class,
      }));
    return NextResponse.json({ rows });
  }

  // ── List current links ───────────────────────────────────────────────────
  const search = (searchParams.get('search') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

  const { data: links, error } = await admin
    .from('parent_student_links')
    .select('id, parent_id, student_id, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parentIds = [...new Set((links ?? []).map((l: any) => l.parent_id).filter(Boolean))];
  const studentRowIds = [...new Set((links ?? []).map((l: any) => l.student_id).filter(Boolean))];

  const [{ data: parents }, { data: students }] = await Promise.all([
    parentIds.length ? admin.from('portal_users').select('id, full_name, email, phone').in('id', parentIds) : Promise.resolve({ data: [] as any[] }),
    studentRowIds.length ? admin.from('students').select('id, full_name, school_id, school_name, user_id, section') : Promise.resolve({ data: [] as any[] }),
  ]);
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]));
  const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]));

  let rows = (links ?? []).map((l: any) => {
    const p = parentMap.get(l.parent_id);
    const s = studentMap.get(l.student_id);
    return {
      id: l.id,
      created_at: l.created_at,
      parent_id: l.parent_id,
      parent_name: p?.full_name ?? null,
      parent_email: p?.email ?? null,
      parent_phone: p?.phone ?? null,
      student_row_id: l.student_id,
      student_user_id: s?.user_id ?? null,
      student_name: s?.full_name ?? null,
      school_id: s?.school_id ?? null,
      school_name: s?.school_name ?? null,
      class_name: s?.section ?? null,
    };
  }).filter((r: any) => inScope(profile, r.school_id, r.school_name));

  if (search) {
    const t = search.toLowerCase();
    rows = rows.filter((r: any) =>
      [r.parent_name, r.parent_email, r.student_name, r.school_name].some((v: any) => (v || '').toLowerCase().includes(t)));
  }

  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);
  return NextResponse.json({ rows: paged, total });
}

// POST /api/parent-claim/links  Body: { parentId, studentUserId }  — create a link.
export async function POST(req: NextRequest) {
  const guard = await requireStaff();
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { admin, profile } = guard;

  const body = await req.json().catch(() => ({}));
  const parentId: string = (body.parentId || '').trim();
  const studentUserId: string = (body.studentUserId || '').trim();
  if (!parentId || !studentUserId) {
    return NextResponse.json({ error: 'parentId and studentUserId are required' }, { status: 400 });
  }

  const [{ data: parent }, { data: student }] = await Promise.all([
    admin.from('portal_users').select('id, role, full_name, email, phone').eq('id', parentId).maybeSingle(),
    admin.from('portal_users').select('id, role, full_name, school_id, school_name').eq('id', studentUserId).maybeSingle(),
  ]);
  if (!parent || parent.role !== 'parent') return NextResponse.json({ error: 'Parent account not found' }, { status: 404 });
  if (!student || student.role !== 'student') return NextResponse.json({ error: 'Student account not found' }, { status: 404 });
  if (!inScope(profile, (student as any).school_id, (student as any).school_name)) {
    return NextResponse.json({ error: 'This student is outside your school scope' }, { status: 403 });
  }

  const studentRowId = await resolveOrCreateStudentRowId(admin as any, studentUserId);
  if (!studentRowId) return NextResponse.json({ error: 'Could not resolve or create a student record' }, { status: 500 });

  try {
    await syncExplicitParentStudentLink(admin as any, parentId, studentRowId);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create link' }, { status: 500 });
  }

  // Denormalise the parent onto the student registry so school-scoped lists show them.
  await admin.from('students').update({
    parent_email: (parent as any).email ?? null,
    parent_name: (parent as any).full_name ?? null,
    parent_phone: (parent as any).phone ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', studentRowId);

  try {
    await (admin as any).from('parent_claim_audit').insert({
      student_id: studentUserId,
      parent_id: parentId,
      email: (parent as any).email ?? null,
      phone: (parent as any).phone ?? null,
      action: 'linked',
      note: `manual link by ${(profile as any).school_name || 'staff'}`,
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ success: true });
}

// DELETE /api/parent-claim/links  Body: { linkId? , parentId?, studentUserId? }  — unlink.
export async function DELETE(req: NextRequest) {
  const guard = await requireStaff();
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { admin, profile } = guard;

  const body = await req.json().catch(() => ({}));
  const linkId: string | null = body.linkId || null;
  const parentId: string | null = body.parentId || null;
  let studentRowId: string | null = null;

  // Resolve the target link row (and its student) so we can scope-check it.
  let link: any = null;
  if (linkId) {
    const { data } = await admin.from('parent_student_links').select('id, parent_id, student_id').eq('id', linkId).maybeSingle();
    link = data;
  } else if (parentId && body.studentUserId) {
    studentRowId = await resolveOrCreateStudentRowId(admin as any, (body.studentUserId as string).trim());
    if (studentRowId) {
      const { data } = await admin.from('parent_student_links').select('id, parent_id, student_id').eq('parent_id', parentId).eq('student_id', studentRowId).maybeSingle();
      link = data;
    }
  }
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  // Scope check via the student's school.
  const { data: srow } = await admin.from('students').select('school_id, school_name, parent_email').eq('id', link.student_id).maybeSingle();
  if (!inScope(profile, (srow as any)?.school_id ?? null, (srow as any)?.school_name ?? null)) {
    return NextResponse.json({ error: 'This student is outside your school scope' }, { status: 403 });
  }

  const { error } = await admin.from('parent_student_links').delete().eq('id', link.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear the parent denorm on the student only if it belonged to THIS parent (avoid
  // wiping another co-parent's details).
  const { data: parent } = await admin.from('portal_users').select('email').eq('id', link.parent_id).maybeSingle();
  const parentEmail = (parent as any)?.email?.toLowerCase();
  if (parentEmail && (srow as any)?.parent_email?.toLowerCase() === parentEmail) {
    await admin.from('students').update({ parent_email: null, parent_name: null, parent_phone: null, updated_at: new Date().toISOString() }).eq('id', link.student_id);
  }

  try {
    await (admin as any).from('parent_claim_audit').insert({
      student_id: null, parent_id: link.parent_id, email: parentEmail ?? null,
      action: 'unlinked', note: `manual unlink by ${(profile as any).school_name || 'staff'}`,
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ success: true });
}
