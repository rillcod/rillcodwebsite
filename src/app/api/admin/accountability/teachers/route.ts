import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';

export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfiguration: SUPABASE keys not set');
  return createClient<Database>(url, key);
}

async function assertAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: caller } = await supabase.from('portal_users').select('role').eq('id', user.id).maybeSingle();
  if (!roleHasCapability(caller?.role, 'view_accountability')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export type TeacherClassDetail = {
  class_id: string;
  class_name: string;
  school_name: string | null;
  true_students: number;
  reports_total: number;
  published: number;
  drafts: number;
  missing: number;
  completion_pct: number;
  published_pct: number;
  status: 'complete' | 'drafts' | 'incomplete' | 'empty';
  students: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    report_status: 'published' | 'draft' | 'missing';
    overall_grade: string | null;
    published_at: string | null;
  }>;
};

export type TeacherWorkloadCard = {
  teacher_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  school_name: string | null;
  class_count: number;
  true_students: number;
  reports_total: number;
  published: number;
  drafts: number;
  missing: number;
  completion_pct: number;
  published_pct: number;
  all_classes_complete: boolean;
  all_published: boolean;
  has_true_students: boolean;
  status: 'complete' | 'drafts' | 'incomplete' | 'no_students' | 'no_classes';
  courses: string[];
  classes: TeacherClassDetail[];
};

/**
 * GET /api/admin/accountability/teachers
 * Per-teacher workload: classes owned, true roster students, report completeness & publish state.
 */
