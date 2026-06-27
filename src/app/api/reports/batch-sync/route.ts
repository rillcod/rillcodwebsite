import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { computeWeightedScore, getWAECGrade } from '@/lib/grading';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, full_name, school_name')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'teacher')) return null;
  return profile;
}

async function getTeacherSchoolIds(admin: ReturnType<typeof createClient>, teacherId: string, fallbackSchoolId: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

const FINAL_CBT_STATUSES = new Set(['completed', 'passed', 'failed']);
const cbtExamType = (row: any) => String(row?.cbt_exams?.metadata?.exam_type ?? 'examination').toLowerCase();
const isReadyCbt = (row: any) => row?.score != null && !row?.needs_grading && FINAL_CBT_STATUSES.has(String(row?.status ?? '').toLowerCase());
const topCbtScore = (rows: any[], courseId: string, kind: 'examination' | 'evaluation') => Math.min(100, rows
  .filter(isReadyCbt)
  .filter((row) => row?.cbt_exams?.course_id === courseId)
  .filter((row) => kind === 'evaluation' ? cbtExamType(row) === 'evaluation' : cbtExamType(row) !== 'evaluation')
  .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))[0]?.score ?? 0);
const assignmentPct = (row: any) => {
  const grade = Number(row?.grade ?? 0);
  const max = Number(row?.assignments?.max_points ?? 100) || 100;
  return Math.max(0, Math.min(100, Math.round((grade / max) * 100)));
};

