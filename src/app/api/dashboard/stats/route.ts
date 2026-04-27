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

    // Use optimized RPC functions based on role
    if (role === 'admin') {
      // Use materialized view for admin stats
      const { data: adminStats } = await supabase
        .from('admin_dashboard_stats')
        .select('*')
        .single();

      // Get recent school payments
      const { data: payments } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, currency, status, due_date, created_at, schools(name)')
        .not('school_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (adminStats) {
        stats = {
          totalSchools: adminStats.total_schools,
          activeSchools: adminStats.active_schools,
          totalTeachers: adminStats.total_teachers,
          totalStudents: adminStats.total_students,
          totalPartners: adminStats.total_partners,
          totalGraded: (adminStats.graded_assignments || 0) + (adminStats.graded_cbt || 0),
          schoolPayments: payments || [],
        };
      }
    } else if (role === 'teacher') {
      const { data, error } = await supabase.rpc('get_teacher_dashboard_stats', {
        teacher_uuid: profile.id,
      });

      if (!error && data) {
        const d = data as unknown as TeacherStats;
        stats = {
          classes: d.classes || 0,
          totalStudents: (d.portal_students || 0) + (d.registry_students || 0),
          pendingGrading: (d.pending_assignments || 0) + (d.pending_exams || 0),
          avgPerformance: d.avg_grade || 0,
          ungradedAssignments: d.pending_assignments || 0,
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
        stats = {
          enrolledCourses: d.enrolled_courses || 0,
          xp: (xpRes.data?.total_xp ?? d.xp_points) || 0,
          streak: (streakRes.data?.current_streak ?? d.current_streak) || 0,
          level: xpRes.data?.level ? `Level ${xpRes.data.level}` : (d.achievement_level || 'Bronze'),
          lessonsDone: d.lessons_completed || 0,
          avgScore: d.avg_score || 0,
          pendingAssignments: d.pending_assignments || 0,
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
        stats = {
          totalStudents: d.total_students || 0,
          portalStudents: d.portal_students || 0,
          assignedTeachers: d.assigned_teachers || 0,
          totalClasses: d.total_classes || 0,
          avgPerformance: d.avg_performance || 0,
          submissionsCount: d.submissions_count || 0,
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