export async function GET() {
  const authErr = await assertAdmin();
  if (authErr) return authErr;

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }

  const { data: term } = await db
    .from('academic_terms')
    .select('id, academic_year, term_label')
    .eq('is_current', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: teachers, error: teacherErr } = await db
    .from('portal_users')
    .select('id, full_name, email, is_active, school_name, school_id')
    .eq('role', 'teacher')
    .order('full_name');

  if (teacherErr) {
    return NextResponse.json({ error: teacherErr.message }, { status: 500 });
  }

  const teacherList = teachers ?? [];
  if (teacherList.length === 0) {
    return NextResponse.json({
      term_context: term,
      teachers: [] as TeacherWorkloadCard[],
      summary: { teachers: 0, complete: 0, drafts: 0, incomplete: 0, no_students: 0, no_classes: 0 },
    }, NO_STORE);
  }

  const teacherIds = teacherList.map((t) => t.id);

  const { data: classes } = await db
    .from('classes')
    .select('id, name, teacher_id, school_id, status, schools(name)')
    .in('teacher_id', teacherIds);

  const classList = (classes ?? []).filter((c) => {
    const status = (c.status || 'active').toLowerCase();
    return status !== 'archived' && status !== 'deleted' && status !== 'inactive';
  });
  const classIds = classList.map((c) => c.id);

  // Active-term roster for those classes
  let rosterRows: Array<{ class_id: string; student_id: string; status: string | null }> = [];
  if (classIds.length > 0) {
    let q = db
      .from('class_term_rosters')
      .select('class_id, student_id, status')
      .in('class_id', classIds);
    if (term?.id) q = q.or(`term_id.eq.${term.id},term_id.is.null`);
    const { data } = await q;
    rosterRows = (data ?? []).filter(
      (r) => !['removed', 'ended', 'withdrawn'].includes(String(r.status || 'active').toLowerCase()),
    );
  }

  const studentIds = [...new Set(rosterRows.map((r) => r.student_id))];

  const studentMap = new Map<string, { id: string; full_name: string | null; email: string | null; is_active: boolean; enrollment_type: string | null }>();
  if (studentIds.length > 0) {
    // Chunk to avoid URL limits
    for (let i = 0; i < studentIds.length; i += 200) {
      const chunk = studentIds.slice(i, i + 200);
      const { data } = await db
        .from('portal_users')
        .select('id, full_name, email, is_active, enrollment_type, role')
        .in('id', chunk)
        .eq('role', 'student');
      for (const s of data ?? []) {
        studentMap.set(s.id, {
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          is_active: !!s.is_active,
          enrollment_type: s.enrollment_type,
        });
      }
    }
  }

  // Current-term reports for roster students (any teacher_id — we attribute by class ownership + report teacher)
  type ReportRow = {
    id: string;
    student_id: string;
    teacher_id: string | null;
    class_id: string | null;
    course_name: string | null;
    is_published: boolean | null;
    overall_grade: string | null;
    published_at: string | null;
  };
  const reports: ReportRow[] = [];
  if (studentIds.length > 0) {
    for (let i = 0; i < studentIds.length; i += 200) {
      const chunk = studentIds.slice(i, i + 200);
      let rq = db
        .from('student_progress_reports')
        .select('id, student_id, teacher_id, class_id, course_name, is_published, overall_grade, published_at')
        .in('student_id', chunk);
      if (term?.id) rq = rq.or(`term_id.eq.${term.id},term_id.is.null`);
      const { data } = await rq;
      for (const r of data ?? []) reports.push(r as ReportRow);
    }
  }

  // Also pull reports authored by these teachers (covers students not on their roster but they still wrote)
  for (let i = 0; i < teacherIds.length; i += 50) {
    const chunk = teacherIds.slice(i, i + 50);
    let rq = db
      .from('student_progress_reports')
      .select('id, student_id, teacher_id, class_id, course_name, is_published, overall_grade, published_at')
      .in('teacher_id', chunk);
    if (term?.id) rq = rq.or(`term_id.eq.${term.id},term_id.is.null`);
    const { data } = await rq;
    const seen = new Set(reports.map((r) => r.id));
    for (const r of data ?? []) {
      if (!seen.has(r.id)) reports.push(r as ReportRow);
    }
  }

  const schoolNameById = new Map<string, string>();
  for (const c of classList) {
    const school = Array.isArray(c.schools) ? c.schools[0] : c.schools;
    if (c.school_id && school && typeof school === 'object' && 'name' in school && school.name) {
      schoolNameById.set(c.school_id, String(school.name));
    }
  }

  const isTrueStudent = (id: string) => {
    const s = studentMap.get(id);
    if (!s) return false;
    if (!s.is_active) return false;
    if (String(s.enrollment_type || '').toLowerCase() === 'withdrawn') return false;
    return true;
  };

  const pickBestReport = (rows: ReportRow[]) => {
    if (rows.length === 0) return null;
    const published = rows.filter((r) => r.is_published);
    if (published.length) {
      return published.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))[0];
    }
    return rows[0];
  };

  const cards: TeacherWorkloadCard[] = teacherList.map((teacher) => {
    const ownedClasses = classList.filter((c) => c.teacher_id === teacher.id);
    const classDetails: TeacherClassDetail[] = ownedClasses.map((klass) => {
      const school = Array.isArray(klass.schools) ? klass.schools[0] : klass.schools;
      const schoolName = (school && typeof school === 'object' && 'name' in school)
        ? String(school.name)
        : schoolNameById.get(klass.school_id) || null;

      const rosterStudentIds = rosterRows
        .filter((r) => r.class_id === klass.id)
        .map((r) => r.student_id)
        .filter(isTrueStudent);

      const uniqueStudents = [...new Set(rosterStudentIds)];
      const students = uniqueStudents.map((sid) => {
        const profile = studentMap.get(sid)!;
        const studentReports = reports.filter(
          (r) =>
            r.student_id === sid &&
            (r.class_id === klass.id || r.teacher_id === teacher.id || !r.class_id),
        );
        // Prefer report tied to this class, else any by this teacher for student
        const classScoped = studentReports.filter((r) => r.class_id === klass.id);
        const teacherScoped = studentReports.filter((r) => r.teacher_id === teacher.id);
        const best = pickBestReport(classScoped.length ? classScoped : teacherScoped.length ? teacherScoped : studentReports);
        let report_status: 'published' | 'draft' | 'missing' = 'missing';
        if (best?.is_published) report_status = 'published';
        else if (best) report_status = 'draft';
        return {
          id: sid,
          full_name: profile.full_name,
          email: profile.email,
          report_status,
          overall_grade: best?.overall_grade ?? null,
          published_at: best?.published_at ?? null,
        };
      });

      const published = students.filter((s) => s.report_status === 'published').length;
      const drafts = students.filter((s) => s.report_status === 'draft').length;
      const missing = students.filter((s) => s.report_status === 'missing').length;
      const true_students = students.length;
      const reports_total = published + drafts;
      const completion_pct = true_students > 0
        ? Math.round(((published + drafts) / true_students) * 100)
        : 0;
      const published_pct = true_students > 0
        ? Math.round((published / true_students) * 100)
        : 0;

      let status: TeacherClassDetail['status'] = 'empty';
      if (true_students === 0) status = 'empty';
      else if (missing === 0 && drafts === 0) status = 'complete';
      else if (missing === 0 && drafts > 0) status = 'drafts';
      else status = 'incomplete';

      return {
        class_id: klass.id,
        class_name: klass.name,
        school_name: schoolName,
        true_students,
        reports_total,
        published,
        drafts,
        missing,
        completion_pct,
        published_pct,
        status,
        students: students.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
      };
    }).sort((a, b) => a.class_name.localeCompare(b.class_name));

    const true_students = classDetails.reduce((s, c) => s + c.true_students, 0);
    const published = classDetails.reduce((s, c) => s + c.published, 0);
    const drafts = classDetails.reduce((s, c) => s + c.drafts, 0);
    const missing = classDetails.reduce((s, c) => s + c.missing, 0);
    const reports_total = published + drafts;
    const completion_pct = true_students > 0 ? Math.round(((published + drafts) / true_students) * 100) : 0;
    const published_pct = true_students > 0 ? Math.round((published / true_students) * 100) : 0;
    const all_classes_complete = classDetails.length > 0
      && classDetails.every((c) => c.status === 'complete' || c.status === 'empty')
      && classDetails.some((c) => c.status === 'complete');
    const all_published = true_students > 0 && missing === 0 && drafts === 0;
    const has_true_students = true_students > 0;

    const courses = [...new Set(
      reports
        .filter((r) => r.teacher_id === teacher.id && r.course_name)
        .map((r) => String(r.course_name)),
    )].sort();

    let status: TeacherWorkloadCard['status'] = 'no_classes';
    if (classDetails.length === 0) status = 'no_classes';
    else if (!has_true_students) status = 'no_students';
    else if (all_published) status = 'complete';
    else if (missing === 0 && drafts > 0) status = 'drafts';
    else status = 'incomplete';

    return {
      teacher_id: teacher.id,
      full_name: teacher.full_name,
      email: teacher.email,
      is_active: !!teacher.is_active,
      school_name: teacher.school_name || (teacher.school_id ? schoolNameById.get(teacher.school_id) || null : null),
      class_count: classDetails.length,
      true_students,
      reports_total,
      published,
      drafts,
      missing,
      completion_pct,
      published_pct,
      all_classes_complete: all_classes_complete && all_published,
      all_published,
      has_true_students,
      status,
      courses,
      classes: classDetails,
    };
  });

  // Teachers with work first, then alphabetical
  const statusRank: Record<TeacherWorkloadCard['status'], number> = {
    incomplete: 0,
    drafts: 1,
    no_students: 2,
    no_classes: 3,
    complete: 4,
  };
  cards.sort((a, b) => {
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const summary = {
    teachers: cards.length,
    complete: cards.filter((c) => c.status === 'complete').length,
    drafts: cards.filter((c) => c.status === 'drafts').length,
    incomplete: cards.filter((c) => c.status === 'incomplete').length,
    no_students: cards.filter((c) => c.status === 'no_students').length,
    no_classes: cards.filter((c) => c.status === 'no_classes').length,
  };

  return NextResponse.json({
    term_context: term,
    teachers: cards,
    summary,
    generated_at: new Date().toISOString(),
  }, NO_STORE);
}
