import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { XP_EVENTS, BADGES, XPEvent } from '@/lib/grading';
import { notificationsService } from './notifications.service';

export class EngagementService {
  /**
   * Central function to award XP to a student.
   * Uses the admin client because only server can insert into xp_ledger.
   */
  async awardXP(
    studentId: string,
    eventKey: string,
    params: {
      refId?: string;
      refType?: 'assignment' | 'project' | 'assessment' | 'attendance' | 'streak';
      schoolId?: string;
      termNumber?: number;
      metadata?: any;
    } = {}
  ) {
    const admin = createAdminClient();
    const event = XP_EVENTS.find((e) => e.key === eventKey);
    if (!event) {
      console.warn(`XP event not found for key: ${eventKey}`);
      return null;
    }

    // Insert into ledger (which triggers summary update via DB trigger)
    const { data, error } = await admin
      .from('student_xp_ledger')
      .insert([
        {
          student_id: studentId,
          event_key: event.key,
          event_label: event.label,
          xp: event.xp,
          ref_id: params.refId,
          ref_type: params.refType,
          school_id: params.schoolId,
          term_number: params.termNumber,
          metadata: params.metadata || {},
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Failed to award XP:', error);
      return null;
    }

    // Check for level up after award
    // (Actual level is calculated by trigger, we just fetch newest summary)
    await this.checkLevelUp(studentId, event);

    return data;
  }

  /**
   * Internal helper to notify user about Level Ups or XP gains
   */
  private async checkLevelUp(studentId: string, event: XPEvent) {
    try {
      const admin = createAdminClient();
      const { data: summary } = await admin
        .from('student_xp_summary')
        .select('level, total_xp')
        .eq('student_id', studentId)
        .single();

      if (summary) {
        // Log notification for high XP gains or milestones
        if (event.xp >= 100) {
          await notificationsService.logNotification(
            studentId,
            `XP Earned! ${event.label}`,
            `You just gained ${event.xp} XP for ${event.description.toLowerCase()}.`,
            'success'
          );
        }
      }
    } catch (err) {
      console.error('Error checking level/notifications:', err);
    }
  }

  /**
   * Award a badge to a student. Handles the UNIQUE constraint gracefully.
   */
  async awardBadge(
    studentId: string,
    badgeKey: string,
    params: { refId?: string; schoolId?: string } = {}
  ) {
    const admin = createAdminClient();
    const badge = BADGES.find((b) => b.key === badgeKey);
    if (!badge) {
      console.warn(`Badge definition not found for key: ${badgeKey}`);
      return null;
    }

    const { data, error } = await admin
      .from('student_badges')
      .insert([
        {
          student_id: studentId,
          badge_key: badge.key,
          badge_label: badge.label,
          badge_icon: badge.icon,
          ref_id: params.refId,
          school_id: params.schoolId,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return null; // Already earned
      console.error('Failed to award badge:', error);
      return null;
    }

    // Notify about the new badge
    await notificationsService.logNotification(
      studentId,
      `New Badge: ${badge.label} ${badge.icon}`,
      `Amazing work! You unlocked the ${badge.label} badge: ${badge.description}`,
      'success'
    );

    return data;
  }

  /**
   * Logic to update student submission streaks.
   * This is called on assignment submission.
   */
  async updateWeeklyStreak(studentId: string) {
    const admin = createAdminClient();
    
    // Get Monday of current week as the baseline
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff)).toISOString().split('T')[0];

    const { data: streakData } = await admin
      .from('student_streaks')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    if (!streakData) {
      // First streak ever
      await admin.from('student_streaks').insert({
        student_id: studentId,
        current_streak: 1,
        longest_streak: 1,
        last_active_week: monday,
        total_active_weeks: 1,
      });
      return 1;
    }

    const lastWeek = streakData.last_active_week;
    
    if (lastWeek === monday) {
      // Already active this week, no change to count
      return streakData.current_streak;
    }

    // Check if last activity was exactly 1 week ago (approx 7 days)
    const lastDate = new Date(lastWeek!);
    const thisDate = new Date(monday);
    const msDiff = thisDate.getTime() - lastDate.getTime();
    const weekDiff = Math.abs(Math.round(msDiff / (1000 * 60 * 60 * 24 * 7)));

    let newStreak = 1;
    if (weekDiff === 1) {
      newStreak = streakData.current_streak + 1;
    }

    const longest = Math.max(newStreak, streakData.longest_streak || 0);

    await admin
      .from('student_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: longest,
        last_active_week: monday,
        total_active_weeks: streakData.total_active_weeks + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('student_id', studentId);

    // Award XP for streak milestones
    if (newStreak === 3) await this.awardXP(studentId, 'week_streak_3', { refType: 'streak' });
    if (newStreak === 6) await this.awardXP(studentId, 'week_streak_6', { refType: 'streak' });

    return newStreak;
  }

  /**
   * Log richer project engagement details
   */
  async logProjectEngagement(
    studentId: string,
    data: {
      assignmentId?: string;
      eventType: string;
      isShowcase?: boolean;
      usedAiTools?: boolean;
      feedback?: string;
      schoolId?: string;
    }
  ) {
    const admin = createAdminClient();
    const { error } = await admin.from('project_engagement').insert([
      {
        student_id: studentId,
        assignment_id: data.assignmentId,
        event_type: data.eventType,
        is_showcase: data.isShowcase || false,
        used_ai_tools: data.usedAiTools || false,
        feedback: data.feedback,
        school_id: data.schoolId,
      },
    ]);

    if (error) console.error('Failed to log project engagement:', error);
  }

  /**
   * Fetch full engagement dashboard for a student
   */
  async getStudentSummary(studentId: string) {
    const supabase = await createClient();
    
    const [summary, badges, streak, ledger] = await Promise.all([
      supabase.from('student_xp_summary').select('*').eq('student_id', studentId).maybeSingle(),
      supabase.from('student_badges').select('*').eq('student_id', studentId).order('earned_at', { ascending: false }),
      supabase.from('student_streaks').select('*').eq('student_id', studentId).maybeSingle(),
      supabase.from('student_xp_ledger').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10),
    ]);

    return {
      xp: summary.data || { total_xp: 0, level: 1, this_term_xp: 0 },
      badges: badges.data || [],
      streak: streak.data || { current_streak: 0, longest_streak: 0 },
      recentActivity: ledger.data || [],
    };
  }
}

export const engagementService = new EngagementService();
