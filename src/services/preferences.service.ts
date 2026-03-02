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
};

export class PreferencesService {
    async getPreferences(userId: string): Promise<UserPreferences> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('notification_preferences')
            .select('email_enabled, sms_enabled, push_enabled, assignment_reminders, grade_notifications, announcement_notifications, discussion_replies, marketing_emails')
            .eq('portal_user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new AppError(`Failed to fetch preferences: ${error.message}`, 500);
        }

        return data || DEFAULTS;
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
