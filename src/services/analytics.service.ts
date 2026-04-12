import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

export interface StudentAnalytics {
  lessonsCompleted: number;
  lessonsTotal: number;
  assignmentsSubmitted: number;
  assignmentsTotal: number;
  averageScore: number;
  currentStreak: number;
  projectsCreated: number;
  completionRate: number;
  timeSpent: number;
  skillBreakdown: SkillProgress[];
  recentActivity: Activity[];
  performanceTrend: PerformancePoint[];
}

export interface SkillProgress {
  skill: string;
  progress: number;
  lessonsCompleted: number;
  lessonsTotal: number;
}

export interface Activity {
  id: string;
  type: 'lesson' | 'assignment' | 'project';
  title: string;
  completedAt: string;
  score?: number;
}

export interface PerformancePoint {
  week: number;
  average: number;
  completionRate: number;
}

export class AnalyticsService {
    async getStudentAnalytics(userId: string, schoolId?: string): Promise<StudentAnalytics> {
        const supabase = await createClient();

        const [lessonsData, assignmentsData, projectsData, streakData, activitiesData] = await Promise.all([
            supabase
                .from('lesson_completions')
                .select('id, lesson_id')
                .eq('user_id', userId),
            supabase
                .from('assignment_submissions')
                .select('id, assignment_id, score, submitted_at')
                .eq('user_id', userId),
            supabase
                .from('portfolio_projects')
                .select('id, created_at')
                .eq('user_id', userId),
            supabase
                .from('user_learning_stats')
                .select('current_streak, total_time_minutes')
                .eq('user_id', userId)
                .single(),
            this.getRecentActivity(supabase, userId, 10)
        ]);

        const lessonsCompleted = lessonsData.data?.length || 0;
        const assignmentsSubmitted = assignmentsData.data?.length || 0;
        const projectsCreated = projectsData.data?.length || 0;
        const currentStreak = streakData.data?.current_streak || 0;
        const timeSpent = (streakData.data?.total_time_minutes || 0) / 60;

        const scores = (assignmentsData.data || [])
            .map(a => a.score)
            .filter(s => s !== null);
        const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        const lessonsTotal = await this.getTotalLessons(supabase, schoolId);
        const assignmentsTotal = await this.getTotalAssignments(supabase, schoolId);
        const completionRate = lessonsTotal > 0 ? Math.round((lessonsCompleted / lessonsTotal) * 100) : 0;

        const skillBreakdown = await this.getSkillBreakdown(supabase, userId);
        const performanceTrend = await this.getPerformanceTrend(supabase, userId);

        return {
            lessonsCompleted,
            lessonsTotal,
            assignmentsSubmitted,
            assignmentsTotal,
            averageScore,
            currentStreak,
            projectsCreated,
            completionRate,
            timeSpent,
            skillBreakdown,
            recentActivity: activitiesData,
            performanceTrend
        };
    }

    private async getRecentActivity(supabase: any, userId: string, limit: number): Promise<Activity[]> {
        const { data } = await supabase
            .from('lesson_completions')
            .select('id, lesson_id, completed_at, lessons(title)')
            .eq('user_id', userId)
            .order('completed_at', { ascending: false })
            .limit(limit);

        return (data || []).map((item: any) => ({
            id: item.id,
            type: 'lesson',
            title: item.lessons?.title || 'Lesson',
            completedAt: item.completed_at,
            score: undefined
        }));
    }

