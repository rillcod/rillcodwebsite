import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { brandContact } from '@/config/brand';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';
import { upsertBookParent } from '@/lib/crm/contact-book';
import { RateLimitError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { notificationsService } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * POST /api/contact
 *
 * Public contact inquiry intake: rate-limits by client IP, records the lead in
 * `customer_contact_book`, opens/appends an inbound support case, and alerts the ops inbox.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await checkCustomRateLimit({ key: `contact:${ip}`, max: 8, window: 60 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const school = String(body.school ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const preferredContact = String(body.preferredContact ?? 'email').trim() || 'email';

    if (name.length < 2) {
      return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (message.length < 5) {
      return NextResponse.json({ error: 'Please enter your message (at least 5 characters).' }, { status: 400 });
    }

    const subjectLine = subject || 'General Website Inquiry';
    const admin = createAdminClient();

    try {
      await upsertBookParent(admin as any, {
        fullName: name,
        email,
        phone: phone || null,
        schoolName: school || null,
        source: 'contact_form',
        lastChannel: preferredContact,
        role: school ? 'school' : 'lead',
        extraMeta: {
          website_inquiry: true,
          subject: subjectLine,
          last_message: message.slice(0, 1000),
        },
      });
    } catch (bookErr) {
      console.error('[api/contact] contact-book upsert failed:', bookErr);
    }

    let caseId: string | null = null;
    let eventId: string | null = null;
    try {
      const fullBody = [
        school ? `School / Organization: ${school}` : null,
        phone ? `Phone: ${phone}` : null,
        `Preferred contact: ${preferredContact}`,
        '',
        message,
      ]
        .filter((line) => line !== null)
        .join('\n');

      const recorded = await recordCommunicationCaseEvent(admin as any, {
        requesterName: name,
        requesterEmail: email,
        requesterPhone: phone || null,
        subject: subjectLine,
        body: fullBody,
        category: 'general',
        channel: 'email',
        direction: 'inbound',
        sourceType: 'public_contact',
        sourceId: `contact:${randomUUID()}`,
        metadata: {
          school: school || null,
          preferred_contact: preferredContact,
          subject: subjectLine,
        },
      });
      caseId = recorded.caseId;
      eventId = recorded.eventId;
    } catch (caseErr) {
      console.error('[api/contact] case logging failed:', caseErr);
      return NextResponse.json(
        { error: 'Unable to record your inquiry right now. Please try again shortly.' },
        { status: 500 },
      );
    }

    const opsEmail = (process.env.ADMIN_OPS_EMAIL || brandContact.email).trim();
    if (opsEmail) {
      try {
        await notificationsService.sendExternalEmail({
          to: opsEmail,
          subject: `[Website Inquiry] ${subjectLine} — ${name}`,
          caseId: caseId ?? undefined,
          caseEventId: eventId ?? undefined,
          eventType: 'public_contact_inquiry',
          referenceId: eventId ?? caseId ?? undefined,
          automated: false,
          html: `
            <div style="font-family:sans-serif;max-width:600px;line-height:1.5;color:#111827">
              <h2 style="margin:0 0 12px">New Website Contact Inquiry</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}<br/>
                 <strong>Email:</strong> ${escapeHtml(email)}<br/>
                 ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ''}
                 ${school ? `<strong>School / Organization:</strong> ${escapeHtml(school)}<br/>` : ''}
                 <strong>Topic:</strong> ${escapeHtml(subjectLine)}<br/>
                 <strong>Preferred Channel:</strong> ${escapeHtml(preferredContact)}</p>
              <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #2563eb;white-space:pre-wrap">${escapeHtml(message)}</div>
              ${caseId ? `<p style="font-size:12px;color:#64748b;margin-top:16px">Case Reference: ${escapeHtml(caseId)}</p>` : ''}
            </div>
          `,
        });
      } catch (emailErr) {
        console.warn('[api/contact] ops alert email failed (case remains saved):', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      caseId,
      message: 'Your message has been received. Our team will respond within 24 hours.',
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('[api/contact] unexpected error:', err);
    return NextResponse.json(
      { error: 'Unable to process your message right now. Please try again.' },
      { status: 500 },
    );
  }
}
