import { createClient } from '@/lib/supabase/server';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';
import { emitToUser } from '@/lib/socket-io';

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

    private async fetchWithRetry(url: string, options: RequestInit, retries: number = 3): Promise<any> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, options);
                if (!res.ok) {
                    let errText = await res.text().catch(() => 'Unknown Error');
                    throw new Error(`SendPulse API error [${res.status}]: ${errText}`);
                }
                return await res.json();
            } catch (error: any) {
                console.warn(`SendPulse attempt ${attempt} failed: ${error.message}`);
                if (attempt === retries) {
                    throw error;
                }
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
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

        const res = await fetch(env.WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: payload.to,
                message: payload.body,
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
