import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TeacherStats {
  classes: number;
  portal_students: number;
  registry_students: number;
  pending_assignments: number;
  pending_exams: number;
  avg_grade: number;
}

interface StudentStats {
  enrolled_courses: number;
  lessons_completed: number;
  avg_score: number;
  pending_assignments: number;
  xp_points: number;
  current_streak: number;
  achievement_level: string;
  badges_count: number;
  leaderboard_rank: number | null;
}

interface SchoolStats {
  total_students: number;
  portal_students: number;
  assigned_teachers: number;
  total_classes: number;
  avg_performance: number;
  submissions_count: number;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('portal_users')
      .select('id, role, school_id, school_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const role = profile.role;
    let stats: any = {};

    if (role === 'admin') {
      const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
      const liveTermId = await resolveAssignmentTermId(supabase as any, {});
      const termBounds = await loadAcademicTermBounds(supabase as any, liveTermId);

      // Get recent school payments
      const [
        approvedSchools,
        schoolAccounts,
        activeTeachers,
        activePortalStudents,
        studentRegistrations,
        gradedAssignments,
        gradedCbtRows,
        paymentsRes,
      ] = await Promise.all([
        supabase
          .from('schools')
          .select('id', { count: 'exact', head: true })
          .in('status', ['approved', 'active'])
          .neq('is_deleted', true),
        supabase
          .from('portal_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'school')
          .eq('is_active', true)
          .neq('is_deleted', true),
        supabase
          .from('portal_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'teacher')
          .eq('is_active', true)
          .neq('is_deleted', true),
        supabase
          .from('portal_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'student')
          .eq('is_active', true)
          .neq('is_deleted', true),
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .or('status.is.null,status.neq.rejected'),
        liveTermId
          ? supabase
              .from('assignment_submissions')
              .select('id, assignments!inner(term_id)', { count: 'exact', head: true })
              .not('grade', 'is', null)
              .or(`assignments.term_id.eq.${liveTermId},assignments.term_id.is.null`)
          : supabase
              .from('assignment_submissions')
              .select('id', { count: 'exact', head: true })
              .not('grade', 'is', null),
        supabase
          .from('cbt_sessions')
          .select('id, end_time, score, cbt_exams(metadata)')
          .not('score', 'is', null)
          .limit(2000),
        supabase
          .from('invoices')
          .select('id, invoice_number, amount, currency, status, due_date, created_at, schools(name)')
          .not('school_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const sessionCbt = filterCbtByAcademicTerm(
        (gradedCbtRows.data ?? []) as any[],
        liveTermId,
        termBounds,
        { includeUntagged: true },
      );

      stats = {
        totalSchools: approvedSchools.count || 0,
        activeSchools: approvedSchools.count || 0,
        totalTeachers: activeTeachers.count || 0,
        totalStudents: activePortalStudents.count || 0,
        studentRegistrations: studentRegistrations.count || 0,
        totalPartners: schoolAccounts.count || 0,
        totalGraded: (gradedAssignments.count || 0) + sessionCbt.length,
        schoolPayments: paymentsRes.data || [],
      };
    } else if (role === 'teacher') {
      const { data, error } = await supabase.rpc('get_teacher_dashboard_stats', {
        teacher_uuid: profile.id,
      });

      if (!error && data) {
        const d = data as unknown as TeacherStats;
        const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(supabase as any, {});
        const { data: teacherAsns } = await supabase
          .from('assignments')
          .select('id, term_id')
          .eq('created_by', profile.id);
        const sessionAsnIds = ((teacherAsns ?? []) as any[])
          .filter((a) => !liveTermId || a.term_id === liveTermId || !a.term_id)
          .map((a) => a.id);
        let avgPerformance = d.avg_grade || 0;
        let pendingAssignments = d.pending_assignments || 0;
        if (sessionAsnIds.length) {
          const [{ data: graded }, { count: pendingCount }] = await Promise.all([
            supabase
              .from('assignment_submissions')
              .select('grade, assignments(max_points, term_id)')
              .in('assignment_id', sessionAsnIds)
              .eq('status', 'graded')
              .not('grade', 'is', null),
            supabase
              .from('assignment_submissions')
              .select('id', { count: 'exact', head: true })
              .in('assignment_id', sessionAsnIds)
              .eq('status', 'submitted'),
          ]);
          const scoped = filterByAssignmentSession((graded ?? []) as any[], liveTermId);
          if (scoped.length) {
            avgPerformance = Math.round(
              scoped.reduce(
                (sum: number, row: any) =>
                  sum + ((Number(row.grade) || 0) / (Number(row.assignments?.max_points) || 100)) * 100,
                0,
              ) / scoped.length,
            );
          } else {
            avgPerformance = 0;
          }
          pendingAssignments = pendingCount || 0;
        }
        stats = {
          classes: d.classes || 0,
          totalStudents: (d.portal_students || 0) + (d.registry_students || 0),
          pendingGrading: pendingAssignments + (d.pending_exams || 0),
          avgPerformance,
          ungradedAssignments: pendingAssignments,
          ungradedExams: d.pending_exams || 0,
        };
      }
    } else if (role === 'student') {
      const { data, error } = await supabase.rpc('get_student_dashboard_stats', {
        student_uuid: profile.id,
      });

      // Fetch from new engagement tables
      const [xpRes, streakRes, badgeRes] = await Promise.all([
        supabase.from('student_xp_summary').select('*').eq('student_id', profile.id).maybeSingle(),
        supabase.from('student_streaks').select('*').eq('student_id', profile.id).maybeSingle(),
        supabase.from('student_badges').select('*', { count: 'exact', head: true }).eq('student_id', profile.id)
      ]);

      if (!error && data) {
        const d = data as unknown as StudentStats;
        const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(supabase as any, {});
        const { data: gradedRows } = await supabase
          .from('assignment_submissions')
          .select('grade, assignments(max_points, term_id)')
          .eq('portal_user_id', profile.id)
          .eq('status', 'graded')
          .not('grade', 'is', null);
        const scoped = filterByAssignmentSession((gradedRows ?? []) as any[], liveTermId);
        const sessionAvg = scoped.length
          ? Math.round(
              scoped.reduce(
                (sum: number, row: any) =>
                  sum + ((Number(row.grade) || 0) / (Number(row.assignments?.max_points) || 100)) * 100,
                0,
              ) / scoped.length,
            )
          : 0;
        const { data: pendingRows } = await supabase
          .from('assignment_submissions')
          .select('id, assignments(term_id)')
          .eq('portal_user_id', profile.id)
          .eq('status', 'submitted');
        const pendingScoped = filterByAssignmentSession((pendingRows ?? []) as any[], liveTermId);
        stats = {
          enrolledCourses: d.enrolled_courses || 0,
          xp: (xpRes.data?.total_xp ?? d.xp_points) || 0,
          streak: (streakRes.data?.current_streak ?? d.current_streak) || 0,
          level: xpRes.data?.level ? `Level ${xpRes.data.level}` : (d.achievement_level || 'Bronze'),
          lessonsDone: d.lessons_completed || 0,
          avgScore: sessionAvg,
          pendingAssignments: pendingScoped.length,
          badgesCount: (badgeRes.count ?? d.badges_count) || 0,
          leaderboardRank: d.leaderboard_rank || null,
        };
      }
    } else if (role === 'school') {
      const { data, error } = await supabase.rpc('get_school_dashboard_stats', {
        school_uuid: profile.school_id || '',
        school_name_param: profile.school_name ?? undefined,
      });

      if (!error && data) {
        const d = data as unknown as SchoolStats;
        const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(supabase as any, {});

        let avgPerformance = d.avg_performance || 0;
        let submissionsCount = d.submissions_count || 0;

        let schoolStudentsQ = supabase
          .from('portal_users')
          .select('id')
          .eq('role', 'student')
          .eq('is_active', true);
        if (profile.school_id) {
          schoolStudentsQ = schoolStudentsQ.eq('school_id', profile.school_id);
        } else if (profile.school_name) {
          schoolStudentsQ = schoolStudentsQ.eq('school_name', profile.school_name);
        }
        const { data: schoolStudents } = await schoolStudentsQ.limit(800);
        const studentIds = (schoolStudents ?? []).map((s: any) => s.id).filter(Boolean);
        if (studentIds.length) {
          const { data: graded } = await supabase
            .from('assignment_submissions')
            .select('grade, status, assignments(max_points, term_id)')
            .in('portal_user_id', studentIds)
            .not('grade', 'is', null)
            .limit(3000);
          const scoped = filterByAssignmentSession((graded ?? []) as any[], liveTermId);
          submissionsCount = scoped.length;
          avgPerformance = scoped.length
            ? Math.round(
                scoped.reduce(
                  (sum: number, row: any) =>
                    sum + ((Number(row.grade) || 0) / (Number(row.assignments?.max_points) || 100)) * 100,
                  0,
                ) / scoped.length,
              )
            : 0;
        } else {
          avgPerformance = 0;
          submissionsCount = 0;
        }

        stats = {
          totalStudents: d.total_students || 0,
          portalStudents: d.portal_students || 0,
          assignedTeachers: d.assigned_teachers || 0,
          totalClasses: d.total_classes || 0,
          avgPerformance,
          submissionsCount,
        };
      }
    }

    // Get activity feed
    const { data: activities } = await supabase.rpc('get_dashboard_activity', {
      user_role: role,
      user_uuid: user.id,
      activity_limit: 6
    });

    // Fetch global LMS settings
    const { data: rawSettings } = await supabase
      .from('app_settings')
      .select('key, value');
    
    const lmsSettings: Record<string, string> = {};
    (rawSettings ?? []).forEach(s => {
      lmsSettings[s.key] = s.value;
    });

    return NextResponse.json({
      stats,
      role,
      activities: activities || [],
      lmsSettings
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