    private async getTotalLessons(supabase: any, schoolId?: string): Promise<number> {
        let query = supabase.from('lessons').select('id', { count: 'exact' });
        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }
        const { count } = await query;
        return count || 0;
    }

    private async getTotalAssignments(supabase: any, schoolId?: string): Promise<number> {
        let query = supabase.from('assignments').select('id', { count: 'exact' });
        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }
        const { count } = await query;
        return count || 0;
    }

    private async getSkillBreakdown(supabase: any, userId: string): Promise<SkillProgress[]> {
        const { data } = await supabase
            .from('lesson_completions')
            .select('lessons(skill_category)')
            .eq('user_id', userId);

        const skillMap = new Map<string, number>();
        (data || []).forEach((item: any) => {
            const skill = item.lessons?.skill_category || 'General';
            skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
        });

        return Array.from(skillMap.entries()).map(([skill, count]) => ({
            skill,
            progress: Math.min((count / 10) * 100, 100),
            lessonsCompleted: count,
            lessonsTotal: 10
        }));
    }

    private async getPerformanceTrend(supabase: any, userId: string): Promise<PerformancePoint[]> {
        const { data } = await supabase
            .from('assignment_submissions')
            .select('score, submitted_at')
            .eq('user_id', userId)
            .order('submitted_at', { ascending: true });

        const weeks = new Map<number, number[]>();
        const now = new Date();

        (data || []).forEach((item: any) => {
            const submitDate = new Date(item.submitted_at);
            const weeksDiff = Math.floor((now.getTime() - submitDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            const weekKey = Math.max(0, Math.min(3, weeksDiff));

            if (!weeks.has(weekKey)) {
                weeks.set(weekKey, []);
            }
            weeks.get(weekKey)!.push(item.score);
        });

        const trend: PerformancePoint[] = [];
        for (let i = 3; i >= 0; i--) {
            const scores = weeks.get(i) || [];
            const average = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
            trend.push({
                week: 4 - i,
                average,
                completionRate: scores.length
            });
        }

        return trend;
    }

    async trackEvent(userId: string, eventType: string, metadata: any = {}) {
        const supabase = await createClient();

        // In a real system, this would go to a time-series DB like ClickHouse or TimescaleDB
        // For now, we'll store in a generic activity_logs table
        const { error } = await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                event_type: eventType,
                metadata,
                created_at: new Date().toISOString()
            }]);

        if (error) console.error('Failed to track analytics event:', error);
    }

    async trackVideoEngagement(userId: string, lessonId: string, watchTime: number, completionPercentage: number) {
        const supabase = await createClient();

        // Update or Insert lesson progress
        const { error } = await supabase
            .from('lesson_progress')
            .upsert({
                portal_user_id: userId,
                lesson_id: lessonId,
                time_spent_minutes: watchTime / 60,
                progress_percentage: completionPercentage,
                last_accessed_at: new Date().toISOString()
            }, { onConflict: 'portal_user_id,lesson_id' });

        if (error) console.error('Failed to track video engagement:', error);
    }

    async getCoursePerformance(courseId: string) {
        const supabase = await createClient();

        // 1. Completion rate - first get the program_id for this course
        const { data: courseData } = await supabase
            .from('courses')
            .select('program_id')
            .eq('id', courseId)
            .single();

        const programId = courseData?.program_id;
        if (!programId) {
            return {
                totalStudents: 0,
                completionRate: 0,
                avgExamScore: 0,
                avgAssignmentGrade: 0
            };
        }

        const { data: students } = await supabase
            .from('enrollments')
            .select('user_id, status')
            .eq('program_id', programId);

        const total = students?.length || 0;
        const completed = students?.filter(s => s.status === 'completed').length || 0;

        // 2. Average grades
        const { data: examAvg } = await supabase.rpc('get_course_avg_exam_score', { p_course_id: courseId });
        const { data: assignmentAvg } = await supabase.rpc('get_course_avg_assignment_grade', { p_course_id: courseId });

        return {
            totalStudents: total,
            completionRate: total > 0 ? (completed / total) * 100 : 0,
            avgExamScore: examAvg || 0,
            avgAssignmentGrade: assignmentAvg || 0
        };
    }

    async getAtRiskStudents(schoolId?: string) {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('get_at_risk_students', {
            p_school_id: (schoolId || null) as unknown as string,
            p_days_inactive: 7
        });

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async generateStudentReport(studentId: string) {
        const supabase = await createClient();

        const { data: performance } = await supabase
            .from('student_performance_summary')
            .select('*')
            .eq('student_id', studentId)
            .single();

        const { data: activity } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', studentId)
            .order('created_at', { ascending: false })
            .limit(50);

        return {
            summary: performance,
            recentActivity: activity,
            generatedAt: new Date().toISOString()
        };
    }

    async exportData(type: 'performance' | 'engagement', filters: any) {
        const supabase = await createClient();

        if (type === 'performance') {
            let query = supabase.from('student_performance_summary').select('*');
            if (filters.schoolId) query = query.eq('school_id', filters.schoolId);
            
            const { data, error } = await query;
            if (error) throw new AppError(error.message, 500);
            return data;
        } else {
            let query = supabase.from('activity_logs').select('*, portal_users(full_name)');
            if (filters.schoolId) query = query.eq('school_id', filters.schoolId);
            
            const { data, error } = await query;
            if (error) throw new AppError(error.message, 500);
            return data;
        }
    }

    async getCohortAnalytics(programId: string) {
        const supabase = await createClient();

        // Calculate completion rates
        const { data: enrollments } = await supabase
            .from('enrollments')
            .select('status')
            .eq('program_id', programId);

        if (!enrollments) return { completionRate: 0 };

        const completed = enrollments.filter(e => e.status === 'completed').length;
        return {
            totalStudents: enrollments.length,
            completionRate: (completed / (enrollments.length || 1)) * 100
        };
    }
}

export const analyticsService = new AnalyticsService();
