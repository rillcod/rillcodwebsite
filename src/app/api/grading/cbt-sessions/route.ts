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
  const termId = url.searchParams.get('term_id');
  let query = db.from('cbt_sessions').select(`
    id,exam_id,user_id,status,score,needs_grading,end_time,
    portal_users!cbt_sessions_user_id_fkey(id,full_name,email,school_id),
    cbt_exams(id,title,class_id,school_id,created_by,course_id,term_id,metadata)
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
  return NextResponse.json({ data: rows.slice(0, 40) });
}