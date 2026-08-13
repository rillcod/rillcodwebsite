import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db: any = createAdminClient();
  const { data: profile, error: profileError } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }
  const url = new URL(req.url);
  const termIdParam = url.searchParams.get('term_id');
  const classIdParam = url.searchParams.get('class_id');
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
  const termId = termIdParam || await resolveAssignmentTermId(db, { classId: classIdParam });

  // Resolve allowed exam IDs first so we never page a global CBT queue then filter.
  let examIds: string[] | null = null;
  if (profile.role === 'school') {
    if (!profile.school_id) {
      return NextResponse.json({ data: [], scope: { term_id: termId, term_label: null, class_id: classIdParam, class_name: null } });
    }
    let examQ = db.from('cbt_exams').select('id').eq('school_id', profile.school_id);
    if (termId) examQ = examQ.eq('term_id', termId);
    if (classIdParam) examQ = examQ.eq('class_id', classIdParam);
    const { data: exams, error: examsError } = await examQ.limit(2000);
    if (examsError) return NextResponse.json({ error: examsError.message }, { status: 500 });
    examIds = (exams ?? []).map((e: { id: string }) => e.id);
  } else if (profile.role === 'teacher') {
    const [{ data: classes, error: classesError }, schoolIds] = await Promise.all([
      db.from('classes').select('id').eq('teacher_id', user.id),
      getTeacherSchoolIds(user.id, profile.school_id, db),
    ]);
    if (classesError) return NextResponse.json({ error: classesError.message }, { status: 500 });
    const classIds = (classes ?? []).map((row: { id: string }) => row.id);
    let examQ = db.from('cbt_exams').select('id, created_by, class_id, school_id, metadata');
    if (termId) examQ = examQ.eq('term_id', termId);
    if (classIdParam) examQ = examQ.eq('class_id', classIdParam);
    const { data: exams, error: examsError } = await examQ.limit(2000);
    if (examsError) return NextResponse.json({ error: examsError.message }, { status: 500 });
    const classSet = new Set(classIds);
    const schoolSet = new Set(schoolIds);
    examIds = (exams ?? [])
      .filter((exam: any) => {
        if (exam.created_by === user.id) return true;
        if (exam.class_id) return classSet.has(exam.class_id);
        return !!exam.school_id && schoolSet.has(exam.school_id);
      })
      .map((exam: any) => exam.id as string);
  }

  if (examIds && examIds.length === 0) {
    return NextResponse.json({
      data: [],
      scope: { term_id: termId, term_label: null, class_id: classIdParam, class_name: null },
    });
  }

  let query = db.from('cbt_sessions').select(`
    id,exam_id,user_id,status,score,needs_grading,end_time,
    portal_users!cbt_sessions_user_id_fkey(id,full_name,email,school_id,school_name),
    cbt_exams(id,title,class_id,school_id,created_by,course_id,term_id,metadata,
      classes!cbt_exams_class_id_fkey(id, name))
  `).eq('needs_grading', true).order('end_time', { ascending: true }).range(offset, offset + limit - 1);
  if (examIds) query = query.in('exam_id', examIds);
  else if (termId) query = query.eq('cbt_exams.term_id', termId);
  if (classIdParam && !examIds) query = query.eq('cbt_exams.class_id', classIdParam);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let rows = data ?? [];

  let scopeLabel: string | null = null;
  if (termId) {
    const { data: termRow } = await db.from('academic_terms').select('academic_year, term_label').eq('id', termId).maybeSingle();
    if (termRow) scopeLabel = `${termRow.term_label} ${termRow.academic_year}`.trim();
  }
  let classLabel: string | null = null;
  if (classIdParam) {
    const { data: classRow } = await db.from('classes').select('name').eq('id', classIdParam).maybeSingle();
    classLabel = classRow?.name ?? null;
  }

  const cbtSchoolIds = [...new Set(rows.map((r: any) => {
    const exam = Array.isArray(r.cbt_exams) ? r.cbt_exams[0] : r.cbt_exams;
    return r.portal_users?.school_id || exam?.school_id;
  }).filter(Boolean))];

  const cbtSchoolMap = new Map<string, string>();
  if (cbtSchoolIds.length > 0) {
    const { data: schoolRows, error: schoolRowsError } = await db.from('schools').select('id, name').in('id', cbtSchoolIds);
    if (schoolRowsError) return NextResponse.json({ error: schoolRowsError.message }, { status: 500 });
    (schoolRows ?? []).forEach((s: any) => { if (s.id && s.name) cbtSchoolMap.set(s.id, s.name); });
  }
  rows = rows.map((r: any) => {
    const exam = Array.isArray(r.cbt_exams) ? r.cbt_exams[0] : r.cbt_exams;
    const sid = r.portal_users?.school_id || exam?.school_id;
    const dbSchoolName = sid ? cbtSchoolMap.get(sid) : null;
    const userSchoolName = r.portal_users?.school_name;
    const resolvedName = dbSchoolName || (userSchoolName && userSchoolName !== 'Rillcod Online School (Unassigned)' ? userSchoolName : 'Rillcod Online School');
    return {
      ...r,
      cbt_exams: exam ? {
        ...exam,
        school_name: resolvedName,
      } : null,
    };
  });

  return NextResponse.json({
    data: rows,
    pagination: {
      offset,
      limit,
      returned: rows.length,
      has_more: rows.length === limit,
    },
    scope: {
      term_id: termId,
      term_label: scopeLabel,
      class_id: classIdParam,
      class_name: classLabel,
    },
  });
}
