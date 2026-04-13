import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

  // 2. Fetch Global data for calculations (Assignments in this course)
  const { data: allAssignments } = await admin
    .from('assignments')
    .select('id, max_points')
    .eq('course_id', course_id)
    .eq('is_active', true);
    
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
        admin.from('assignment_submissions').select('grade, assignment_id').eq('portal_user_id', student.id).eq('status', 'graded'),
        // CBT scores
        admin.from('cbt_sessions').select('score, cbt_exams(metadata)').eq('user_id', student.id).order('score', { ascending: false }),
        // Projects
        admin.from('lab_projects').select('id').eq('user_id', student.id),
        admin.from('portfolio_projects').select('id').eq('user_id', student.id),
      ]);

      // CALCULATION LOGIC (Matching the Report Builder pattern)
      
      // Theory (Exam) - 40% - Best CBT score (Examination type)
      const examSessions = (cbtRes.data || []).filter(r => {
        const t = (r.cbt_exams as any)?.metadata?.exam_type;
        return !t || t === 'examination';
      });
      const theoryScore = Math.min(100, examSessions[0]?.score || 0);

      // Practical (Test) - 20% - Average of graded assignments
      const grades = (subRes.data || []).map(s => s.grade).filter(g => g !== null) as number[];
      const asgnAvg = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : 0;
      
      // Practical Evaluation Toggle: Prefer evaluation CBT scores if they exist
      const evalSessions = (cbtRes.data || []).filter(r => (r.cbt_exams as any)?.metadata?.exam_type === 'evaluation');
      const practicalScore = Math.min(100, evalSessions[0]?.score || asgnAvg);

      // Attendance / Continuity - 20% - Assignment completion %
      const gradedCount = subRes.data?.length || 0;
      const attendanceScore = totalAssignmentsCount > 0 
        ? Math.round((gradedCount / totalAssignmentsCount) * 100) 
        : 80; // Default to 80 if no assignments yet

      // Participation (Project Engagement) - 20%
      const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
      const participationScore = Math.min(100, Math.round((projectCount / 3) * 100));

      const overallScore = Math.round(
        (theoryScore * 0.40) + 
        (practicalScore * 0.20) + 
        (attendanceScore * 0.20) + 
        (participationScore * 0.20)
      );

      const reportGrade = (score: number) => {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        if (score >= 50) return 'D';
        return 'F';
      };

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
        attendance_score: attendanceScore,
        participation_score: participationScore,
        overall_score: overallScore,
        overall_grade: reportGrade(overallScore),
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
