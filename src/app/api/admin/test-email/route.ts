import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';

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
        await notificationsService.sendExternalEmail({
            to: checkTo,
            subject: 'Rillcod — payment system mail check',
            fromName,
            fromEmail,
            html: `<div style="font-family:system-ui,sans-serif;max-width:560px;padding:16px;line-height:1.5">
        <p><strong>Mail check</strong></p>
        <p>If you see this in your inbox (or Spam), SendPulse delivery to <code>${checkTo}</code> is working.</p>
        <p style="color:#64748b;font-size:12px">Sent from LMS admin test · ${new Date().toISOString()}</p>
      </div>`,
        });
        sent.push({ to: checkTo, subject: 'Rillcod — payment system mail check' });

        await notificationsService.sendExternalEmail({
            to: feedbackTo,
            subject: 'Rillcod — feedback / pay test',
            fromName,
            fromEmail,
            html: `<div style="font-family:system-ui,sans-serif;max-width:560px;padding:16px;line-height:1.5">
        <p><strong>Feedback / pay test</strong></p>
        <p>This simulates an internal-style notice (similar tone to ops payment alerts).</p>
        <p>Recipient: <code>${feedbackTo}</code></p>
        <p style="color:#64748b;font-size:12px">Sent from LMS admin test · ${new Date().toISOString()}</p>
      </div>`,
        });
        sent.push({ to: feedbackTo, subject: 'Rillcod — feedback / pay test' });

        return NextResponse.json({ success: true, sent });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Send failed';
        return NextResponse.json({ error: message, sent }, { status: 500 });
    }
}
