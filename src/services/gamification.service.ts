import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';

export type ActivityType = 'lesson_complete' | 'assignment_submit' | 'quiz_pass' | 'discussion_post' | 'daily_login';

const POINTS_CONFIG: Record<ActivityType, number> = {
    lesson_complete: 10,
    assignment_submit: 25,
    quiz_pass: 50,
    discussion_post: 5,
    daily_login: 10
};

export class GamificationService {
    async awardPoints(userId: string, activityType: ActivityType, referenceId?: string, description?: string) {
        const supabase = await createClient();
        const points = POINTS_CONFIG[activityType];

        // 1. Log transaction
        await supabase.from('point_transactions').insert([{
            portal_user_id: userId,
            points,
            activity_type: activityType,
            reference_id: referenceId,
            description
        }]);

        // 2. Update user_points (upsert)
        const { data: currentPoints } = await supabase
            .from('user_points')
            .select('*')
            .eq('portal_user_id', userId)
            .single();

        const today = new Date().toISOString().split('T')[0];
        let streak = currentPoints?.current_streak || 0;
        let lastActivity = currentPoints?.last_activity_date;

        // Streak logic
        if (lastActivity) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastActivity === yesterdayStr) {
                streak += 1;
            } else if (lastActivity !== today) {
                streak = 1;
            }
        } else {
            streak = 1;
        }

        const totalPoints = (currentPoints?.total_points || 0) + points;
        const newLevel = this.calculateLevel(totalPoints);

        const { error } = await supabase.from('user_points').upsert({
            portal_user_id: userId,
            total_points: totalPoints,
            current_streak: streak,
            longest_streak: Math.max(streak, currentPoints?.longest_streak || 0),
            last_activity_date: today,
            achievement_level: newLevel,
            updated_at: new Date().toISOString()
        });

        if (error) throw new AppError(error.message, 500);

        // 3. Level up notification
        if (currentPoints && currentPoints.achievement_level !== newLevel) {
            await notificationsService.logNotification(
                userId,
                'Level Up! 🎉',
                `Congratulations! You've reached the ${newLevel} level.`,
                'success'
            );
        }

        return { points, totalPoints, newLevel, streak };
    }

    private calculateLevel(points: number): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' {
        if (points >= 5000) return 'Platinum';
        if (points >= 2000) return 'Gold';
        if (points >= 500) return 'Silver';
        return 'Bronze';
    }

    async getLeaderboard(courseId?: string, period: 'weekly' | 'monthly' | 'all' = 'all') {
        const supabase = await createClient();

        let query;
        if (courseId) {
            // Get users enrolled in the course and their points
            const { data: courseData, error: courseError } = await supabase.from('courses').select('program_id').eq('id', courseId).single();
            if (courseError) throw new AppError(courseError.message, 500);
            if (!courseData) throw new AppError('Course not found', 404);
            if (!courseData.program_id) throw new AppError('Course does not have an associated program', 400);

            query = supabase
                .from('enrollments')
                .select('user_id, portal_users(full_name, profile_image_url), user_points(total_points, achievement_level)')
                .eq('program_id', courseData.program_id)
                .order('user_points(total_points)', { ascending: false });
        } else {
            query = supabase
                .from('user_points')
                .select('portal_user_id, total_points, achievement_level, portal_users(full_name, profile_image_url)')
                .order('total_points', { ascending: false });
        }

        const { data, error } = await query.limit(20);
        if (error) throw new AppError(error.message, 500);

        return data.map((item: any, index: number) => {
            const user = item.portal_users || item.portal_user;
            const points = item.user_points || item;
            return {
                rank: index + 1,
                user_id: item.user_id || item.portal_user_id,
                name: user?.full_name,
                points: points?.total_points || 0,
                level: points?.achievement_level || 'Bronze',
                avatar: user?.profile_image_url
            };
        });
    }
}

export const gamificationService = new GamificationService();
