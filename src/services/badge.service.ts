import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';

export interface BadgeCriteria {
    type: 'course_complete' | 'points_milestone' | 'streak_milestone' | 'discussion_expert';
    threshold?: number;
    course_id?: string;
}

export class BadgeService {
    async awardBadgeIfEligible(userId: string, criteriaType: BadgeCriteria['type'], data: any = {}) {
        const supabase = await createClient();

        // 1. Fetch available badges for this criteria type
        const { data: badges } = await supabase
            .from('badges')
            .select('*')
            .eq('is_active', true);

        if (!badges) return;

        // 2. Filter badges that match the criteria
        for (const badge of badges) {
            const criteria = badge.criteria as unknown as BadgeCriteria;
            if (criteria.type !== criteriaType) continue;

            // Check if already earned
            const { data: existing } = await supabase
                .from('user_badges')
                .select('*')
                .eq('portal_user_id', userId)
                .eq('badge_id', badge.id)
                .single();

            if (existing) continue;

            // 3. Logic check based on criteria
            let isEligible = false;

            if (criteriaType === 'course_complete') {
                if (criteria.course_id === data.courseId) isEligible = true;
            } else if (criteriaType === 'points_milestone') {
                if (data.totalPoints >= (criteria.threshold || 0)) isEligible = true;
            } else if (criteriaType === 'streak_milestone') {
                if (data.streak >= (criteria.threshold || 0)) isEligible = true;
            }

            if (isEligible) {
                await this.awardBadge(userId, badge.id);
            }
        }
    }

    private async awardBadge(userId: string, badgeId: string) {
        const supabase = await createClient();
        const { data: badge } = await supabase.from('badges').select('name').eq('id', badgeId).single();

        const { error } = await supabase.from('user_badges').insert([{
            portal_user_id: userId,
            badge_id: badgeId,
            earned_at: new Date().toISOString()
        }]);

        if (!error) {
            await notificationsService.logNotification(
                userId,
                'New Badge Earned! 🏆',
                `You've just earned the "${badge?.name}" badge! Check your profile to see it.`,
                'success'
            );
        }
    }

    async getPlayerBadges(userId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_badges')
            .select('earned_at, badges(*)')
            .eq('portal_user_id', userId);

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    // Admin tool: Seed initial badges
    async seedDefaultBadges() {
        const supabase = await createClient();
        const defaults = [
            { name: 'Fast Learner', description: 'Complete your first course', criteria: { type: 'course_complete' }, points_value: 100 },
            { name: 'Centurion', description: 'Earn 100 points', criteria: { type: 'points_milestone', threshold: 100 }, points_value: 50 },
            { name: 'On Fire', description: 'Maintain a 7-day streak', criteria: { type: 'streak_milestone', threshold: 7 }, points_value: 150 },
            { name: 'Scholar', description: 'Earn 1000 points', criteria: { type: 'points_milestone', threshold: 1000 }, points_value: 500 }
        ];

        for (const b of defaults) {
            await supabase.from('badges').upsert(b, { onConflict: 'name' });
        }
    }
}

export const badgeService = new BadgeService();
