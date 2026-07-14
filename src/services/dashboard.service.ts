import { createClient } from '@/lib/supabase/client';

const db = () => createClient();

async function countActivePrograms(opts: { schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('programs')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

    if (opts.schoolId || opts.schoolName) {
        const filters = ['school_id.is.null'];
        if (opts.schoolId) filters.push(`school_id.eq.${opts.schoolId}`);
        if (opts.schoolName) filters.push(`school_name.eq.${JSON.stringify(opts.schoolName)}`);
        q = (q as any).or(filters.join(','));
    }

    const { count } = await q;
    return count ?? 0;
}

async function computeAverageProgress(opts: { schoolId?: string; schoolName?: string } = {}) {
    const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(db() as any, {});

    let subsQ = db()
        .from('assignment_submissions')
        .select('grade, portal_user_id, user_id, assignments(term_id)')
        .eq('status', 'graded')
        .not('grade', 'is', null)
        .limit(800);

    if (opts.schoolId || opts.schoolName) {
        let userQ = db()
            .from('portal_users')
            .select('id')
            .eq('role', 'student');

        let filter = '';
        if (opts.schoolId) filter += `school_id.eq.${opts.schoolId}`;
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq.${JSON.stringify(opts.schoolName)}`;
        if (filter) userQ = (userQ as any).or(filter);

        const { data: users } = await userQ;
        const userIds = (users ?? []).map((row: any) => row.id).filter(Boolean);
        if (userIds.length === 0) return 0;
        subsQ = (subsQ as any).or(
            `portal_user_id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`,
        );
    }

    const { data: subsData } = await subsQ;
    const scoped = filterByAssignmentSession((subsData ?? []) as any[], liveTermId);
    const grades = scoped.map((s: any) => s.grade).filter((g: any) => g != null);
    return grades.length
        ? Math.round(grades.reduce((a: number, b: number) => a + Number(b), 0) / grades.length)
        : 0;
}

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
    const { resolveAssignmentTermId, filterByAssignmentSession, matchesAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(client as any, {});

    // 1. Get existing submissions (live academic session)
    const { data: subs, error } = await client
        .from('assignment_submissions')
        .select(`
      id, status, grade, feedback, submitted_at, graded_at, file_url, assignment_id,
      assignments (
        id, title, description, due_date, max_points, assignment_type, term_id,
        courses ( title, programs ( name ) )
      )
    `)
        .or(`portal_user_id.eq.${portalUserId},user_id.eq.${portalUserId}`)
        .order('submitted_at', { ascending: false });
    if (error) throw error;
    const scopedSubs = filterByAssignmentSession((subs ?? []) as any[], liveTermId);

    // 2. Resolve programme scope — enrollments plus the class programme.
    const { data: studentProfile } = await client
        .from('portal_users')
        .select('class_id, school_id, school_name, section_class')
        .eq('id', portalUserId)
        .maybeSingle();
    const { resolveStudentCbtScope, cbtExamVisibleToStudent } = await import('@/lib/cbt/visibility');
    const cbtScope = await resolveStudentCbtScope(client, portalUserId, studentProfile?.class_id ?? null);
    const programIds = Array.from(cbtScope.programIds);

    // 3. Find course IDs for those programs — exclude locked courses, EXCEPT
    // for our always-public flagship programmes (Young Innovator, Teen Developer)
    // which are exempt from the lock per product policy.
    let courseRows: any[] = [];
    if (programIds.length > 0) {
        const { data } = await client
            .from('courses')
            .select('id, is_locked, is_active, programs(name)')
            .in('program_id', programIds);
        courseRows = data ?? [];
    }
    const { isCourseVisibleToLearners } = await import('@/lib/courses/visibility');
    const courseIds = programIds.length
        ? (courseRows ?? [])
            .filter((c: any) => isCourseVisibleToLearners(c))
            .map((c: any) => c.id)
        : [];

    // 4. Fetch all active assignments for enrolled courses (live session)
    let allAsgns: any[] = [];
    if (courseIds.length > 0) {
        const { data } = await client
            .from('assignments')
            .select(`id, title, description, due_date, max_points, assignment_type, term_id,
          courses ( title, programs ( name ) )`)
            .in('course_id', courseIds)
            .eq('is_active', true)
            .order('due_date', { ascending: true });
        allAsgns = ((data ?? []) as any[]).filter((a) =>
            matchesAssignmentSession(a.term_id, liveTermId, true),
        );
    }

    // 5. Add assignments not yet submitted as synthetic "missing" records
    const submittedIds = new Set(scopedSubs.map((s: any) => s.assignment_id ?? s.assignments?.id));
    const unsubmitted = allAsgns
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

    // 6. Fetch active CBT exams visible to this student (class + programme + session scope)
    const { loadAcademicTermBounds, matchesCbtSession } = await import('@/lib/cbt/session');
    const termBounds = await loadAcademicTermBounds(client as any, liveTermId);
    const now = new Date().toISOString();
    let cbtQuery = client
        .from('cbt_exams')
        .select('id, title, description, duration_minutes, passing_score, end_date, program_id, course_id, school_id, metadata, courses(title, programs(name))')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`);
    if (studentProfile?.school_id) {
        cbtQuery = cbtQuery.eq('school_id', studentProfile.school_id);
    } else {
        cbtQuery = cbtQuery.is('school_id', null);
    }
    const { data: rawCbtExams } = await cbtQuery;
    const studentScope = {
        id: portalUserId,
        school_id: studentProfile?.school_id ?? null,
        school_name: studentProfile?.school_name ?? null,
        class_id: studentProfile?.class_id ?? null,
        section_class: studentProfile?.section_class ?? null,
    };
    const cbtExams = (rawCbtExams ?? []).filter((exam: any) =>
        cbtExamVisibleToStudent(exam, studentScope, cbtScope) &&
        matchesCbtSession(
            { end_time: exam.end_date ?? null, cbt_exams: { metadata: exam.metadata } },
            liveTermId,
            termBounds,
            true,
        ),
    );

    // 7. Fetch student's CBT sessions to map attempt status
    const cbtExamIds = (cbtExams ?? []).map((e: any) => e.id);
    let cbtSessions: any[] = [];
    if (cbtExamIds.length > 0) {
        const { data: sessions } = await client
            .from('cbt_sessions')
            .select('id, exam_id, score, status, end_time')
            .eq('user_id', portalUserId)
            .in('exam_id', cbtExamIds);
        cbtSessions = sessions ?? [];
    }
    const sessionByExam = new Map(cbtSessions.map((s: any) => [s.exam_id, s]));

    // 8. Map CBT exams into unified submission-shaped records
    const cbtItems = (cbtExams ?? []).map((exam: any) => {
        const session = sessionByExam.get(exam.id);
        const status = !session
            ? 'missing'
            : session.status === 'pending_grading'
                ? 'pending_review'
                : ['passed', 'failed', 'completed'].includes(session.status)
                    ? 'graded'
                    : 'submitted';
        return {
            id: `cbt-${exam.id}`,
            assignment_id: exam.id,
            status,
            grade: session?.score ?? null,
            feedback: null,
            submitted_at: session?.end_time ?? null,
            graded_at: null,
            file_url: null,
            assignments: {
                id: exam.id,
                title: exam.title,
                description: exam.description,
                due_date: exam.end_date ?? null,
                max_points: 100,
                assignment_type: 'cbt',
                courses: exam.courses ?? null,
            },
        };
    });

    return [...scopedSubs, ...unsubmitted, ...cbtItems];
}

// ── GRADES ────────────────────────────────────────────────────
// All submissions for grading (teachers/admins), scoped to one academic session.
export async function fetchSubmissionsForGrading(opts: {
  teacherId?: string;
  schoolId?: string;
  schoolName?: string;
  /** When set, only assignments in this academic_terms.id (plus live null legacy). */
  termId?: string | null;
  includeUntagged?: boolean;
} = {}) {
    const client = db();

    // Step 1: Fetch submissions without portal_users join (avoids FK ambiguity)
    const { data: rawSubs, error } = await client
        .from('assignment_submissions')
        .select(`
      id, grade, weighted_score, feedback, status, submitted_at, graded_at,
      submission_text, file_url, portal_user_id, user_id,
      assignments (
        id, title, max_points, weight, due_date, created_by, course_id, term_id,
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

    // Step 6: Academic session isolation — Second ≠ Third; years stay separate.
    if (opts.termId) {
        const includeUntagged = opts.includeUntagged !== false;
        result = result.filter((s: any) => {
            const asnTerm = s.assignments?.term_id ?? null;
            if (asnTerm === opts.termId) return true;
            return includeUntagged && !asnTerm;
        });
    }

    return result;
}

// Student's own grades (optionally session-scoped)
export async function fetchStudentGrades(portalUserId: string, opts: { termId?: string | null; includeUntagged?: boolean } = {}) {
    const { data, error } = await db()
        .from('assignment_submissions')
        .select(`
      id, grade, weighted_score, feedback, status, submitted_at, graded_at, portal_user_id, user_id,
      assignments (
        id, title, max_points, weight, due_date, assignment_type, course_id, term_id,
        courses ( title, programs ( name ) )
      )
    `)
        // Match on either column — some older submissions use user_id, newer use portal_user_id
        .or(`portal_user_id.eq.${portalUserId},user_id.eq.${portalUserId}`)
        .order('graded_at', { ascending: false });
    if (error) throw error;
    let rows = data ?? [];
    if (opts.termId) {
        const includeUntagged = opts.includeUntagged !== false;
        rows = rows.filter((s: any) => {
            const asnTerm = s.assignments?.term_id ?? null;
            if (asnTerm === opts.termId) return true;
            return includeUntagged && !asnTerm;
        });
    }
    return rows;
}

export async function fetchCourses(teacherId?: string, opts: { schoolId?: string; schoolName?: string } = {}) {
    let q = db()
        .from('courses')
        .select(`
      id, title, description, duration_hours, is_active, teacher_id,
      program_id, school_id, school_name,
      is_locked, metadata,
      created_at,
      programs ( id, name, difficulty_level ),
      assignment_submissions ( id )
    `)
        .order('created_at', { ascending: false });

    if (teacherId) q = (q as any).eq('teacher_id', teacherId);
    else q = (q as any).eq('is_active', true);

    if (opts.schoolId || opts.schoolName) {
        // Always include global platform courses (school_id IS NULL) alongside school-specific ones
        const filters = ['school_id.is.null'];
        if (opts.schoolId) filters.push(`school_id.eq.${opts.schoolId}`);
        if (opts.schoolName) filters.push(`school_name.eq.${JSON.stringify(opts.schoolName)}`);
        q = (q as any).or(filters.join(','));
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
      start_date, end_date, schedule, teacher_id, program_id, school_id, term_id, created_at,
      qa_grade_key, qa_grade_band, band_lvl, band_low, band_high,
      academic_terms ( id, academic_year, term_label, term_number ),
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
            .select('id, name, description, status, max_students, current_students, start_date, schedule, teacher_id, program_id, school_id, term_id, created_at, qa_grade_key, qa_grade_band, band_lvl, band_low, band_high')
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
    const supabase = db();

    // 1. If scoped to a school, use optimized RPC then re-scope avg to live session
    if (opts.schoolId) {
        const [{ data, error }, totalPrograms, sessionAvg] = await Promise.all([
            supabase.rpc('get_school_dashboard_stats', {
            school_uuid: opts.schoolId,
            school_name_param: opts.schoolName || ''
            }),
            countActivePrograms(opts),
            computeAverageProgress(opts),
        ]);

        if (error) throw error;
        const stats = data as any;

        return {
            totalStudents: stats.total_students,
            activeStudents: stats.portal_students,
            totalTeachers: stats.assigned_teachers,
            totalPrograms,
            avgProgress: sessionAvg,
        };
    }

    // 2. Global admin — compute LIVE counts. (We deliberately do NOT read the
    // admin_dashboard_stats materialized view: nothing refreshes it, so it goes stale and
    // reported wildly wrong totals, e.g. 12 students when there are 850. Live COUNT(*) with
    // head:true is cheap and always correct.)
    let studAppsQ = db().from('students').select('id', { count: 'exact', head: true });
    let studentPortalQ = db().from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student');
    let teacherPortalQ = db().from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher');
    const programPortalQ = db().from('programs').select('id', { count: 'exact', head: true }).eq('is_active', true);

    const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(db() as any, {});
    const subsQ = db().from('assignment_submissions')
        .select('grade, portal_user_id, user_id, assignments(term_id)').eq('status', 'graded').not('grade', 'is', null).limit(800);

    if (opts.schoolName && !opts.schoolId) {
        const filterStr = `school_name.eq.${JSON.stringify(opts.schoolName)}`;
        studAppsQ = (studAppsQ as any).or(filterStr);
        studentPortalQ = (studentPortalQ as any).or(filterStr);
        teacherPortalQ = (teacherPortalQ as any).or(filterStr);
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

    const subsData = filterByAssignmentSession(
      (subs.status === 'fulfilled' ? (subs.value.data ?? []) : []) as any[],
      liveTermId,
    );

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
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq.${JSON.stringify(opts.schoolName)}`;
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
        if (opts.schoolName) filter += `${filter ? ',' : ''}school_name.eq.${JSON.stringify(opts.schoolName)}`;
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
