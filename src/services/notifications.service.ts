import { createClient } from '@/lib/supabase/server';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';
import { emitToUser } from '@/lib/socket-io';
import { redisCache } from '@/lib/redis';
import { createHash } from 'crypto';
import { SMTP_FROM_EMAIL, SMTP_FROM_NAME } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordDeadLetter } from '@/lib/operations/dead-letter';

/** Convert HTML to a readable plain-text fallback for spam filters and text-only clients */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&copy;/g, '©').replace(/&rarr;/g, '→').replace(/&zwnj;/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Preference columns added in migration 20260501000005
export type NotificationCategory =
  | 'payment_updates'
  | 'report_published'
  | 'attendance_alerts'
  | 'weekly_summary'
  | 'streak_reminder'
  | 'email_enabled';

const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours: prevents frequent schedulers draining email quota

export interface EmailAttachment {
    /** Filename shown to recipient (e.g. "Assignment_Week3.pdf") */
    filename: string;
    /** Base64-encoded file content */
    content: string;
}

export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
    /** Ignored for SMTP From — SendPulse only accepts support@rillcod.com. Use replyTo for other inboxes. */
    fromEmail?: string;
    replyTo?: string;
    /** Optional file attachments (PDF, images, etc.) */
    attachments?: EmailAttachment[];
    automated?: boolean;
    templateKey?: string;
    caseId?: string;
    caseEventId?: string;
    campaignKey?: string;
    eventType?: string;
    referenceId?: string;
}

export type EmailDispatchResult = { provider: 'resend' | 'sendpulse'; providerMessageId: string };

/** Only verified SendPulse SMTP sender for rillcod.com (from brandContact). */
const SENDPULSE_FROM_EMAIL = SMTP_FROM_EMAIL;

function resolveSmtpFrom(payload: EmailPayload): { name: string; email: string } {
    const requested = (payload.fromEmail || '').trim().toLowerCase();
    if (requested && requested !== SENDPULSE_FROM_EMAIL) {
        console.warn(
            `[notifications] Ignoring unverified From "${payload.fromEmail}" — SMTP sends only as ${SENDPULSE_FROM_EMAIL}`,
        );
    }
    return {
        name: payload.fromName || SMTP_FROM_NAME,
        email: SENDPULSE_FROM_EMAIL,
    };
}

