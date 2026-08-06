import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import {
    POINTS,
    levelFor,
    nextStreak,
    pointsForActivity,
    type ActivityType,
} from '@/lib/engagement/progress';
import { notificationsService } from './notifications.service';

// The earn rules, the ladder and the wording all live in lib/engagement so the
// service, the API and the UI cannot drift into three different answers about
// what a learner has earned.
export type { ActivityType } from '@/lib/engagement/progress';
const POINTS_CONFIG = POINTS;

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
        // Awarding points is a system act, not a user act, so it runs with the
        // admin client.
        //
        // It used to use the caller's session. `point_transactions` has RLS on
        // and no policy at all, and `user_points` has only a SELECT policy, so
        // both writes were refused and every award — lesson complete, quiz pass,
        // assignment submit, discussion post — silently did nothing. The whole
        // table holds one row.
        //
        // The fix is deliberately not "open the table to authenticated users":
        // a learner who can insert into point_transactions can award themselves
        // any score. Writes stay server-side; the SELECT policy added alongside
        // this lets a learner read their own history and nothing more.
        const supabase = createAdminClient();

        // Discussion posts each carry their own reference id, so idempotency
        // does not stop a hundred one-word replies being farmed. Past the daily
        // cap the post still stands, it just stops paying.
        let alreadyToday = 0;
        if (activityType === 'discussion_post') {
            const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
            const { count } = await supabase
                .from('point_transactions')
                .select('id', { count: 'exact', head: true })
                .eq('portal_user_id', userId)
                .eq('activity_type', 'discussion_post')
                .gte('created_at', dayStart);
            alreadyToday = count ?? 0;
        }
        const points = pointsForActivity(activityType, { alreadyToday });

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
        const streak = nextStreak(
            currentPoints?.current_streak || 0,
            currentPoints?.last_activity_date,
            today,
        );

        const newLevel = levelFor(totalPoints);

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

    // calculateLevel lived here with thresholds of 500 / 2000 / 5000. Silver
    // alone was fifty lessons, so every learner stayed Bronze — the live table
    // had one row and it said Bronze. The ladder now lives in
    // lib/engagement/progress with reachable thresholds, and levelFor is the
    // single answer to "what level is this".

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
