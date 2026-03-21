import { createClient } from '@/lib/supabase/client';

const db = () => createClient();

// ── ASSIGNMENTS ───────────────────────────────────────────────
// For teachers/admins: all assignments with submission counts
export async function fetchAssignments(opts: { teacherId?: string; schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('assignments')
        .select(`
      id, title, description, instructions, due_date, max_points,
      assignment_type, is_active, created_at, created_by,
      school_id, school_name,
      courses ( id, title, programs ( name ) ),
      assignment_submissions ( id, status, grade )
    `)
        .order('due_date', { ascending: true });

    // Scope to teacher's own assignments
    if (opts.teacherId) {
        q = (q as any).eq('created_by', opts.teacherId);
    }

    const { data, error } = await q;
    if (error) throw error;

    // Filter by school after fetch (courses.school_id or courses.school_name)
    if (data && (opts.schoolId || opts.schoolName)) {
        return data.filter((a: any) => {
            const matchId = opts.schoolId && a.school_id === opts.schoolId;
            const matchName = opts.schoolName && a.school_name === opts.schoolName;
            return matchId || matchName;
        });
    }

    return data ?? [];
}

// For students: their submissions + any unsubmitted assignments for enrolled courses
export async function fetchStudentAssignments(portalUserId: string) {
    const client = db();

    // 1. Get existing submissions
    const { data: subs, error } = await client
        .from('assignment_submissions')
        .select(`
      id, status, grade, feedback, submitted_at, graded_at, file_url, assignment_id,
      assignments (
        id, title, description, due_date, max_points, assignment_type,
        courses ( title, programs ( name ) )
      )
    `)
        .or(`portal_user_id.eq.${portalUserId},user_id.eq.${portalUserId}`)
        .order('submitted_at', { ascending: false });
    if (error) throw error;

    // 2. Find enrolled program IDs
    const { data: enr } = await client
        .from('enrollments').select('program_id').eq('user_id', portalUserId);
    const programIds = (enr ?? []).map((e: any) => e.program_id).filter(Boolean);
    if (!programIds.length) return subs ?? [];

    // 3. Find course IDs for those programs
    const { data: courseRows } = await client
        .from('courses').select('id').in('program_id', programIds);
    const courseIds = (courseRows ?? []).map((c: any) => c.id);
    if (!courseIds.length) return subs ?? [];

    // 4. Fetch all active assignments for enrolled courses
    const { data: allAsgns } = await client
        .from('assignments')
        .select(`id, title, description, due_date, max_points, assignment_type,
          courses ( title, programs ( name ) )`)
        .in('course_id', courseIds)
        .eq('is_active', true)
        .order('due_date', { ascending: true });

    // 5. Add assignments not yet submitted as synthetic "missing" records
    const submittedIds = new Set((subs ?? []).map((s: any) => s.assignment_id ?? s.assignments?.id));
    const unsubmitted = (allAsgns ?? [])
        .filter((a: any) => !submittedIds.has(a.id))
        .map((a: any) => ({
            id: `pending-${a.id}`,
            assignment_id: a.id,
            status: 'missing',
            grade: null,
            feedback: null,
            submitted_at: null,
            graded_at: null,
            file_url: null,
            assignments: a,
        }));

    return [...(subs ?? []), ...unsubmitted];
}

// ── GRADES ────────────────────────────────────────────────────
// All submissions for grading (teachers/admins)
export async function fetchSubmissionsForGrading(opts: { teacherId?: string, schoolId?: string, schoolName?: string } = {}) {
    const client = db();

    // Step 1: Fetch submissions without portal_users join (avoids FK ambiguity)
    const { data: rawSubs, error } = await client
        .from('assignment_submissions')
        .select(`
      id, grade, feedback, status, submitted_at, graded_at,
      submission_text, file_url, portal_user_id, user_id,
      assignments (
        id, title, max_points, due_date, created_by,
        courses ( title, teacher_id, programs ( name ) )
      )
    `)
        .order('submitted_at', { ascending: false });

    if (error) throw error;
    if (!rawSubs || rawSubs.length === 0) return [];

    // Step 2: Collect user IDs (prefer portal_user_id, fall back to user_id)
    const userIds = [...new Set(
        rawSubs.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean)
    )];

    // Step 3: Batch-fetch portal_users for those IDs
    const { data: users } = await client
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name')
        .in('id', userIds);

    const userMap: Record<string, any> = {};
    (users ?? []).forEach((u: any) => { userMap[u.id] = u; });

    // Step 4: Merge
    let result = rawSubs.map((s: any) => ({
        ...s,
        portal_users: userMap[s.portal_user_id ?? s.user_id] ?? null,
    }));

    // Step 5: Filter by school
    if (opts.schoolId || opts.schoolName) {
        result = result.filter((s: any) => {
            const u = s.portal_users;
            if (!u) return false;
            const matchId = opts.schoolId && u.school_id === opts.schoolId;
            const matchName = opts.schoolName && u.school_name === opts.schoolName;
            return matchId || matchName;
        });
    }

    // Step 6: Broadened staff access (RLS will filter what they can see)
    // We removed the strict manual teacherId equality check that was hiding assignments 
    // created by admins but taught by teachers.
    
    return result;
}

