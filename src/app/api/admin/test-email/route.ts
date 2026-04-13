import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

async function requireAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return null;
    return user;
}

const bodySchema = z.object({
    /** Inbox to verify general delivery (default: ausiat1@gmail.com) */
    check_to: z.string().email().optional(),
    /** Inbox for “feedback / pay” style copy (default: rillcod@gmail.com) */
    feedback_pay_to: z.string().email().optional(),
});

/**
 * POST /api/admin/test-email
 * Sends two short test messages via SendPulse (same path as registration receipts).
 * Admin session required. Body fields optional — sensible defaults if omitted.
 */
export async function POST(request: Request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    let json: unknown;
    try {
        json = await request.json();
    } catch {
        json = {};
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const checkTo = parsed.data.check_to ?? 'ausiat1@gmail.com';
    const feedbackTo = parsed.data.feedback_pay_to ?? 'rillcod@gmail.com';

    const fromName = 'Rillcod Academy';
    const fromEmail = 'support@rillcod.com';

    const sent: { to: string; subject: string }[] = [];

    try {
        const checkHtml = buildRillcodTransactionalEmailHtml({
            title: 'Payment system mail check',
            bodyHtml: `<p style="margin:0 0 10px;">This is a <strong style="color:#fff;">diagnostic send</strong> from your Rillcod admin dashboard.</p>
        <p style="margin:0 0 10px;">If you received this in your inbox (or Spam), SendPulse is delivering to <strong style="color:#fff;">${escapeHtml(checkTo)}</strong> correctly.</p>`,
            summaryRows: [
                { label: 'Recipient', value: checkTo },
                { label: 'Sent at (UTC)', value: new Date().toISOString() },
            ],
            footerNote: '<span style="color:#a1a1aa;">Internal test — not a payment receipt.</span>',
        });
        await notificationsService.sendExternalEmail({
            to: checkTo,
            subject: 'Rillcod — payment system mail check',
            fromName,
            fromEmail,
            html: checkHtml,
        });
        sent.push({ to: checkTo, subject: 'Rillcod — payment system mail check' });

        const feedbackHtml = buildRillcodTransactionalEmailHtml({
            title: 'Feedback / pay test',
            bodyHtml: `<p style="margin:0 0 10px;">This message simulates the <strong style="color:#fff;">tone and layout</strong> used for internal payment notices (e.g. registration fee received).</p>
        <p style="margin:0;">It uses the same branded template as billing reminders and registration emails.</p>`,
            summaryRows: [
                { label: 'Recipient', value: feedbackTo },
                { label: 'Sent at (UTC)', value: new Date().toISOString() },
            ],
            footerNote: '<span style="color:#a1a1aa;">Internal test — no charge was made.</span>',
        });
        await notificationsService.sendExternalEmail({
            to: feedbackTo,
            subject: 'Rillcod — feedback / pay test',
            fromName,
            fromEmail,
            html: feedbackHtml,
        });
        sent.push({ to: feedbackTo, subject: 'Rillcod — feedback / pay test' });

        return NextResponse.json({ success: true, sent });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Send failed';
        return NextResponse.json({ error: message, sent }, { status: 500 });
    }
}
