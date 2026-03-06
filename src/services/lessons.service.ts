import { createClient } from '@/lib/supabase/server';
import { redisCache } from '@/lib/redis';
import { AppError, NotFoundError } from '@/lib/errors';

export interface LessonInput {
    course_id: string;
    title: string;
    description?: string;
    content?: string;
    lesson_type?: 'video' | 'reading' | 'interactive' | 'hands-on' | 'workshop' | 'coding';
    duration_minutes?: number;
    order_index?: number;
    video_url?: string;
    is_active?: boolean;
}

export class LessonsService {
    async listLessons(courseId: string, tenantId?: string) {
        const supabase = await createClient();

        // First confirm course access/tenant
        const { data: course, error: err } = await supabase.from('courses').select('school_id').eq('id', courseId).single();
        if (err || !course || (tenantId && course.school_id !== tenantId)) {
            throw new NotFoundError('Course not found or access denied');
        }

        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('course_id', courseId)
            .order('order_index', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            throw new AppError(`Failed to fetch lessons: ${error.message}`, 500);
        }

        return data;
    }

    async getLesson(id: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('Lesson not found');
        }

        if (tenantId && data.course_id) {
            const { data: courseData, error: courseErr } = await supabase
                .from('courses')
                .select('school_id')
                .eq('id', data.course_id)
                .single();

            if (courseErr || !courseData || courseData.school_id !== tenantId) {
                throw new NotFoundError('Lesson not found');
            }
        }

        return data;
    }

    async createLesson(input: LessonInput, userId: string, tenantId: string) {
        const supabase = await createClient();

        const { data: course, error: err } = await supabase.from('courses').select('school_id').eq('id', input.course_id).single();
        if (err || !course || (tenantId && course.school_id !== tenantId)) {
            throw new AppError('Course not found or access denied', 403);
        }

        const { data, error } = await supabase
            .from('lessons')
            .insert([
                {
                    ...input,
                    created_by: userId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to create lesson: ${error.message}`, 400);
        }

        return data;
    }

    async updateLesson(id: string, input: Partial<LessonInput>, tenantId?: string) {
        const supabase = await createClient();
        await this.getLesson(id, tenantId);

        const { data, error } = await supabase
            .from('lessons')
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update lesson: ${error.message}`, 400);
        }

        return data;
    }

    async deleteLesson(id: string, tenantId?: string) {
        const supabase = await createClient();
        await this.getLesson(id, tenantId);

        const { error } = await supabase
            .from('lessons')
            .delete()
            .eq('id', id);

        if (error) {
            throw new AppError(`Failed to delete lesson: ${error.message}`, 400);
        }

        return true;
    }

    async markLessonComplete(id: string, userId: string, timeSpentMinutes: number, progressPercentage: number) {
        const supabase = await createClient();
        const isCompleted = progressPercentage >= 100;
        const status = isCompleted ? 'completed' : 'in_progress';

        // Check if existing progress
        const { data: existing } = await supabase
            .from('lesson_progress')
            .select('id, status, time_spent_minutes')
            .eq('lesson_id', id)
            .eq('portal_user_id', userId)
            .maybeSingle();

        let errorResponse;

        if (existing) {
            const { error } = await supabase
                .from('lesson_progress')
                .update({
                    status,
                    progress_percentage: Math.min(100, Math.max(0, progressPercentage)),
                    time_spent_minutes: (existing.time_spent_minutes || 0) + timeSpentMinutes,
                    completed_at: isCompleted && existing.status !== 'completed' ? new Date().toISOString() : undefined,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            errorResponse = error;
        } else {
            const { error } = await supabase
                .from('lesson_progress')
                .insert([{
                    lesson_id: id,
                    portal_user_id: userId,
                    status,
                    progress_percentage: Math.min(100, Math.max(0, progressPercentage)),
                    time_spent_minutes: timeSpentMinutes,
                    completed_at: isCompleted ? new Date().toISOString() : null
                }]);
            errorResponse = error;
        }

        if (errorResponse) {
            throw new AppError(`Failed to track progress: ${errorResponse.message}`, 500);
        }

        // Trigger Gamification points here if completely finished and wasn't before
        if (isCompleted && existing?.status !== 'completed') {
            const { gamificationService } = await import('./gamification.service');
            const { badgeService } = await import('./badge.service');

            const result = await gamificationService.awardPoints(userId, 'lesson_complete', id, 'Completed a lesson');
            await badgeService.awardBadgeIfEligible(userId, 'points_milestone', { totalPoints: result.totalPoints });
            await badgeService.awardBadgeIfEligible(userId, 'streak_milestone', { streak: result.streak });
        }

        return { success: true, status };
    }
}

export const lessonsService = new LessonsService();