// Student's own grades
export async function fetchStudentGrades(portalUserId: string) {
    const { data, error } = await db()
        .from('assignment_submissions')
        .select(`
      id, grade, feedback, status, submitted_at, graded_at, portal_user_id, user_id,
      assignments (
        id, title, max_points, due_date, assignment_type,
        courses ( title, programs ( name ) )
      )
    `)
        // Match on either column — some older submissions use user_id, newer use portal_user_id
        .or(`portal_user_id.eq.${portalUserId},user_id.eq.${portalUserId}`)
        .order('graded_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
}

export async function fetchCourses(teacherId?: string, opts: { schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('courses')
        .select(`
      id, title, description, duration_hours, is_active, teacher_id,
      program_id, school_id, school_name,
      created_at,
      programs ( id, name, difficulty_level ),
      assignment_submissions ( id )
    `)
        .order('created_at', { ascending: false });

    if (teacherId) q = (q as any).eq('teacher_id', teacherId);
    else q = (q as any).eq('is_active', true);

    if (opts.schoolId || opts.schoolName) {
        // Always include global platform courses (school_id IS NULL) alongside school-specific ones
        let filter = 'school_id.is.null';
        if (opts.schoolId) filter += `,school_id.eq.${opts.schoolId}`;
        if (opts.schoolName) filter += `,school_name.eq."${opts.schoolName}"`;
        q = (q as any).or(filter);
    }

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
export async function fetchClasses(teacherId?: string, schoolId?: string) {
    let q = db()
        .from('classes')
        .select(`
      id, name, description, status, max_students, current_students,
      start_date, end_date, schedule, teacher_id, program_id, school_id, created_at,
      programs ( id, name ),
      portal_users!classes_teacher_id_fkey ( id, full_name )
    `)
        .order('created_at', { ascending: false });
    if (teacherId) q = (q as any).eq('teacher_id', teacherId);
    if (schoolId) q = (q as any).eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) {
        const { data: f, error: e2 } = await db()
            .from('classes')
            .select('id, name, description, status, max_students, current_students, start_date, schedule, teacher_id, program_id, school_id, created_at')
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
export async function fetchAnalyticsOverview(opts: { schoolId?: string; schoolName?: string } = {}) {
    // 1. Total Students from registration applications (comprehensive count)
    let studAppsQ = db().from('students').select('id', { count: 'exact', head: true });

    // 2. Portal users (active/teachers)
    let studentPortalQ = db().from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student');
    let teacherPortalQ = db().from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher');
    let programPortalQ = db().from('programs').select('id', { count: 'exact', head: true }).eq('is_active', true);

    // 3. Submissions (grades) for average progress — 2-step to avoid FK ambiguity
    const subsQ = db().from('assignment_submissions')
        .select('grade, portal_user_id, user_id').eq('status', 'graded').not('grade', 'is', null).limit(500);

    if (opts.schoolId || opts.schoolName) {
        let filter = '';
        if (opts.schoolId) filter += `school_id.eq.${opts.schoolId}`;
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq."${opts.schoolName}"`;

        studAppsQ = (studAppsQ as any).or(filter);
        studentPortalQ = (studentPortalQ as any).or(filter);
        teacherPortalQ = (teacherPortalQ as any).or(filter);
        // subsQ school filter is applied post-fetch below
    }

    const [apps, students, teachers, programs, subs] = await Promise.allSettled([
        studAppsQ,
        studentPortalQ,
        teacherPortalQ,
        programPortalQ,
        subsQ,
    ]);

    const totalCount = apps.status === 'fulfilled' ? (apps.value.count ?? 0) : 0;
    const studentCount = students.status === 'fulfilled' ? (students.value.count ?? 0) : 0;
    const teacherCount = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
    const programCount = programs.status === 'fulfilled' ? (programs.value.count ?? 0) : 0;

    let subsData = subs.status === 'fulfilled' ? (subs.value.data ?? []) : [];

    // Filter by school post-fetch
    if ((opts.schoolId || opts.schoolName) && subsData.length > 0) {
        const uids = [...new Set(subsData.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
        const { data: users } = await db().from('portal_users').select('id, school_id, school_name').in('id', uids);
        const umap: Record<string, any> = {};
        (users ?? []).forEach((u: any) => { umap[u.id] = u; });
        subsData = subsData.filter((s: any) => {
            const u = umap[s.portal_user_id ?? s.user_id];
            return u?.school_id === opts.schoolId || u?.school_name === opts.schoolName;
        });
    }

    const grades = subsData.map((s: any) => s.grade).filter((g: any) => g != null);
    const avgProgress = grades.length
        ? Math.round(grades.reduce((a: number, b: number) => a + Number(b), 0) / grades.length)
        : 0;

    return {
        totalStudents: totalCount || studentCount,
        activeStudents: studentCount,
        totalTeachers: teacherCount,
        totalPrograms: programCount,
        avgProgress,
    };
}

export async function fetchAtRiskStudents(schoolId?: string) {
    const url = `/api/analytics/at-risk${schoolId ? `?schoolId=${schoolId}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch at-risk students');
    const { data } = await res.json();
    return data;
}

export async function fetchCoursePerformance(courseId: string) {
    const res = await fetch(`/api/analytics/performance/${courseId}`);
    if (!res.ok) throw new Error('Failed to fetch course performance');
    const { data } = await res.json();
    return data;
}

export async function fetchStudentReport(studentId: string) {
    const res = await fetch(`/api/analytics/student/${studentId}/report`);
    if (!res.ok) throw new Error('Failed to fetch student report');
    const { data } = await res.json();
    return data;
}

// ── HELPERS ───────────────────────────────────────────────────
export async function fetchTeachers(opts: { schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('portal_users')
        .select('id, full_name, email, is_active, created_at, school_id, school_name')
        .eq('role', 'teacher')
        .order('full_name');

    if (opts.schoolId || opts.schoolName) {
        let filter = '';
        if (opts.schoolId) filter += `school_id.eq.${opts.schoolId}`;
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq."${opts.schoolName}"`;
        q = (q as any).or(filter);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
}

export async function fetchStudents(opts: { schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('portal_users')
        .select('id, full_name, email, is_active, school_id, school_name, created_at')
        .eq('role', 'student')
        .order('full_name');

    if (opts.schoolId || opts.schoolName) {
        let filter = '';
        if (opts.schoolId) filter += `school_id.eq.${opts.schoolId}`;
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq."${opts.schoolName}"`;
        q = (q as any).or(filter);
    }

    const { data, error } = await q;
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
    grade: number | null,
    feedback: string,
    gradedBy: string,
) {
    const { data, error } = await db()
        .from('assignment_submissions')
        .update({
            grade,
            feedback,
            status: 'graded',
            graded_by: gradedBy,
            graded_at: new Date().toISOString(),
        })
        .eq('id', submissionId)
        .select('id, grade, status');
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error('Grade could not be saved — permission denied or submission not found. Please check your account role.');
    }
    return data[0];
}

/**
 * Universal update for submissions — can change status, text, grade, etc.
 */
export async function updateSubmission(
    id: string,
    payload: {
        grade?: number | null;
        feedback?: string | null;
        status?: 'submitted' | 'graded' | 'late' | 'missing';
        submission_text?: string | null;
        graded_by?: string;
    }
) {
    const updateData: any = { ...payload };
    if (payload.status === 'graded' && !payload.hasOwnProperty('graded_at')) {
        updateData.graded_at = new Date().toISOString();
    }
    
    const { data, error } = await db()
        .from('assignment_submissions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSubmission(id: string) {
    const { error } = await db()
        .from('assignment_submissions')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ── SUBMIT ASSIGNMENT ─────────────────────────────────────────
export async function submitAssignment(payload: {
    assignment_id: string;
    portal_user_id: string;
    submission_text?: string;
    file_url?: string;
    answers?: any;
}) {
    const upsertData: any = {
        ...payload,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
    };
    if (payload.answers === null || payload.answers === undefined) delete upsertData.answers;

    // Upsert — student can resubmit
    const { data, error } = await db()
        .from('assignment_submissions')
        .upsert(upsertData, { onConflict: 'assignment_id,portal_user_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}
