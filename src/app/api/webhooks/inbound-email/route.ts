import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';
import { notificationsService } from '@/services/notifications.service';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

function safe(value: string) { return value.replace(/[<>&"']/g, (char) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[char] || char)); }

/**
 * Providers differ in how they let you authenticate a webhook. Resend signs with
 * Svix headers and gives you no way to add a custom `x-webhook-secret`, so the
 * shared secret has to travel in the URL — exactly as /api/webhooks/email-status
 * already accepts it. Header forms are kept for forwarders that can send them.
 */
function verifyInboundSecret(req: NextRequest): boolean {
  const configured = process.env.INBOUND_EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!configured) return false;
  const header = req.headers.get('x-webhook-secret') || req.headers.get('x-cron-secret') || '';
  if (header && header === configured) return true;
  const query = req.nextUrl.searchParams.get('token') || req.nextUrl.searchParams.get('secret') || '';
  if (query && query === configured) return true;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return !!bearer && bearer === configured;
}

/**
 * Resend delivers `{ type: 'email.received', data: { from, subject, text, ... } }`
 * while simple forwarders POST those fields flat. Accept either, preferring the
 * nested payload, and tolerate the common field-name variations.
 */
function normaliseInbound(body: any): any {
  const d = body?.data && typeof body.data === 'object' ? body.data : {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k] ?? body?.[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  };
  return {
    from: pick('from', 'sender', 'from_email'),
    from_name: pick('from_name', 'fromName'),
    subject: pick('subject'),
    text: pick('text', 'text_body', 'plain', 'body_plain', 'stripped_text'),
    message_id: pick('message_id', 'messageId', 'email_id', 'id'),
    provider: pick('provider') || (body?.type ? 'resend' : ''),
    in_reply_to: d.in_reply_to ?? body?.in_reply_to ?? d.inReplyTo ?? body?.inReplyTo,
    references: d.references ?? body?.references,
    headers: d.headers ?? body?.headers,
  };
}

export async function POST(req: NextRequest) {
  if (!verifyInboundSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const body = normaliseInbound(raw);
  const rawFrom = typeof body.from === 'string' ? body.from.trim() : '';
  const bracketEmail = rawFrom.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1];
  const from = (bracketEmail || rawFrom).trim().toLowerCase();
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 240) : '';
  const textBody = typeof body.text === 'string' ? body.text.trim().slice(0, 10000) : '';
  const messageId = typeof body.message_id === 'string' ? body.message_id.trim().slice(0, 500) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || !subject || !textBody) return NextResponse.json({ error: 'Valid from, subject, and text are required.' }, { status: 400 });
  const provider = typeof body.provider === 'string' && body.provider ? body.provider.trim().toLowerCase().slice(0, 50) : 'email';
  const rawReferences = [body.in_reply_to, body.inReplyTo, body.references, body.headers?.['in-reply-to'], body.headers?.references]
    .flatMap((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [])
    .map((value) => String(value).replace(/[<>]/g, '').trim()).filter(Boolean).slice(0, 20);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
  if (messageId) {
    const { data: duplicate } = await admin.from('communication_case_events').select('case_id').eq('source_type', 'inbound_email').eq('source_id', messageId).maybeSingle();
    if (duplicate?.case_id) return NextResponse.json({ success: true, duplicate: true, case_id: duplicate.case_id });
  }

  const { data: profile } = await admin.from('portal_users').select('id, full_name, email, phone, school_id, primary_teacher_id').ilike('email', from).maybeSingle();
  const isComplaint = /complain|complaint|refund|fraud|unhappy|terrible|poor service/i.test(`${subject} ${textBody}`);
  let threadedCaseId: string | null = null;
  const explicitCaseId = typeof body.case_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.case_id) ? body.case_id : null;
  if (explicitCaseId) {
    const { data: explicitCase } = await admin.from('communication_cases').select('id,requester_id,requester_email').eq('id', explicitCaseId).maybeSingle();
    const samePortalUser = Boolean(profile?.id && explicitCase?.requester_id === profile.id);
    const sameEmail = Boolean(explicitCase?.requester_email && String(explicitCase.requester_email).trim().toLowerCase() === from);
    if (samePortalUser || sameEmail) threadedCaseId = explicitCase.id;
  }
  if (!threadedCaseId && rawReferences.length) {
    const { data: providerLink } = await admin.from('email_thread_links').select('case_id')
      .in('provider_message_id', rawReferences).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (providerLink?.case_id) threadedCaseId = providerLink.case_id;
    if (!threadedCaseId) {
      const { data: internetLink } = await admin.from('email_thread_links').select('case_id')
        .in('internet_message_id', rawReferences).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (internetLink?.case_id) threadedCaseId = internetLink.case_id;
    }
  }
  if (!threadedCaseId) {
    const token = `${subject}\n${textBody}`.match(/CASE-([0-9a-f]{8})/i)?.[0]?.toUpperCase();
    if (token) {
      const { data: tokenLink } = await admin.from('email_thread_links').select('case_id').eq('subject_token', token).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (tokenLink?.case_id) threadedCaseId = tokenLink.case_id;
    }
  }
  if (threadedCaseId) {
    const { data: threadCase } = await admin.from('communication_cases').select('requester_id,requester_email').eq('id', threadedCaseId).maybeSingle();
    const samePortalUser = Boolean(profile?.id && threadCase?.requester_id === profile.id);
    const sameEmail = Boolean(threadCase?.requester_email && String(threadCase.requester_email).trim().toLowerCase() === from);
    if (!samePortalUser && !sameEmail) {
      console.warn('[inbound-email] rejected cross-customer thread reference');
      threadedCaseId = null;
    }
  }
  try {
    const caseResult = await recordCommunicationCaseEvent(admin, {
      caseId: threadedCaseId, requesterId: profile?.id ?? null, requesterName: profile?.full_name ?? body.from_name ?? from, requesterEmail: from, requesterPhone: profile?.phone ?? null,
      schoolId: profile?.school_id ?? null, classOwnerId: profile?.primary_teacher_id ?? null, subject, body: textBody, category: isComplaint ? 'complaint' : 'general',
      channel: 'email', direction: 'inbound', sourceType: messageId ? 'inbound_email' : null, sourceId: messageId || null, restrictedToAdmin: isComplaint,
      provider, providerMessageId: messageId || null, externalThreadId: rawReferences[0] || null,
      metadata: { to: body.to ?? null, in_reply_to: rawReferences[0] || null, references: rawReferences },
    });
    const caseId = caseResult.caseId;
    // Link the inbound Message-ID so later replies can thread even if ACK email fails.
    if (messageId) {
      try {
        await admin.from('email_thread_links').upsert({
          case_id: caseId,
          provider,
          provider_message_id: messageId,
          internet_message_id: typeof body.internet_message_id === 'string' ? body.internet_message_id.replace(/[<>]/g, '').slice(0, 500) : messageId.replace(/[<>]/g, '').slice(0, 500),
          subject_token: `CASE-${caseId.slice(0, 8).toUpperCase()}`,
        }, { onConflict: 'provider,provider_message_id' });
      } catch (linkError) {
        console.error('[inbound-email] inbound thread link failed:', linkError);
      }
    }
    try {
      let ackEventId: string | null = null;
      try {
        const ackEvent = await recordCommunicationCaseEvent(admin, {
          caseId,
          requesterId: profile?.id ?? null,
          requesterName: profile?.full_name ?? body.from_name ?? from,
          requesterEmail: from,
          subject: `Received - CASE-${caseId.slice(0, 8)} - ${subject}`,
          body: 'Automatic acknowledgement that the inbound email was recorded.',
          category: isComplaint ? 'complaint' : 'general',
          channel: 'email',
          direction: 'outbound',
          sourceType: 'case_receipt',
          sourceId: `${caseId}:ack:${Date.now()}`,
          automated: true,
          deliveryStatus: 'recorded',
          templateKey: 'case_receipt',
        });
        ackEventId = ackEvent.eventId;
      } catch (ackCaseError) {
        console.error('[inbound-email] ACK case event failed:', ackCaseError);
      }

      const dispatch = await notificationsService.sendExternalEmail({
        to: from, fromEmail: SMTP_FROM_EMAIL, subject: `Received - CASE-${caseId.slice(0,8)} - ${subject}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>We received your message</h2><p>Hello ${safe(profile?.full_name || body.from_name || 'there')},</p><p>Your request is recorded as <strong>CASE-${caseId.slice(0,8)}</strong>. Our team will follow up through the appropriate channel.</p><p>Regards,<br>Rillcod Technologies</p></div>`,
        caseId, caseEventId: ackEventId || undefined, automated: true, templateKey: 'case_receipt', eventType: 'case_receipt', referenceId: caseId,
      });
      if (dispatch?.providerMessageId) {
        await admin.from('email_thread_links').upsert({
          case_id: caseId,
          provider: dispatch.provider,
          provider_message_id: dispatch.providerMessageId,
          internet_message_id: typeof body.internet_message_id === 'string' ? body.internet_message_id.replace(/[<>]/g, '').slice(0, 500) : null,
          subject_token: `CASE-${caseId.slice(0, 8).toUpperCase()}`,
        }, { onConflict: 'provider,provider_message_id' });
      }
    } catch (ackError) { console.error('[inbound-email] acknowledgement failed:', ackError); }
    return NextResponse.json({ success: true, case_id: caseId });
  } catch (error) {
    console.error('[inbound-email] case recording failed:', error);
    return NextResponse.json({ error: 'Unable to record inbound email.' }, { status: 500 });
  }
}
