import { createClient } from '@/lib/supabase/server';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';
import { emitToUser } from '@/lib/socket-io';
import { redisCache } from '@/lib/redis';
import { createHash } from 'crypto';

// Preference columns added in migration 20260501000005
export type NotificationCategory =
  | 'payment_updates'
  | 'report_published'
  | 'attendance_alerts'
  | 'weekly_summary'
  | 'streak_reminder'
  | 'email_enabled';

const IDEMPOTENCY_TTL = 600; // 10 minutes

export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
    fromEmail?: string;
}

export interface SMSPayload {
    to: string;
    body: string;
}

export interface WhatsAppPayload {
    to: string;
    body: string;
}

export class NotificationsService {
    private sendPulseToken: string | null = null;
    private tokenExpiresAt: number = 0;

    private async getSendPulseToken(): Promise<string> {
        if (this.sendPulseToken && Date.now() < this.tokenExpiresAt) {
            return this.sendPulseToken;
        }

        if (!env.SENDPULSE_API_ID || !env.SENDPULSE_API_SECRET) {
            throw new AppError('SendPulse credentials are not configured', 500);
        }

        const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: env.SENDPULSE_API_ID,
                client_secret: env.SENDPULSE_API_SECRET
            })
        });

        if (!res.ok) {
            throw new AppError('Failed to authenticate with SendPulse', 500);
        }

        const data = await res.json();
        this.sendPulseToken = data.access_token;
        // Expire 60 seconds before actual token expiration for safety buffer
        this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
        return this.sendPulseToken as string;
    }

    /**
     * Show a pop-up notification to the user
     */
    async showPopupNotification(userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
        try {
            // Log to database
            await this.logNotification(userId, title, message, type);
            
            // Emit real-time pop-up event
            emitToUser(userId, 'notification:popup', {
                id: createHash('sha256').update(`${userId}:${Date.now()}:${title}`).digest('hex'),
                title,
                message,
                type,
                timestamp: new Date().toISOString(),
                autoClose: type === 'success' ? 5000 : type === 'error' ? 10000 : 7000
            });
        } catch (err) {
            console.error('Failed to show popup notification:', err);
        }
    }

    // internal utility to log notification sent internally
    public async logNotification(userId: string, title: string, message: string, type: string = 'info') {
        try {
            const supabase = await createClient();
            await supabase.from('notifications').insert([{
                user_id: userId,
                title,
                message,
                type,
                is_read: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

            // Emit real-time event
            emitToUser(userId, 'notification:new', {
                title,
                message,
                type,
                created_at: new Date().toISOString()
            });
        } catch (err) {
            console.error('Failed to log notification to database:', err);
        }
    }

    private async fetchWithRetry(url: string, options: RequestInit, retries: number = 2): Promise<Response> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, options);
                if (!res.ok) {
                    let errText = await res.text().catch(() => 'Unknown Error');
                    throw new Error(`SendPulse API error [${res.status}]: ${errText}`);
                }
                return res;
            } catch (error: any) {
                console.warn(`SendPulse attempt ${attempt} failed: ${error.message}`);
                if (attempt === retries) {
                    throw error;
                }
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
        throw new Error('All retry attempts failed');
    }

    private async checkPreferences(userId: string, type: 'email' | 'sms'): Promise<boolean> {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase
                .from('notification_preferences')
                .select('email_enabled, sms_enabled')
                .eq('portal_user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error(`Error fetching notification preferences for user ${userId}:`, error);
                return true;
            }

            if (!data) {
                return true; // No preferences set — default to allow
            }

            if (type === 'email') {
                return data.email_enabled ?? true;
            } else if (type === 'sms') {
                return data.sms_enabled ?? true;
            }
            return true;
        } catch (err) {
            console.error(`Failed to check notification preferences for user ${userId}:`, err);
            return true;
        }
    }

    /**
     * Checks whether a specific notification category is enabled for a user.
     * Falls back to true (allow) on any error so notifications are not silently
     * dropped due to a DB issue.
     */
    private async checkCategoryPreference(
        userId: string,
        category: NotificationCategory,
    ): Promise<boolean> {
        if (category === 'email_enabled') return this.checkPreferences(userId, 'email');
        try {
            const supabase = await createClient();
            const { data, error } = await supabase
                .from('notification_preferences')
                .select(category)
                .eq('portal_user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') return true;
            if (!data) return true;
            return (data as any)[category] ?? true;
        } catch {
            return true;
        }
    }

    /**
     * Category-aware email send with idempotency guard (Req 8.4, Req 24).
     *
     * - Computes SHA-256(to + eventType + referenceId) as idempotency key
     * - Skips send if key already exists in Redis (10-min TTL)
     * - Checks the corresponding notification_preferences column
     * - Retries SendPulse once after 30 s on non-2xx (Req 24.4)
     */
    async sendCategorisedEmail(params: {
        userId: string;
        to: string;
        subject: string;
        html: string;
        category: NotificationCategory;
        eventType: string;
        referenceId: string;
        fromName?: string;
        fromEmail?: string;
    }): Promise<boolean> {
        const { userId, to, subject, html, category, eventType, referenceId } = params;

        // 1. Idempotency check
        const hash = createHash('sha256')
            .update(`${to}:${eventType}:${referenceId}`)
            .digest('hex');
        const idemKey = `email_idem:${hash}`;

        const existing = await redisCache.get<string>(idemKey);
        if (existing) {
            console.warn('[notifications] Suppressed duplicate email', { idemKey, to, eventType });
            return false;
        }

        // 2. Category preference check
        const allowed = await this.checkCategoryPreference(userId, category);
        if (!allowed) {
            console.warn(`[notifications] Category "${category}" disabled for user ${userId}. Skipping.`);
            return false;
        }

        // 3. Set idempotency key before dispatch
        await redisCache.set(idemKey, '1', IDEMPOTENCY_TTL);

        // 4. Send (with one retry after 30 s on failure)
        const payload: EmailPayload = {
            to,
            subject,
            html,
            fromName: params.fromName,
            fromEmail: params.fromEmail,
        };

        try {
            await this.sendEmail(userId, payload);
            return true;
        } catch (firstErr: any) {
            console.warn('[notifications] First send attempt failed, retrying in 30 s:', firstErr.message);
            await new Promise(r => setTimeout(r, 30_000));
            try {
                await this.sendEmail(userId, payload);
                return true;
            } catch (retryErr: any) {
                console.error('[notifications] Retry also failed:', retryErr.message);
                // Remove idempotency key so a future manual retry can go through
                await redisCache.del(idemKey);
                return false;
            }
        }
    }

    // Task 26.1: Create SendPulse integration for SendEmail
    async sendEmail(userId: string, payload: EmailPayload) {
        if (!(await this.checkPreferences(userId, 'email'))) {
            console.log(`User ${userId} has disabled email notifications. Skipping.`);
            return false;
        }

        const token = await this.getSendPulseToken();

        const emailData = {
            email: {
                html: Buffer.from(payload.html).toString('base64'),
                text: payload.html.replace(/<[^>]+>/g, ''),
                subject: payload.subject,
                from: {
                    name: payload.fromName || 'LMS Notifications',
                    email: payload.fromEmail || 'no-reply@rillcod.com'
                },
                to: [
                    { email: payload.to }
                ]
            }
        };

        try {
            await this.fetchWithRetry('https://api.sendpulse.com/smtp/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailData)
            });

            await this.logNotification(userId, payload.subject, 'Email sent successfully');
            return true;
        } catch (error: any) {
            await this.logNotification(userId, 'Email Delivery Failed', payload.subject, 'error');
            throw new AppError(`Email delivery failed: ${error.message}`, 500);
        }
    }

    // Send to non-portal recipients (no user preferences/logging)
    async sendExternalEmail(payload: EmailPayload) {
        const token = await this.getSendPulseToken();

        const emailData = {
            email: {
                html: Buffer.from(payload.html).toString('base64'),
                text: payload.html.replace(/<[^>]+>/g, ''),
                subject: payload.subject,
                from: {
                    name: payload.fromName || 'LMS Notifications',
                    email: payload.fromEmail || 'no-reply@rillcod.com'
                },
                to: [{ email: payload.to }]
            }
        };

        await this.fetchWithRetry('https://api.sendpulse.com/smtp/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        return true;
    }

    // Task 27.1 (SendPulse Replacement): Create SendPulse integration for SMS
    async sendSMS(userId: string, payload: SMSPayload) {
        if (!(await this.checkPreferences(userId, 'sms'))) {
            console.log(`User ${userId} has disabled SMS notifications. Skipping.`);
            return false;
        }

        const token = await this.getSendPulseToken();

        const smsData = {
            sender: 'LMS Platform',
            phones: [payload.to.replace(/[^0-9]/g, '')],  // ensure numeric mapping formatting requirement
            body: payload.body,
            transliterate: 0
        };

        try {
            await this.fetchWithRetry('https://api.sendpulse.com/sms/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(smsData)
            });

            await this.logNotification(userId, 'SMS Notification Sent', payload.body);
            return true;
        } catch (error: any) {
            await this.logNotification(userId, 'SMS Delivery Failed', payload.body, 'error');
            throw new AppError(`SMS delivery failed: ${error.message}`, 500);
        }
    }

    async sendWhatsApp(userId: string, payload: Partial<WhatsAppPayload> & { body: string }) {
        if (!(await this.checkPreferences(userId, 'sms'))) {
            console.log(`User ${userId} has disabled SMS/WhatsApp notifications. Skipping.`);
            return false;
        }

        let phone = payload.to;
        if (!phone) {
            const supabase = await createClient();
            const { data: userProfile } = await supabase.from('portal_users').select('phone').eq('id', userId).single();
            if (userProfile?.phone) {
                phone = userProfile.phone;
            } else {
                console.log(`User ${userId} has no phone number on file. Cannot send WhatsApp.`);
                return false;
            }
        }

        try {
            const result = await this.sendExternalWhatsApp({ to: phone, body: payload.body });
            await this.logNotification(userId, 'WhatsApp Notification Sent', payload.body, 'info');
            return result;
        } catch (error: any) {
            await this.logNotification(userId, 'WhatsApp Delivery Failed', payload.body, 'error');
            throw new AppError(`WhatsApp delivery failed: ${error.message}`, 500);
        }
    }

    // Task 29.2: Trigger assignment due date reminders (24 hours before)
    async checkUpcomingAssignments() {
        const supabase = await createClient();

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString();
        const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();

        // Find assignments due tomorrow
        const { data: assignments } = await supabase
            .from('assignments')
            .select('id, title, due_date, course_id')
            .gte('due_date', startOfTomorrow)
            .lte('due_date', endOfTomorrow);

        if (assignments) {
            for (const assignment of assignments) {
                if (!assignment.course_id) continue;
                // Find students in the course/program
                // For simplicity, find all students enrolled in the program of this course
                const { data: course } = await supabase.from('courses').select('program_id').eq('id', assignment.course_id).single();

                if (course?.program_id) {
                    // Portal users use `enrollments` with `user_id` (not student_enrollments)
                    const { data: enrollments } = await supabase
                        .from('enrollments')
                        .select('user_id, portal_users(email, full_name)')
                        .eq('program_id', course.program_id)
                        .eq('status', 'active');

                    if (enrollments) {
                        const template = await templatesService.getTemplate('Assignment Reminder', 'email');

                        for (const enrollment of enrollments) {
                            if (!enrollment.user_id) continue;
                            const user = enrollment.portal_users as any;
                            if (user?.email) {
                                await queueService.queueNotification(enrollment.user_id, 'email', {
                                    to: user.email,
                                    subject: templatesService.render(template.subject || 'Assignment Reminder', { assignment_name: assignment.title }),
                                    html: templatesService.render(template.content, {
                                        user_name: user.full_name,
                                        assignment_name: assignment.title,
                                        due_date: new Date(assignment.due_date || '').toLocaleString()
                                    })
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    async sendExternalWhatsApp(payload: WhatsAppPayload) {
        if (!env.WHATSAPP_API_URL || !env.WHATSAPP_API_TOKEN) {
            // Fallback for environments without a provider configured.
            return {
                queued: true,
                fallback_url: `https://wa.me/${String(payload.to).replace(/\D+/g, '')}?text=${encodeURIComponent(payload.body)}`,
            };
        }

        // Clean user's phone number (remove spaces, hashes, pluses)
        let phone = String(payload.to).replace(/\D+/g, '');
        // Meta requires international format without the '+'
        // If a Nigerian number starts with '0', replace '0' with '234'
        if (phone.startsWith('0')) {
            phone = '234' + phone.substring(1);
        }

        const res = await fetch(env.WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phone,
                type: 'text',
                text: {
                    preview_url: true, // Allows URLs in messages to show link previews
                    body: payload.body,
                }
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => 'unknown');
            throw new AppError(`WhatsApp delivery failed: ${text}`, 500);
        }
        return res.json().catch(() => ({ sent: true }));
    }
}

export const notificationsService = new NotificationsService();
