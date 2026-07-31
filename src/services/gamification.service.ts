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
    /**
     * Awards XP points for an activity exactly once per (userId, activityType,
     * referenceId) triple (Req 4.2 — ON CONFLICT DO NOTHING).
     *
     * total_points is recalculated from the SUM of all point_transactions rows
     * rather than incrementing a stored counter (Req 4.3).
     *
     * Returns { awarded: true } when a new row was inserted, or
     * { awarded: false } when the triple already existed (duplicate call).
     */
    async awardPoints(
        userId: string,
        activityType: ActivityType,
        referenceId?: string,
        description?: string,
    ): Promise<{ awarded: boolean; totalPoints: number; newLevel: string; streak: number }> {
        const supabase = await createClient();
        const points = POINTS_CONFIG[activityType];

        // 1. Idempotent insert — ON CONFLICT (portal_user_id, activity_type, reference_id) DO NOTHING
        const { error: insertError, count } = await supabase
            .from('point_transactions')
            .insert([{
                portal_user_id: userId,
                points,
                activity_type: activityType,
                reference_id: referenceId ?? null,
                description,
            }], { count: 'exact' });

        if (insertError) throw new AppError(insertError.message, 500);

        const awarded = (count ?? 0) > 0;

        // 2. Recalculate total_points from SUM (Req 4.3)
        // PostgREST refuses aggregate functions ("Use of aggregate functions is not allowed"), so
        // points.sum() threw on every call and awarding points failed outright. Summed in code
        // instead, and paged: PostgREST caps a response at 1000 rows, and a silently truncated
        // sum would hand the learner a wrong lifetime total that then gets written back.
        let totalPoints = 0;
        for (let page = 0; ; page++) {
            const from = page * 1000;
            const { data: rows, error: sumError } = await supabase
                .from('point_transactions')
                .select('points')
                .eq('portal_user_id', userId)
                .range(from, from + 999);
            if (sumError) throw new AppError(sumError.message, 500);
            for (const row of rows ?? []) totalPoints += Number((row as any).points ?? 0);
            if (!rows || rows.length < 1000) break;
        }

        // 3. Update user_points (streak + level)
        const { data: currentPoints } = await supabase
            .from('user_points')
            .select('*')
            .eq('portal_user_id', userId)
            .single();

        const today = new Date().toISOString().split('T')[0];
        let streak = currentPoints?.current_streak || 0;
        const lastActivity = currentPoints?.last_activity_date;

        // Only update streak if this is a NEW day of activity
        if (lastActivity) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (lastActivity === yesterdayStr) {
                // Consecutive day - increment streak
                streak += 1;
            } else if (lastActivity === today) {
                // Same day - keep current streak, don't increment
                // This prevents multiple activities on same day from inflating streak
            } else {
                // Gap in activity - reset to 1
                streak = 1;
            }
        } else {
            // First activity ever
            streak = 1;
        }

        const newLevel = this.calculateLevel(totalPoints);

        const { error: upsertError } = await supabase.from('user_points').upsert({
            portal_user_id: userId,
            total_points: totalPoints,
            current_streak: streak,
            longest_streak: Math.max(streak, currentPoints?.longest_streak || 0),
            last_activity_date: today,
            achievement_level: newLevel,
            updated_at: new Date().toISOString(),
        });

        if (upsertError) throw new AppError(upsertError.message, 500);

        // 4. Level-up notification (only when a new row was actually inserted)
        if (awarded && currentPoints && currentPoints.achievement_level !== newLevel) {
            await notificationsService.logNotification(
                userId,
                'Level Up! 🎉',
                `Congratulations! You've reached the ${newLevel} level.`,
                'success',
            );
        }

        return { awarded, totalPoints, newLevel, streak };
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

            // enrollments and user_points share no foreign key, so PostgREST cannot embed one in
            // the other — the old query threw and the course leaderboard never rendered. Resolve
            // the enrolled users first, then read their points directly. Paged, because a
            // truncated enrolment list would quietly drop learners off the board.
            const enrolled: string[] = [];
            for (let page = 0; ; page++) {
                const from = page * 1000;
                const { data: rows, error: enrErr } = await supabase
                    .from('enrollments')
                    .select('user_id')
                    .eq('program_id', courseData.program_id)
                    .range(from, from + 999);
                if (enrErr) throw new AppError(enrErr.message, 500);
                for (const row of rows ?? []) if ((row as any).user_id) enrolled.push((row as any).user_id);
                if (!rows || rows.length < 1000) break;
            }
            if (enrolled.length === 0) return [];

            // Same shape as the all-users branch below, so the mapping stays one code path.
            query = supabase
                .from('user_points')
                .select('portal_user_id, total_points, achievement_level, portal_users!user_points_portal_user_id_fkey(full_name, profile_image_url)')
                .in('portal_user_id', enrolled)
                .order('total_points', { ascending: false });
        } else {
            query = supabase
                .from('user_points')
                .select('portal_user_id, total_points, achievement_level, portal_users!user_points_portal_user_id_fkey(full_name, profile_image_url)')
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
