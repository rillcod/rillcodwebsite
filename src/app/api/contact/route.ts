import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { brandContact } from '@/config/brand';
import { validateDeliverableAuthEmail } from '@/lib/auth/email-deliverability';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
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
    // Silent honeypot check for spam bots
    if (String(body.website ?? body.honeypot ?? '').trim().length > 0) {
      return NextResponse.json({
        success: true,
        caseId: null,
        message: 'Your message has been received. Our team will respond within 24 hours.',
      });
    }

    const name = String(body.name ?? '').trim();
    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const school = String(body.school ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const preferredContact = String(body.preferredContact ?? 'email').trim() || 'email';

    if (name.length < 2) {
      return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 });
    }
    const emailCheck = validateDeliverableAuthEmail(rawEmail, 'signup');
    if (!emailCheck.ok || !EMAIL_RE.test(emailCheck.normalized)) {
      return NextResponse.json(
        { error: emailCheck.ok ? 'Please enter a valid email address.' : emailCheck.message },
        { status: 400 },
      );
    }
    const email = emailCheck.normalized;
    if (message.length < 5) {
      return NextResponse.json({ error: 'Please enter your message (at least 5 characters).' }, { status: 400 });
    }

    const subjectLine = subject || 'General Website Inquiry';
    const combinedLower = `${subjectLine} ${message} ${school}`.toLowerCase();
    const autoCategory: 'billing' | 'partnership' | 'support' | 'general' =
      /\b(fee|fees|payment|invoice|receipt|paystack|billing|refund|price|pricing|cost)\b/.test(combinedLower)
        ? 'billing'
        : /\b(partner|partnership|school|principal|proprietor|proposal|mou|demo|curriculum)\b/.test(combinedLower) || Boolean(school)
          ? 'partnership'
          : /\b(login|password|portal|exam|cbt|report|result|student|class|bug|error|help)\b/.test(combinedLower)
            ? 'support'
            : 'general';
    const categoryLabel =
      autoCategory === 'billing' ? 'Billing & Fees'
        : autoCategory === 'partnership' ? 'School Partnership'
          : autoCategory === 'support' ? 'Student / Portal Support'
            : 'General Inquiry';
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
    const shortCaseRef = caseId ? `RC-${caseId.slice(0, 8).toUpperCase()}` : null;
    const whatsappDigits = phone.replace(/\D/g, '');
    const waReplyHref = whatsappDigits.length >= 10
      ? `https://wa.me/${whatsappDigits.startsWith('0') ? `234${whatsappDigits.slice(1)}` : whatsappDigits}`
      : null;

    if (opsEmail) {
      try {
        await notificationsService.sendExternalEmail({
          to: opsEmail,
          subject: `[${categoryLabel}] ${subjectLine} — ${name}`,
          caseId: caseId ?? undefined,
          caseEventId: eventId ?? undefined,
          eventType: 'public_contact_inquiry',
          referenceId: eventId ?? caseId ?? undefined,
          automated: false,
          html: `
            <div style="font-family:sans-serif;max-width:600px;line-height:1.5;color:#111827">
              <p style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#4f46e5;margin:0 0 6px">${escapeHtml(categoryLabel)}${shortCaseRef ? ` · ${escapeHtml(shortCaseRef)}` : ''}</p>
              <h2 style="margin:0 0 12px">New Website Contact Inquiry</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}<br/>
                 <strong>Email:</strong> ${escapeHtml(email)}<br/>
                 ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}${waReplyHref ? ` (<a href="${waReplyHref}" style="color:#059669;font-weight:700">Reply on WhatsApp</a>)` : ''}<br/>` : ''}
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

    // Instant branded Customer Service auto-acknowledgement (with Case Ref + 1-click WhatsApp support)
    try {
      const ackHtml = buildRillcodTransactionalEmailHtml({
        title: `We received your ${categoryLabel.toLowerCase()}`,
        bodyHtml: `<p>Hi ${escapeHtml(name.split(' ')[0] || 'there')},</p>
          <p>Thank you for reaching out to <strong>Rillcod Academy</strong>. Your inquiry has been logged with our ${escapeHtml(categoryLabel)} desk and a team member will reply shortly.</p>`,
        summaryRows: [
          ...(shortCaseRef ? [{ label: 'Reference', value: shortCaseRef }] : []),
          { label: 'Department', value: categoryLabel },
          { label: 'Topic', value: subjectLine },
          { label: 'Response Window', value: 'Within 24 hours (faster on WhatsApp)' },
        ],
        cta: {
          href: brandContact.whatsapp || 'https://www.rillcod.com/contact',
          label: 'Need Faster Help? Chat on WhatsApp',
        },
      });
      await notificationsService.sendExternalEmail({
        to: email,
        subject: `We received your inquiry${shortCaseRef ? ` (${shortCaseRef})` : ''} — Rillcod Academy`,
        caseId: caseId ?? undefined,
        eventType: 'public_contact_ack',
        referenceId: caseId ?? undefined,
        automated: true,
        html: ackHtml,
      });
    } catch (ackErr) {
      console.warn('[api/contact] customer acknowledgement email failed (non-blocking):', ackErr);
    }

    return NextResponse.json({
      success: true,
      caseId,
      reference: shortCaseRef,
      category: autoCategory,
      message: `Your message has been received${shortCaseRef ? ` (Ref: ${shortCaseRef})` : ''}. Check your inbox for confirmation — our team will respond within 24 hours.`,
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
