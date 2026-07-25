import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const role = profile?.role;
  if (!['admin', 'teacher', 'school'].includes(String(role))) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }
  if (role === 'school' && !profile?.school_id) {
    return NextResponse.json({ error: 'School account is missing school scope' }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const assignmentId = url.searchParams.get('assignment_id');
  const classIdParam = url.searchParams.get('class_id');
  const status = url.searchParams.get('status') ?? 'actionable';
  const termIdParam = url.searchParams.get('term_id');
  const allSessions = url.searchParams.get('all_sessions') === '1';

  let query = supabase
    .from('assignment_submissions')
    .select(`
      *,
      portal_users!assignment_submissions_portal_user_id_fkey(full_name, email, section_class, school_id, school_name),
      assignments!assignment_id(
        title, grading_mode, assignment_type, max_points, class_id, school_id, created_by, term_id, course_id,
        description, instructions, metadata,
        classes!assignments_class_id_fkey(id, name, term_id),
        courses!assignments_course_id_fkey(id, title)
      )
    `)
    .order('submitted_at', { ascending: false })
    .limit(40);

  // SQL-first isolation: never fetch a global page then hope post-filter keeps enough rows.
  if (role !== 'admin') {
    const { listManageableAssignmentIds } = await import('@/lib/assignments/authz');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const ids = await listManageableAssignmentIds(admin as any, {
      id: user.id,
      role: String(role),
      school_id: profile?.school_id ?? null,
    }, { classId: classIdParam, termId: null });
    if (ids === 'all') {
      /* admin path unused here */
    } else if (!ids.length) {
      return NextResponse.json({
        data: [],
        nextCursor: null,
        scope: { term_id: null, term_label: null, class_id: classIdParam, class_name: null },
      });
    } else {
      query = query.in('assignment_id', ids);
    }
  }

  if (status === 'actionable') query = query.in('status', ['submitted', 'late', 'pending_review']);
  else if (status !== 'all') query = query.eq('status', status);
  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (cursor) query = query.lt('submitted_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (role === 'teacher') {
    const [{ data: ownedClasses }, { data: schoolLinks }] = await Promise.all([
      supabase.from('classes').select('id').eq('teacher_id', user.id),
      supabase.from('teacher_schools').select('school_id').eq('teacher_id', user.id),
    ]);
    const classIds = new Set((ownedClasses ?? []).map((row: any) => row.id));
    const schoolIds = new Set([profile?.school_id, ...(schoolLinks ?? []).map((row: any) => row.school_id)].filter(Boolean));
    rows = rows.filter((row: any) => {
      const assignment = row.assignments;
      if (!assignment) return false;
      if (assignment.created_by === user.id) return true;
      const target = assignment.metadata?.target_class_id || assignment.class_id || null;
      if (target) return classIds.has(target);
      return !!assignment.school_id && schoolIds.has(assignment.school_id);
    });
  } else if (role === 'school') {
    rows = rows.filter((row: any) => row.assignments?.school_id === profile?.school_id);
  }
  let resolvedTermId = termIdParam;
  if (!allSessions) {
    const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
    resolvedTermId = resolvedTermId || await resolveAssignmentTermId(supabase as any, { classId: classIdParam });
    if (resolvedTermId) {
      const liveId = await resolveAssignmentTermId(supabase as any, {});
      rows = rows.filter((row: any) => {
        const asnTerm = row.assignments?.term_id ?? null;
        if (asnTerm === resolvedTermId) return true;
        return !asnTerm && resolvedTermId === liveId;
      });
    }
  }
  if (classIdParam) {
    rows = rows.filter((row: any) => row.assignments?.class_id === classIdParam);
  }
  rows = rows.slice(0, 20);

  let scopeLabel: string | null = null;
  if (resolvedTermId) {
    const { data: termRow } = await supabase
      .from('academic_terms')
      .select('academic_year, term_label')
      .eq('id', resolvedTermId)
      .maybeSingle();
    if (termRow) {
      scopeLabel = `${termRow.term_label} ${termRow.academic_year}`.trim();
    }
  }
  let classLabel: string | null = null;
  if (classIdParam) {
    const { data: classRow } = await supabase.from('classes').select('name').eq('id', classIdParam).maybeSingle();
    classLabel = classRow?.name ?? null;
  }

  // Resolve school names for returned submissions — prioritize the student's own school (portal_users.school_id)
  const schoolIds = [...new Set(rows.map((r: any) => r.portal_users?.school_id || r.assignments?.school_id).filter(Boolean))];
  const schoolMap = new Map<string, string>();
  if (schoolIds.length > 0) {
    const { data: schoolRows } = await supabase.from('schools').select('id, name').in('id', schoolIds);
    (schoolRows ?? []).forEach((s: any) => { if (s.id && s.name) schoolMap.set(s.id, s.name); });
  }
  rows = rows.map((r: any) => {
    const sid = r.portal_users?.school_id || r.assignments?.school_id;
    const dbSchoolName = sid ? schoolMap.get(sid) : null;
    const userSchoolName = r.portal_users?.school_name;
    const resolvedName = dbSchoolName || (userSchoolName && userSchoolName !== 'Rillcod Online School (Unassigned)' ? userSchoolName : 'Rillcod Online School');
    return {
      ...r,
      assignments: r.assignments ? {
        ...r.assignments,
        school_name: resolvedName,
      } : null,
    };
  });

  const nextCursor = rows.length === 20 ? rows[rows.length - 1].submitted_at : null;
  return NextResponse.json({
    data: rows,
    nextCursor,
    scope: {
      term_id: resolvedTermId,
      term_label: scopeLabel,
      class_id: classIdParam,
      class_name: classLabel,
    },
  });
}
