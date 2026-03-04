import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

export class AnalyticsService {
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
            p_school_id: schoolId || null,
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
        let query;

        if (type === 'performance') {
            query = supabase.from('student_performance_summary').select('*');
        } else {
            query = supabase.from('activity_logs').select('*, portal_users(full_name)');
        }

        if (filters.schoolId) query = query.eq('school_id', filters.schoolId);

        const { data, error } = await query;
        if (error) throw new AppError(error.message, 500);

        return data;
    }

    async getCohortAnalytics(programId: string) {
        const supabase = await createClient();

        // Calculate completion rates
        const { data: enrollments } = await supabase
            .from('student_enrollments')
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
