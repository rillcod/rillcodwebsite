import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

// Matches the `notification_preferences` table columns exactly
export interface UserPreferences {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    assignment_reminders: boolean;
    grade_notifications: boolean;
    announcement_notifications: boolean;
    discussion_replies: boolean;
    marketing_emails: boolean;
    // New columns added in migration 20260501000005 (Req 8.1, NF-5.4)
    payment_updates: boolean;
    report_published: boolean;
    attendance_alerts: boolean;
    weekly_summary: boolean;
    streak_reminder: boolean;
}

const DEFAULTS: UserPreferences = {
    email_enabled: true,
    sms_enabled: false,
    push_enabled: true,
    assignment_reminders: true,
    grade_notifications: true,
    announcement_notifications: true,
    discussion_replies: true,
    marketing_emails: false,
    payment_updates: true,
    report_published: true,
    attendance_alerts: true,
    weekly_summary: true,
    streak_reminder: true,
};

export class PreferencesService {
    async getPreferences(userId: string): Promise<UserPreferences> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('notification_preferences')
            .select('email_enabled, sms_enabled, push_enabled, assignment_reminders, grade_notifications, announcement_notifications, discussion_replies, marketing_emails, payment_updates, report_published, attendance_alerts, weekly_summary, streak_reminder')
            .eq('portal_user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new AppError(`Failed to fetch preferences: ${error.message}`, 500);
        }

        if (!data) return DEFAULTS;

        return {
            email_enabled: data.email_enabled ?? DEFAULTS.email_enabled,
            sms_enabled: data.sms_enabled ?? DEFAULTS.sms_enabled,
            push_enabled: data.push_enabled ?? DEFAULTS.push_enabled,
            assignment_reminders: data.assignment_reminders ?? DEFAULTS.assignment_reminders,
            grade_notifications: data.grade_notifications ?? DEFAULTS.grade_notifications,
            announcement_notifications: data.announcement_notifications ?? DEFAULTS.announcement_notifications,
            discussion_replies: data.discussion_replies ?? DEFAULTS.discussion_replies,
            marketing_emails: data.marketing_emails ?? DEFAULTS.marketing_emails,
            payment_updates: (data as any).payment_updates ?? DEFAULTS.payment_updates,
            report_published: (data as any).report_published ?? DEFAULTS.report_published,
            attendance_alerts: (data as any).attendance_alerts ?? DEFAULTS.attendance_alerts,
            weekly_summary: (data as any).weekly_summary ?? DEFAULTS.weekly_summary,
            streak_reminder: (data as any).streak_reminder ?? DEFAULTS.streak_reminder,
        };
    }

    async updatePreferences(userId: string, prefs: Partial<UserPreferences>) {
        const supabase = await createClient();
        const { error } = await supabase
            .from('notification_preferences')
            .upsert({
                portal_user_id: userId,
                ...prefs,
                updated_at: new Date().toISOString()
            }, { onConflict: 'portal_user_id' });

        if (error) {
            throw new AppError(`Failed to update preferences: ${error.message}`, 400);
        }

        return true;
    }
}

export const preferencesService = new PreferencesService();
