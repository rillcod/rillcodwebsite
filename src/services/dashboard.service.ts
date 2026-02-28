import { createClient } from '@/lib/supabase/client';

const db = () => createClient();

// ── ASSIGNMENTS ───────────────────────────────────────────────
// For teachers/admins: all assignments with submission counts
export async function fetchAssignments(teacherId?: string) {
    let q = db()
        .from('assignments')
        .select(`
      id, title, description, instructions, due_date, max_points,
      assignment_type, is_active, created_at, created_by,
      courses ( id, title, teacher_id, programs ( name ) ),
      assignment_submissions ( id, status, grade )
    `)
        .order('due_date', { ascending: true });

    // Scope to teacher's own assignments
    if (teacherId) {
        q = (q as any).eq('created_by', teacherId);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
}

// For students: their submissions with assignment details
export async function fetchStudentAssignments(portalUserId: string) {
    const { data, error } = await db()
        .from('assignment_submissions')
        .select(`
      id, status, grade, feedback, submitted_at, graded_at, file_url,
      assignments (
        id, title, description, due_date, max_points, assignment_type,
        courses ( title, programs ( name ) )
      )
    `)
        .eq('portal_user_id', portalUserId)
        .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

// ── GRADES ────────────────────────────────────────────────────
// All submissions for grading (teachers/admins)
export async function fetchSubmissionsForGrading(teacherId?: string) {
    let q = db()
        .from('assignment_submissions')
        .select(`
      id, grade, feedback, status, submitted_at, graded_at,
      submission_text, file_url, portal_user_id,
      assignments (
        id, title, max_points, due_date, created_by,
        courses ( title, teacher_id, programs ( name ) )
      ),
      portal_users ( id, full_name, email )
    `)
        .order('submitted_at', { ascending: false });

    // Teachers only see their assigned courses' submissions
    if (teacherId) {
        // Can't filter nested easily — filter in app
    }

    const { data, error } = await q;
    if (error) throw error;

    // If teacher, filter to their assignments
    if (teacherId && data) {
        return data.filter((s: any) =>
            s.assignments?.created_by === teacherId ||
            s.assignments?.courses?.teacher_id === teacherId
        );
    }
    return data ?? [];
}

// Student's own grades
export async function fetchStudentGrades(portalUserId: string) {
    const { data, error } = await db()
        .from('assignment_submissions')
        .select(`
      id, grade, feedback, status, submitted_at, graded_at, portal_user_id,
      assignments (
        id, title, max_points, due_date, assignment_type,
        courses ( title, programs ( name ) )
      )
    `)
        .eq('portal_user_id', portalUserId)
        .order('graded_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

// ── COURSES ───────────────────────────────────────────────────
export async function fetchCourses(teacherId?: string) {
    let q = db()
        .from('courses')
        .select(`
      id, title, description, duration_hours, is_active, teacher_id,
      created_at,
      programs ( id, name, difficulty_level ),
      assignment_submissions ( id )
    `)
        .order('created_at', { ascending: false });

    if (teacherId) q = (q as any).eq('teacher_id', teacherId);
    else q = (q as any).eq('is_active', true);

    const { data, error } = await q;
    if (error) {
        // Fallback if join fails
        const { data: f, error: e2 } = await db()
            .from('courses')
            .select('id, title, description, duration_hours, is_active, program_id, teacher_id, created_at')
            .order('created_at', { ascending: false });
        if (e2) throw e2;
        return f ?? [];
    }
    return data ?? [];
}

export async function fetchStudentCourses(portalUserId: string) {
    const { data, error } = await db()
        .from('enrollments')
        .select(`
      id, status, enrollment_date, grade, progress_pct,
      programs ( id, name, description, difficulty_level, duration_weeks )
    `)
        .eq('user_id', portalUserId);
    if (error) throw error;
    return data ?? [];
}

// ── CLASSES ───────────────────────────────────────────────────
export async function fetchClasses(teacherId?: string) {
    let q = db()
        .from('classes')
        .select(`
      id, name, description, status, max_students, current_students,
      start_date, end_date, schedule, teacher_id, program_id, created_at,
      programs ( id, name ),
      portal_users!classes_teacher_id_fkey ( id, full_name )
    `)
        .order('created_at', { ascending: false });
    if (teacherId) q = (q as any).eq('teacher_id', teacherId);
    const { data, error } = await q;
    if (error) {
        const { data: f, error: e2 } = await db()
            .from('classes')
            .select('id, name, description, status, max_students, current_students, start_date, schedule, teacher_id, program_id, created_at')
            .order('created_at', { ascending: false });
        if (e2) throw e2;
        return f ?? [];
    }
    return data ?? [];
}

// ── LESSONS ───────────────────────────────────────────────────
export async function fetchLessons(opts: { teacherId?: string; portalUserId?: string; role?: string } = {}) {
    const supabase = db();

    let q = supabase
        .from('lessons')
        .select(`
      id, title, description, lesson_type, status, duration_minutes,
      session_date, video_url, created_by, created_at,
      courses ( id, title, teacher_id, programs ( name ) )
    `)
        .order('created_at', { ascending: false });

    if (opts.teacherId) q = (q as any).eq('created_by', opts.teacherId);

    if (opts.role === 'student' && opts.portalUserId) {
        const { data: enr } = await supabase
            .from('enrollments').select('program_id').eq('user_id', opts.portalUserId);
        const programIds = (enr ?? []).map((e: any) => e.program_id);
        if (programIds.length) {
            const { data: courseData } = await supabase
                .from('courses').select('id').in('program_id', programIds);
            const ids = (courseData ?? []).map((c: any) => c.id);
            if (ids.length) q = (q as any).in('course_id', ids);
        }
    }

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
}

// ── ANALYTICS ─────────────────────────────────────────────────
export async function fetchAnalyticsOverview() {
    const [students, teachers, programs, subs] = await Promise.allSettled([
        db().from('portal_users').select('id, is_active').eq('role', 'student'),
        db().from('portal_users').select('id', { count: 'exact' }).eq('role', 'teacher'),
        db().from('programs').select('id', { count: 'exact' }).eq('is_active', true),
        db().from('assignment_submissions').select('grade').eq('status', 'graded'),
    ]);

    const studentRows = students.status === 'fulfilled' ? (students.value.data ?? []) : [];
    const teacherCount = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
    const programCount = programs.status === 'fulfilled' ? (programs.value.count ?? 0) : 0;
    const grades = subs.status === 'fulfilled'
        ? (subs.value.data ?? []).map((s: any) => s.grade).filter((g: any) => g != null)
        : [];

    const avgProgress = grades.length
        ? Math.round(grades.reduce((a: number, b: number) => a + Number(b), 0) / grades.length)
        : 0;

    return {
        totalStudents: studentRows.length,
        activeStudents: studentRows.filter((s: any) => s.is_active).length,
        totalTeachers: teacherCount,
        totalPrograms: programCount,
        avgProgress,
    };
}

// ── HELPERS ───────────────────────────────────────────────────
export async function fetchTeachers() {
    const { data, error } = await db()
        .from('portal_users')
        .select('id, full_name, email, is_active, created_at')
        .eq('role', 'teacher')
        .order('full_name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchStudents() {
    const { data, error } = await db()
        .from('portal_users')
        .select('id, full_name, email, is_active, school_name, created_at')
        .eq('role', 'student')
        .order('full_name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchPrograms() {
    const { data, error } = await db()
        .from('programs')
        .select('id, name, description, difficulty_level, duration_weeks, max_students, is_active')
        .eq('is_active', true)
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchNotifications(userId: string) {
    const { data, error } = await db()
        .from('notifications')
        .select('id, title, message, type, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) throw error;
    return data ?? [];
}

export async function markNotificationRead(id: string) {
    await db().from('notifications').update({ is_read: true }).eq('id', id);
}

// ── GRADE SUBMISSION ─────────────────────────────────────────
export async function gradeSubmission(
    submissionId: string,
    grade: number,
    feedback: string,
    gradedBy: string,
) {
    const { error } = await db()
        .from('assignment_submissions')
        .update({
            grade,
            feedback,
            status: 'graded',
            graded_by: gradedBy,
            graded_at: new Date().toISOString(),
        })
        .eq('id', submissionId);
    if (error) throw error;
}

// ── SUBMIT ASSIGNMENT ─────────────────────────────────────────
export async function submitAssignment(payload: {
    assignment_id: string;
    portal_user_id: string;
    submission_text?: string;
    file_url?: string;
}) {
    // Upsert — student can resubmit
    const { data, error } = await db()
        .from('assignment_submissions')
        .upsert({
            ...payload,
            submitted_at: new Date().toISOString(),
            status: 'submitted',
        }, { onConflict: 'assignment_id,portal_user_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}