function resolveReplyTo(payload: EmailPayload): { name: string; email: string } | null {
    const requested = (payload.replyTo || '').trim().toLowerCase();
    if (!requested) return null;
    if (requested !== SENDPULSE_FROM_EMAIL) {
        console.warn(
            `[notifications] Coercing Reply-To "${payload.replyTo}" → ${SENDPULSE_FROM_EMAIL}`,
        );
    }
    return { name: '', email: SENDPULSE_FROM_EMAIL };
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
     * SendPulse can accept the HTTP request while still rejecting the message in
     * its JSON response. Delivery is accepted only when the provider returns a
     * positive result and a message id.
     */
    private async dispatchSmtpEmail(emailData: unknown): Promise<EmailDispatchResult> {
        if (env.RESEND_API_KEY) {
            try {
                const message = (emailData as { email: { html: string; text?: string; subject: string; from: { name?: string; email: string }; to: Array<{ email: string }>; reply_to?: { email: string }; attachments_binary?: Record<string, string> } }).email;
                // Keep one professional sender identity across every transactional email.
                // RESEND_FROM_EMAIL may be either an address or a formatted mailbox.
                const configuredMailbox = env.RESEND_FROM_EMAIL?.trim() || message.from.email;
                const configuredAddress = configuredMailbox.match(/<([^>]+)>/)?.[1] || configuredMailbox;
                const from = `${SMTP_FROM_NAME} <${configuredAddress}>`;
                const response = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from, to: message.to.map(recipient => recipient.email), subject: message.subject, html: Buffer.from(message.html, 'base64').toString('utf8'), text: message.text, ...(message.reply_to?.email ? { reply_to: message.reply_to.email } : {}), ...(message.attachments_binary ? { attachments: Object.entries(message.attachments_binary).map(([filename, content]) => ({ filename, content })) } : {}) }),
                });
                const raw = await response.text();
                const result = raw ? JSON.parse(raw) as { id?: string; message?: string } : {};
                if (response.ok && result.id) return { provider: 'resend', providerMessageId: result.id };
                throw new Error(result.message || `Resend rejected the email (HTTP ${response.status})`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Resend request failed';
                console.error(`[notifications] Resend failed; trying SendPulse fallback: ${message}`);
                if (!env.SENDPULSE_API_ID || !env.SENDPULSE_API_SECRET) throw new AppError(message.slice(0, 500), 502);
            }
        }

        let lastError = 'SendPulse did not accept the email';

        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                const token = await this.getSendPulseToken();
                const response = await fetch('https://api.sendpulse.com/smtp/emails', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(emailData),
                });
                const raw = await response.text();
                let result: { result?: boolean; id?: string; message?: string } = {};
                try {
                    result = raw ? JSON.parse(raw) : {};
                } catch {
                    result = {};
                }

                if (response.ok && result.result === true && typeof result.id === 'string' && result.id.trim()) {
                    return { provider: 'sendpulse', providerMessageId: result.id };
                }

                if (response.status === 401) {
                    this.sendPulseToken = null;
                    this.tokenExpiresAt = 0;
                }
                lastError = result.message || `SendPulse rejected the email (HTTP ${response.status})`;
            } catch (error: unknown) {
                lastError = error instanceof Error ? error.message : 'SendPulse request failed';
            }

            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        throw new AppError(lastError.slice(0, 500), 502);
    }

    /**
     * Show an enhanced pop-up notification to the user with rich features
     */
    async showPopupNotification(
        userId: string, 
        title: string, 
        message: string, 
        type: 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'streak' | 'celebration' = 'info',
        options: {
            priority?: 'low' | 'normal' | 'high' | 'urgent';
            autoClose?: number;
            actionLabel?: string;
            actionUrl?: string;
            category?: string;
            sound?: boolean;
            persistent?: boolean;
        } = {}
    ) {
        try {
            // Log to database
            await this.logNotification(userId, title, message, type);
            
            // Determine auto-close timing based on type and priority
            let autoClose = options.autoClose;
            if (!autoClose && !options.persistent) {
                switch (type) {
                    case 'success':
                    case 'achievement':
                        autoClose = 5000;
                        break;
                    case 'error':
                        autoClose = 10000;
                        break;
                    case 'warning':
                        autoClose = 8000;
                        break;
                    case 'celebration':
                    case 'streak':
                        autoClose = 7000;
                        break;
                    default:
                        autoClose = 6000;
                }
                
                // Adjust for priority
                if (options.priority === 'urgent') autoClose *= 1.5;
                if (options.priority === 'low') autoClose *= 0.7;
            }
            
            const notificationId = createHash('sha256').update(`${userId}:${Date.now()}:${title}`).digest('hex');
            const timestamp = new Date().toISOString();

            // Emit real-time pop-up event with enhanced data via Socket.IO
            emitToUser(userId, 'notification:popup', {
                id: notificationId,
                title,
                message,
                type,
                timestamp,
                priority: options.priority || 'normal',
                autoClose,
                actionLabel: options.actionLabel,
                actionUrl: options.actionUrl,
                category: options.category,
                sound: options.sound || ['achievement', 'streak', 'celebration'].includes(type)
            });

            // ALSO broadcast via Supabase Realtime (matches frontend PopupNotificationContainer)
            const supabase = await createClient();
            await supabase.channel(`popup-notifications-${userId}`).send({
                type: 'broadcast',
                event: 'notification:popup',
                payload: {
                    id: notificationId,
                    title,
                    message,
                    type,
                    timestamp,
                    priority: options.priority || 'normal',
                    autoClose,
                    actionLabel: options.actionLabel,
                    actionUrl: options.actionUrl,
                    category: options.category,
                    sound: options.sound || ['achievement', 'streak', 'celebration'].includes(type)
                }
            });
        } catch (err) {
            console.error('Failed to show popup notification:', err);
        }
    }

    /**
     * Show achievement notification with celebration effects
     */
    async showAchievementNotification(
        userId: string,
        achievementName: string,
        description: string,
        actionUrl?: string
    ) {
        return this.showPopupNotification(
            userId,
            `Achievement Unlocked!`,
            `${achievementName}: ${description}`,
            'achievement',
            {
                priority: 'high',
                sound: true,
                actionLabel: actionUrl ? 'View Achievement' : undefined,
                actionUrl,
                category: 'Achievement',
                autoClose: 8000
            }
        );
    }

    /**
     * Show streak notification with fire effects
     */
    async showStreakNotification(
        userId: string,
        streakCount: number,
        streakType: string = 'study'
    ) {
        const messages = [
            `You're on fire! ${streakCount} days strong! 🔥`,
            `Incredible ${streakCount}-day ${streakType} streak! Keep it up! 💪`,
            `${streakCount} days in a row! You're unstoppable! ⚡`,
            `Amazing dedication! ${streakCount} consecutive days! 🌟`
        ];
        
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        return this.showPopupNotification(
            userId,
            `${streakCount}-Day Streak!`,
            message,
            'streak',
            {
                priority: streakCount >= 7 ? 'high' : 'normal',
                sound: true,
                category: 'Streak',
                autoClose: 6000
            }
        );
    }

    /**
     * Show celebration notification for special events
     */
    async showCelebrationNotification(
        userId: string,
        event: string,
        message: string,
        actionUrl?: string
    ) {
        return this.showPopupNotification(
            userId,
            `🎉 ${event}`,
            message,
            'celebration',
            {
                priority: 'high',
                sound: true,
                actionLabel: actionUrl ? 'Celebrate' : undefined,
                actionUrl,
                category: 'Celebration',
                autoClose: 7000
            }
        );
    }

    /**
     * Show urgent notification that requires immediate attention
     */
    async showUrgentNotification(
        userId: string,
        title: string,
        message: string,
        actionLabel?: string,
        actionUrl?: string
    ) {
        return this.showPopupNotification(
            userId,
            title,
            message,
            'warning',
            {
                priority: 'urgent',
                sound: true,
                persistent: true, // Don't auto-close
                actionLabel,
                actionUrl,
                category: 'Urgent'
            }
        );
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
                    const errText = await res.text().catch(() => 'Unknown Error');
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
     * - Skips send if key already exists in Redis (24-hour TTL)
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
            console.warn('[notifications] Suppressed duplicate email', {
                idemKey,
                to: to ? `${String(to).slice(0, 2)}***` : null,
                eventType,
            });
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

    private addAutomationNotice(html: string, automated: boolean | undefined): string {
        if (automated === false || /automated service message/i.test(html)) return html;
        return `${html}<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;color:#64748b;font-size:11px;line-height:1.5;">This is an automated service message from Rillcod Technologies. Reply to reach the team handling your request.</p>`;
    }

    private async recordEmailDelivery(payload: EmailPayload, result: EmailDispatchResult | null, error?: string, forcedStatus?: 'sent' | 'failed' | 'suppressed') {
        try {
            const db = createAdminClient() as any;
            await db.from('communication_delivery_log').insert({
                case_id: payload.caseId ?? null,
                case_event_id: payload.caseEventId ?? null,
                channel: 'email', recipient: payload.to,
                provider: result?.provider ?? null,
                provider_message_id: result?.providerMessageId ?? null,
                status: forcedStatus || (error ? 'failed' : 'sent'),
                automated: payload.automated !== false,
                template_key: payload.templateKey ?? null,
                campaign_key: payload.campaignKey ?? null,
                error: error?.slice(0, 4000) ?? null,
                metadata: { subject: payload.subject, event_type: payload.eventType ?? null, reference_id: payload.referenceId ?? null },
                sent_at: error ? null : new Date().toISOString(),
                failed_at: error && forcedStatus !== 'suppressed' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            });
        } catch (logError) {
            console.error('[notifications] unable to record email delivery:', logError);
        }
    }

    // Task 26.1: Create SendPulse integration for SendEmail
    async sendEmail(userId: string, payload: EmailPayload) {
        if (!(await this.checkPreferences(userId, 'email'))) {
            console.log(`User ${userId} has disabled email notifications. Skipping.`);
            await this.recordEmailDelivery(payload, null, undefined, 'suppressed');
            return false;
        }

        // attachments_binary = base64-encoded binary files (PDF, images, etc.)
        const attachmentsBinary = payload.attachments && payload.attachments.length > 0
            ? Object.fromEntries(payload.attachments.map(a => {
                const base64Data = a.content.includes('base64,') ? a.content.split('base64,')[1] : a.content;
                return [a.filename, base64Data];
            }))
            : undefined;

        const replyTo = resolveReplyTo(payload);
        const emailData: any = {
            email: {
                html: Buffer.from(this.addAutomationNotice(payload.html, payload.automated)).toString('base64'),
                text: htmlToPlainText(this.addAutomationNotice(payload.html, payload.automated)),
                subject: payload.subject,
                from: resolveSmtpFrom(payload),
                to: [{ name: payload.to, email: payload.to }],
                // SendPulse requires reply_to as a dedicated object, NOT inside headers
                ...(replyTo ? { reply_to: replyTo } : {}),
                ...(attachmentsBinary ? { attachments_binary: attachmentsBinary } : {}),
            }
        };

        try {
            const result = await this.dispatchSmtpEmail(emailData);
            await this.recordEmailDelivery(payload, result);

            // Delivery succeeded — this is operational metadata, not a user-facing
            // notification, so we do NOT write it to the recipient's in-app feed
            // (doing so flooded the notification bell with "Email sent successfully").
            return true;
        } catch (error: any) {
            await this.recordEmailDelivery(payload, null, error.message);
            console.error(`[notifications] Email delivery failed for ${userId}: ${error.message}`);
            // Durable recovery for sync failures (queue path already uses dead-letter).
            await recordDeadLetter({
                source: 'notifications.service',
                jobType: 'email',
                userId,
                originalJobId: payload.referenceId
                    ? `sync:${userId}:${payload.referenceId}`
                    : `sync:${userId}:${payload.subject}:${payload.to}`,
                payload: {
                    to: payload.to ? `${String(payload.to).slice(0, 2)}***` : null,
                    subject: payload.subject,
                    html: '[redacted]',
                    caseId: payload.caseId,
                    caseEventId: payload.caseEventId,
                    templateKey: payload.templateKey,
                    campaignKey: payload.campaignKey,
                    eventType: payload.eventType,
                    referenceId: payload.referenceId,
                    automated: payload.automated,
                    replyTo: payload.replyTo ? `${String(payload.replyTo).slice(0, 2)}***` : undefined,
                    // Retry payload kept separately for ops-health (full content).
                    retry: {
                      to: payload.to,
                      subject: payload.subject,
                      html: payload.html,
                      caseId: payload.caseId,
                      caseEventId: payload.caseEventId,
                      templateKey: payload.templateKey,
                      campaignKey: payload.campaignKey,
                      eventType: payload.eventType,
                      referenceId: payload.referenceId,
                      automated: payload.automated,
                      replyTo: payload.replyTo,
                    },
                },
                error: error.message || 'Email delivery failed',
                attempts: 1,
            });
            throw new AppError(`Email delivery failed: ${error.message}`, 500);
        }
    }

    // Send to non-portal recipients (no user preferences/logging)
    async sendExternalEmail(payload: EmailPayload) {
        // attachments_binary = base64-encoded binary files (PDF, images, etc.)
        const attachmentsBinary = payload.attachments && payload.attachments.length > 0
            ? Object.fromEntries(payload.attachments.map(a => {
                const base64Data = a.content.includes('base64,') ? a.content.split('base64,')[1] : a.content;
                return [a.filename, base64Data];
            }))
            : undefined;

        const replyTo = resolveReplyTo(payload);
        const emailData: any = {
            email: {
                html: Buffer.from(this.addAutomationNotice(payload.html, payload.automated)).toString('base64'),
                text: htmlToPlainText(this.addAutomationNotice(payload.html, payload.automated)),
                subject: payload.subject,
                from: resolveSmtpFrom(payload),
                to: [{ name: payload.to, email: payload.to }],
                ...(replyTo ? { reply_to: replyTo } : {}),
                ...(attachmentsBinary ? { attachments_binary: attachmentsBinary } : {}),
            }
        };

        try {
            const result = await this.dispatchSmtpEmail(emailData);
            await this.recordEmailDelivery(payload, result);
            return result;
        } catch (error: any) {
            const message = error?.message || 'Email delivery failed';
            await this.recordEmailDelivery(payload, null, message);
            await recordDeadLetter({
                source: 'notifications.service.external',
                jobType: 'email',
                userId: null,
                originalJobId: payload.referenceId
                    ? `ext:${payload.referenceId}`
                    : `ext:${payload.subject}:${payload.to}`,
                payload: {
                    to: payload.to ? `${String(payload.to).slice(0, 2)}***` : null,
                    subject: payload.subject,
                    html: '[redacted]',
                    caseId: payload.caseId,
                    caseEventId: payload.caseEventId,
                    templateKey: payload.templateKey,
                    campaignKey: payload.campaignKey,
                    eventType: payload.eventType,
                    referenceId: payload.referenceId,
                    automated: payload.automated,
                    replyTo: payload.replyTo ? `${String(payload.replyTo).slice(0, 2)}***` : undefined,
                    // Retry payload kept separately for ops-health (full content).
                    retry: {
                      to: payload.to,
                      subject: payload.subject,
                      html: payload.html,
                      caseId: payload.caseId,
                      caseEventId: payload.caseEventId,
                      templateKey: payload.templateKey,
                      campaignKey: payload.campaignKey,
                      eventType: payload.eventType,
                      referenceId: payload.referenceId,
                      automated: payload.automated,
                      replyTo: payload.replyTo,
                    },
                },
                error: message,
                attempts: 1,
            });
            throw error;
        }
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

            return true;
        } catch (error: any) {
            console.error(`[notifications] SMS delivery failed for ${userId}: ${error.message}`);
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
            return result;
        } catch (error: any) {
            console.error(`[notifications] WhatsApp delivery failed for ${userId}: ${error.message}`);
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

        // Find live-session assignments due tomorrow (avoid reminding about prior terms)
        const { resolveAssignmentTermId, matchesAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(supabase as any, {});
        const { data: assignmentsRaw } = await supabase
            .from('assignments')
            .select('id, title, due_date, course_id, term_id')
            .gte('due_date', startOfTomorrow)
            .lte('due_date', endOfTomorrow);

        const assignments = ((assignmentsRaw ?? []) as any[]).filter((a) =>
            matchesAssignmentSession(a.term_id, liveTermId, true),
        );

        if (assignments.length) {
            for (const assignment of assignments) {
                if (!assignment.course_id) continue;
                // Find students in the course/program
                // For simplicity, find all students enrolled in the program of this course
                const { data: course } = await supabase.from('courses').select('program_id').eq('id', assignment.course_id).single();

                if (course?.program_id) {
                    // Portal users use `enrollments` with `user_id` (not student_enrollments)
                    const { data: enrollments } = await supabase
                        .from('enrollments')
                        .select('user_id, portal_users!enrollments_user_id_fkey(email, full_name)')
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
        const { canSendWhatsAppApiTo, getWhatsAppCloudApiMode, manualWhatsAppUrl } = await import('@/lib/whatsapp/approval');
        if (!canSendWhatsAppApiTo(payload.to)) {
            return {
                queued: false,
                approval_pending: true,
                review_recipient_blocked: getWhatsAppCloudApiMode() === 'review',
                fallback_url: manualWhatsAppUrl(payload.to, payload.body),
            };
        }
        if (!env.WHATSAPP_API_URL || !env.WHATSAPP_API_TOKEN) {
            // Fallback for environments without a provider configured.
            return {
                queued: true,
                fallback_url: manualWhatsAppUrl(payload.to, payload.body),
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