export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    school_id,
    school_name,
    class_name,
    class_id,
    course_id,
    course_name,
    report_term,
    report_date,
    instructor_name,
    publish_immediately = false
  } = body;

  if (!course_id || !report_term || !report_date) {
    return NextResponse.json({ error: 'Missing required configuration (Course, Term, or Date)' }, { status: 400 });
  }

  const admin = adminClient();
  const teacherSchoolIds =
    caller.role === 'teacher'
      ? await getTeacherSchoolIds(admin as any, caller.id, caller.school_id ?? null)
      : [];

  if (caller.role === 'teacher' && teacherSchoolIds.length === 0) {
    return NextResponse.json({ error: 'No school scope assigned for this teacher' }, { status: 403 });
  }
  
  // 1. Fetch Students in the specified School/Class
  let studentQuery = admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, class_id')
    .eq('role', 'student')
    .eq('is_deleted', false);

  if (class_id) {
    studentQuery = studentQuery.eq('class_id', class_id);
  } else if (class_name) {
    studentQuery = studentQuery.eq('section_class', class_name);
  }

  if (caller.role === 'teacher') {
    studentQuery = studentQuery.in('school_id', teacherSchoolIds);
    if (school_id && !teacherSchoolIds.includes(school_id)) {
      return NextResponse.json({ error: 'Forbidden school scope' }, { status: 403 });
    }
    if (school_id) studentQuery = studentQuery.eq('school_id', school_id);
  } else if (school_id) {
    studentQuery = studentQuery.eq('school_id', school_id);
  } else if (school_name) {
    studentQuery = studentQuery.eq('school_name', school_name);
  }

  const { data: students, error: studentError } = await studentQuery;
  
  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 });
  if (!students || students.length === 0) {
    return NextResponse.json({ error: 'No students found for the selected class' }, { status: 404 });
  }

  // 2. Fetch Global data for calculations (Assignments in this course/school)
  let assignmentQuery = admin
    .from('assignments')
    .select('id, max_points')
    .eq('course_id', course_id)
    .eq('is_active', true);
  if (caller.role === 'teacher') {
    assignmentQuery = assignmentQuery.in('school_id', teacherSchoolIds) as typeof assignmentQuery;
  } else if (school_id) {
    assignmentQuery = assignmentQuery.eq('school_id', school_id) as typeof assignmentQuery;
  }
  const { data: allAssignments } = await assignmentQuery;
    
  const totalAssignmentsCount = allAssignments?.length || 0;

  // 3. Process each student
  const results = [];
  for (const student of students) {
    try {
      // Parallel fetch student-specific data
      const [attRes, subRes, cbtRes, labRes, portfolioRes] = await Promise.all([
        // Attendance
        admin.from('attendance').select('id, status').eq('user_id', student.id).eq('status', 'present'),
        // Graded Submissions
        admin.from('assignment_submissions').select('grade, assignment_id, assignments!inner(course_id, assignment_type, max_points)').eq('portal_user_id', student.id).eq('status', 'graded').eq('assignments.course_id', course_id),
        // CBT scores
        admin.from('cbt_sessions').select('score, status, needs_grading, cbt_exams(course_id, metadata)').eq('user_id', student.id).order('score', { ascending: false }),
        // Projects
        admin.from('lab_projects').select('id').eq('user_id', student.id),
        admin.from('portfolio_projects').select('id').eq('user_id', student.id),
      ]);

      // CALCULATION LOGIC (Matching the Report Builder's 6-component WAEC pattern)
      
      // Theory / Written Tests - 20% - Best CBT examination score
      const theoryScore = topCbtScore(cbtRes.data || [], course_id, 'examination');

      // Classwork - 10% - current proxy: graded homework/classwork average
      const grades = (subRes.data || []).filter((s: any) => s.grade != null).map(assignmentPct) as number[];
      const asgnAvg = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : 0;
      const classworkScore = asgnAvg;
      
      // Practical / Projects - 25%
      const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
      const practicalScore = Math.min(100, Math.round((projectCount / 3) * 100));

      // Assignments Submitted - 20%
      const gradedCount = subRes.data?.length || 0;
      const assignmentScore = totalAssignmentsCount > 0
        ? Math.round((gradedCount / totalAssignmentsCount) * 100) 
        : 80; // Default to 80 if no assignments yet

      // Attendance - 10%
      const attendanceScore = attRes.data?.length ? Math.min(100, attRes.data.length * 10) : 0;

      // Mid-term Assessment - 15% - best CBT evaluation score
      const assessmentScore = topCbtScore(cbtRes.data || [], course_id, 'evaluation') || asgnAvg;

      const overallScore = computeWeightedScore({
        theory: theoryScore,
        classwork: classworkScore,
        practical: practicalScore,
        assignments: assignmentScore,
        attendance: attendanceScore,
        assessment: assessmentScore,
      });
      const reportGrade = getWAECGrade(overallScore).code;

      const payload = {
        student_id: student.id,
        teacher_id: caller.id,
        school_id: student.school_id,
        school_name: student.school_name || school_name,
        section_class: student.section_class || class_name,
        course_id: course_id,
        course_name: course_name,
        report_term: report_term,
        report_date: report_date,
        instructor_name: instructor_name || caller.full_name,
        theory_score: theoryScore,
        practical_score: practicalScore,
        attendance_score: assignmentScore,
        participation_score: attendanceScore,
        engagement_metrics: { classwork_score: classworkScore, assessment_score: assessmentScore },
        overall_score: overallScore,
        overall_grade: reportGrade,
        is_published: publish_immediately,
        updated_at: new Date().toISOString(),
      };

      // Check for existing report to update
      const { data: existing } = await admin
        .from('student_progress_reports')
        .select('id')
        .eq('student_id', student.id)
        .eq('course_id', course_id)
        .eq('report_term', report_term)
        .maybeSingle();

      if (existing) {
        await admin.from('student_progress_reports').update(payload).eq('id', existing.id);
      } else {
        await admin.from('student_progress_reports').insert(payload);
      }
      
      results.push({ student: student.full_name, status: 'success' });
    } catch (err: any) {
      results.push({ student: student.full_name, status: 'error', message: err.message });
    }
  }

  return NextResponse.json({ 
    message: `Processed ${students.length} students`,
    results 
  });
}
