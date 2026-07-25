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
  const { data: profile } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  if (!profile || !['admin','teacher','school'].includes(profile.role)) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }
  const url = new URL(req.url);
  const termIdParam = url.searchParams.get('term_id');
  const classIdParam = url.searchParams.get('class_id');
  const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
  const termId = termIdParam || await resolveAssignmentTermId(db, { classId: classIdParam });
  let query = db.from('cbt_sessions').select(`
    id,exam_id,user_id,status,score,needs_grading,end_time,
    portal_users!cbt_sessions_user_id_fkey(id,full_name,email,school_id),
    cbt_exams(id,title,class_id,school_id,created_by,course_id,term_id,metadata,
      classes!cbt_exams_class_id_fkey(id, name))
  `).eq('needs_grading', true).order('end_time', { ascending: true }).limit(80);
  if (termId) query = query.eq('cbt_exams.term_id', termId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let rows = data ?? [];
  if (profile.role === 'teacher') {
    const [{ data: classes }, schoolIds] = await Promise.all([
      db.from('classes').select('id').eq('teacher_id', user.id),
      getTeacherSchoolIds(user.id, profile.school_id),
    ]);
    const classIds = new Set((classes ?? []).map((row: any) => row.id));
    const schools = new Set(schoolIds);
    rows = rows.filter((row: any) => {
      const exam = Array.isArray(row.cbt_exams) ? row.cbt_exams[0] : row.cbt_exams;
      if (!exam) return false;
      if (exam.created_by === user.id) return true;
      if (exam.class_id) return classIds.has(exam.class_id);
      return !!exam.school_id && schools.has(exam.school_id);
    });
  } else if (profile.role === 'school') {
    rows = rows.filter((row: any) => {
      const exam = Array.isArray(row.cbt_exams) ? row.cbt_exams[0] : row.cbt_exams;
      return exam?.school_id === profile.school_id;
    });
  }
  if (classIdParam) {
    rows = rows.filter((row: any) => {
      const exam = Array.isArray(row.cbt_exams) ? row.cbt_exams[0] : row.cbt_exams;
      return exam?.class_id === classIdParam;
    });
  }

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

  // Resolve school names for returned CBT sessions — prioritize student's own school
  const cbtSchoolIds = [...new Set(rows.map((r: any) => {
    const exam = Array.isArray(r.cbt_exams) ? r.cbt_exams[0] : r.cbt_exams;
    return r.portal_users?.school_id || exam?.school_id;
  }).filter(Boolean))];

  const cbtSchoolMap = new Map<string, string>();
  if (cbtSchoolIds.length > 0) {
    const { data: schoolRows } = await db.from('schools').select('id, name').in('id', cbtSchoolIds);
    (schoolRows ?? []).forEach((s: any) => { if (s.id && s.name) cbtSchoolMap.set(s.id, s.name); });
  }
  rows = rows.map((r: any) => {
    const exam = Array.isArray(r.cbt_exams) ? r.cbt_exams[0] : r.cbt_exams;
    const sid = r.portal_users?.school_id || exam?.school_id;
    const resolvedName = sid ? (cbtSchoolMap.get(sid) ?? 'Rillcod Online School') : 'Rillcod Online School';
    return {
      ...r,
      cbt_exams: exam ? {
        ...exam,
        school_name: resolvedName,
      } : null,
    };
  });

  return NextResponse.json({
    data: rows.slice(0, 40),
    scope: {
      term_id: termId,
      term_label: scopeLabel,
      class_id: classIdParam,
      class_name: classLabel,
    },
  });
}