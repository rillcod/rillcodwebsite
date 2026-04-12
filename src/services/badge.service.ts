import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { notificationsService } from './notifications.service';
import { BADGES, Badge, calculateMilestones, Milestone } from '@/lib/badges';

export interface BadgeCriteria {
    type: 'course_complete' | 'points_milestone' | 'streak_milestone' | 'discussion_expert';
    threshold?: number;
    course_id?: string;
}

export interface BadgeProgress {
    badges: Badge[];
    earnedBadgeIds: string[];
    milestones: Milestone[];
    totalBadgesEarned: number;
}

export class BadgeService {
    async getBadgeProgress(userId: string): Promise<BadgeProgress> {
        const supabase = await createClient();

        // Get user's learning data
        const [lessonsData, assignmentsData, projectsData, streakData] = await Promise.all([
            supabase
                .from('lesson_completions')
                .select('id')
                .eq('user_id', userId),
            supabase
                .from('assignment_submissions')
                .select('id, score')
                .eq('user_id', userId)
                .eq('status', 'completed'),
            supabase
                .from('portfolio_projects')
                .select('id')
                .eq('user_id', userId)
                .eq('is_published', true),
            supabase
                .from('user_learning_stats')
                .select('current_streak, lessons_completed, assignments_completed')
                .eq('user_id', userId)
                .single()
        ]);

        const lessonsCompleted = lessonsData.data?.length || 0;
        const assignmentsCompleted = assignmentsData.data?.length || 0;
        const projectsCreated = projectsData.data?.length || 0;
        const currentStreak = streakData.data?.current_streak || 0;

        // Calculate earned badges
        const earnedBadgeIds = this.calculateEarnedBadges(
            lessonsCompleted,
            assignmentsCompleted,
            projectsCreated,
            currentStreak,
            assignmentsData.data || []
        );

        const milestones = calculateMilestones(
            lessonsCompleted,
            assignmentsCompleted,
            projectsCreated,
            currentStreak
        );

        return {
            badges: Object.values(BADGES),
            earnedBadgeIds,
            milestones,
            totalBadgesEarned: earnedBadgeIds.length
        };
    }

    private calculateEarnedBadges(
        lessonsCompleted: number,
        assignmentsCompleted: number,
        projectsCreated: number,
        currentStreak: number,
        assignments: any[]
    ): string[] {
        const earned: string[] = [];

        if (lessonsCompleted >= 1) earned.push('first_step');
        if (currentStreak >= 7) earned.push('lesson_streak_7');
        if (lessonsCompleted >= 10) earned.push('speed_learner');
        if (assignmentsCompleted >= 20) {
            const highScoreCount = assignments.filter(a => (a.score || 0) >= 90).length;
            if (highScoreCount >= 20) earned.push('assignment_excellence');
        }
        if (projectsCreated >= 5) earned.push('project_creator');
        if (projectsCreated >= 1) earned.push('portfolio_star');
        if (currentStreak >= 30) earned.push('consistency_champion');
        if (assignmentsCompleted >= 15) {
            const perfectCodeAssignments = assignments.filter(a => (a.score || 0) >= 95).length;
            if (perfectCodeAssignments >= 15) earned.push('code_ninja');
        }
        if (lessonsCompleted >= 50) earned.push('course_mastery');
        if (lessonsCompleted >= 35) earned.push('all_rounder');

        return earned;
    }

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
