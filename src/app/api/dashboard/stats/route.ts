import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

      if (adminStats) {
        stats = {
          totalSchools: adminStats.total_schools,
          activeSchools: adminStats.active_schools,
          totalTeachers: adminStats.total_teachers,
          totalStudents: adminStats.total_students,
          totalPartners: adminStats.total_partners,
          totalGraded: (adminStats.graded_assignments || 0) + (adminStats.graded_cbt || 0),
        };
      }
    } else if (role === 'teacher') {
      const { data, error } = await supabase.rpc('get_teacher_dashboard_stats', {
        teacher_uuid: profile.id,
      });

      if (!error && data) {
        stats = {
          classes: data.classes || 0,
          totalStudents: (data.portal_students || 0) + (data.registry_students || 0),
          pendingGrading: (data.pending_assignments || 0) + (data.pending_exams || 0),
          avgPerformance: data.avg_grade || 0,
          ungradedAssignments: data.pending_assignments || 0,
          ungradedExams: data.pending_exams || 0,
        };
      }
    } else if (role === 'student') {
      const { data, error } = await supabase.rpc('get_student_dashboard_stats', {
        student_uuid: profile.id,
      });

      if (!error && data) {
        stats = {
          enrolledCourses: data.enrolled_courses || 0,
          xp: data.xp_points || 0,
          streak: data.current_streak || 0,
          level: data.achievement_level || 'Bronze',
          lessonsDone: data.lessons_completed || 0,
          avgScore: data.avg_score || 0,
          pendingAssignments: data.pending_assignments || 0,
          badgesCount: data.badges_count || 0,
          leaderboardRank: data.leaderboard_rank || null,
        };
      }
    } else if (role === 'school') {
      const { data, error } = await supabase.rpc('get_school_dashboard_stats', {
        school_uuid: profile.school_id || '',
        school_name_param: profile.school_name || null,
      });

      if (!error && data) {
        stats = {
          totalStudents: data.total_students || 0,
          portalStudents: data.portal_students || 0,
          assignedTeachers: data.assigned_teachers || 0,
          totalClasses: data.total_classes || 0,
          avgPerformance: data.avg_performance || 0,
          submissionsCount: data.submissions_count || 0,
        };
      }
    }

    return NextResponse.json({ stats, role });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
