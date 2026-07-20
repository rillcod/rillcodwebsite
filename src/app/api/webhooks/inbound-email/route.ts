import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';
import { notificationsService } from '@/services/notifications.service';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

function safe(value: string) { return value.replace(/[<>&"']/g, (char) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[char] || char)); }

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET;
  const suppliedSecret = req.headers.get('x-webhook-secret') || req.headers.get('x-cron-secret');
  if (!configuredSecret || suppliedSecret !== configuredSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const from = typeof body.from === 'string' ? body.from.trim().toLowerCase() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 240) : '';
  const textBody = typeof body.text === 'string' ? body.text.trim().slice(0, 10000) : '';
  const messageId = typeof body.message_id === 'string' ? body.message_id.trim().slice(0, 500) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || !subject || !textBody) return NextResponse.json({ error: 'Valid from, subject, and text are required.' }, { status: 400 });
  const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase().slice(0, 50) : 'email';
  const rawReferences = [body.in_reply_to, body.inReplyTo, body.references, body.headers?.['in-reply-to'], body.headers?.references]
    .flatMap((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [])
    .map((value) => String(value).replace(/[<>]/g, '').trim()).filter(Boolean).slice(0, 20);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
  const { data: profile } = await admin.from('portal_users').select('id, full_name, email, phone, school_id, primary_teacher_id').ilike('email', from).maybeSingle();
  const isComplaint = /complain|complaint|refund|fraud|unhappy|terrible|poor service/i.test(`${subject} ${textBody}`);
  let threadedCaseId: string | null = typeof body.case_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.case_id) ? body.case_id : null;
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
  try {
    const caseId = await recordCommunicationCaseEvent(admin, {
      caseId: threadedCaseId, requesterId: profile?.id ?? null, requesterName: profile?.full_name ?? body.from_name ?? from, requesterEmail: from, requesterPhone: profile?.phone ?? null,
      schoolId: profile?.school_id ?? null, classOwnerId: profile?.primary_teacher_id ?? null, subject, body: textBody, category: isComplaint ? 'complaint' : 'general',
      channel: 'email', direction: 'inbound', sourceType: messageId ? 'inbound_email' : null, sourceId: messageId || null, restrictedToAdmin: isComplaint,
      provider, providerMessageId: messageId || null, externalThreadId: rawReferences[0] || null,
      metadata: { to: body.to ?? null, in_reply_to: rawReferences[0] || null, references: rawReferences },
    });
    try {
      const dispatch = await notificationsService.sendExternalEmail({
        to: from, fromEmail: SMTP_FROM_EMAIL, subject: `Received - CASE-${caseId.slice(0,8)} - ${subject}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>We received your message</h2><p>Hello ${safe(profile?.full_name || body.from_name || 'there')},</p><p>Your request is recorded as <strong>CASE-${caseId.slice(0,8)}</strong>. Our team will follow up through the appropriate channel.</p><p>Regards,<br>Rillcod Technologies</p></div>`,
        caseId, automated: true, templateKey: 'case_receipt', eventType: 'case_receipt', referenceId: caseId,
      });
      await admin.from('email_thread_links').upsert({
        case_id: caseId,
        provider: dispatch.provider,
        provider_message_id: dispatch.providerMessageId,
        internet_message_id: typeof body.internet_message_id === 'string' ? body.internet_message_id.replace(/[<>]/g, '').slice(0, 500) : null,
        subject_token: `CASE-${caseId.slice(0, 8).toUpperCase()}`,
      }, { onConflict: 'provider,provider_message_id' });
    } catch (ackError) { console.error('[inbound-email] acknowledgement failed:', ackError); }
    return NextResponse.json({ success: true, case_id: caseId });
  } catch (error) {
    console.error('[inbound-email] case recording failed:', error);
    return NextResponse.json({ error: 'Unable to record inbound email.' }, { status: 500 });
  }
}
