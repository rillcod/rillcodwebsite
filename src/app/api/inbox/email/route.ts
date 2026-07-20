import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildInboxOutboundEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { missingCustomerTags } from '@/lib/api-guards';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';

export const dynamic = 'force-dynamic';

async function canParentOrStudentEmailRecipient(sender: any, toEmail: string): Promise<boolean> {
  const supabase = createAdminClient() as any;
  const targetEmail = String(toEmail || '').trim().toLowerCase();
  if (!targetEmail) return false;

  const { data: recipient } = await supabase
    .from('portal_users')
    .select('id, role, school_id, section_class')
    .ilike('email', targetEmail)
    .maybeSingle();
  if (!recipient) return false;
  if (!['admin', 'teacher', 'school'].includes(recipient.role)) return false;
  if (recipient.role === 'admin') return true;

  if (sender.role === 'student') {
    const { data: me } = await supabase
      .from('portal_users')
      .select('school_id, section_class')
      .eq('id', sender.id)
      .single();
    if (!me?.school_id || recipient.school_id !== me.school_id) return false;
    if (recipient.role !== 'teacher') return true;
    if (!me.section_class || !recipient.section_class) return true;
    return String(me.section_class).trim().toLowerCase() === String(recipient.section_class).trim().toLowerCase();
  }

  if (sender.role === 'parent') {
    const schoolIds = new Set<string>();
    const childClasses = new Set<string>();

    const { data: links } = await (supabase as any)
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', sender.id);
    const linkedIds = (links ?? []).map((r: any) => r.student_id).filter(Boolean);

    const childrenById = new Map<string, any>();
    if (sender.email) {
      const { data } = await supabase.from('students')
        .select('id, school_id, current_class, section, grade_level')
        .ilike('parent_email', String(sender.email).trim().toLowerCase());
      for (const child of data ?? []) childrenById.set(child.id, child);
    }
    if (linkedIds.length > 0) {
      const { data } = await supabase.from('students')
        .select('id, school_id, current_class, section, grade_level').in('id', linkedIds);
      for (const child of data ?? []) childrenById.set(child.id, child);
    }
    const children = [...childrenById.values()];
    for (const c of children) {
      if ((c as any).school_id) schoolIds.add((c as any).school_id);
      const cls = (c as any).current_class || (c as any).section || (c as any).grade_level;
      if (cls) childClasses.add(String(cls).trim().toLowerCase());
    }
    if (!recipient.school_id || !schoolIds.has(recipient.school_id)) return false;
    if (recipient.role !== 'teacher') return true;
    if (childClasses.size === 0 || !recipient.section_class) return true;
    return childClasses.has(String(recipient.section_class).trim().toLowerCase());
  }

  return false;
}


/**
 * Validates base64 attachment content. Returns true if content looks like valid base64.
 */
function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length > 0;
}

/**
 * POST /api/inbox/email
 * Smart-routes outbound messages:
 *   • to = @rillcod.com (except support@) → in-app notification (no SMTP)
 *   • to = ${brandContact.email} or external  → real email via SendPulse SMTP
 *   When the recipient is an in-app rillcod.com user the sender ALSO gets a
 *   sent-confirmation notification, and the recipient gets an unread in-app
 *   notification — mirroring how real email works but through the platform.
 *
 * Body: {
 *   to: string,
 *   to_name?: string,
 *   subject: string,
 *   body: string,
 *   cc?: string,
 *   attachments?: Array<{ filename: string; content: string; }> // base64 content
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin.from('portal_users')
    .select('id, role, full_name, email, phone, school_id, school_name, section_class, primary_teacher_id')
    .eq('id', user.id).single();
  if (profileError) {
    console.error('[inbox/email] profile lookup:', profileError.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  if (!profile || !['admin', 'teacher', 'school', 'parent', 'student'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const effectiveSender: any = { ...user, ...profile };
  const { to, to_name, subject, body, cc, attachments } = await req.json();

  if (!to?.trim()) return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!body?.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });

  // Validate attachments
  const validatedAttachments: Array<{ filename: string; content: string }> = [];
  if (Array.isArray(attachments) && attachments.length > 0) {
    if (attachments.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 attachments allowed per email' }, { status: 400 });
    }
    for (const att of attachments) {
      if (!att.filename || typeof att.filename !== 'string') {
        return NextResponse.json({ error: 'Each attachment must have a filename' }, { status: 400 });
      }
      const safeName = att.filename
        ? att.filename.split(/[\/\\]/).pop()!.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 255)
        : 'attachment';
      if (!safeName) {
        return NextResponse.json({ error: 'Invalid attachment filename' }, { status: 400 });
      }
      if (!att.content || !isValidBase64(att.content)) {
        return NextResponse.json({ error: `Invalid attachment content for: ${safeName}` }, { status: 400 });
      }
      // Guard against excessively large attachments (~10 MB limit per file in base64)
      if (att.content.length > 13_500_000) {
        return NextResponse.json({ error: `Attachment too large: ${safeName} (max 10 MB)` }, { status: 400 });
      }
      validatedAttachments.push({ filename: safeName, content: att.content });
    }
  }

  if (['parent', 'student'].includes(effectiveSender.role)) {
    const missing = missingCustomerTags(effectiveSender);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'Please update your school and class information before sending support emails.',
          code: 'profile_tags_required',
          missing_fields: missing,
        },
        { status: 422 },
      );
    }
    const allowed = await canParentOrStudentEmailRecipient(effectiveSender, to.trim());
    if (!allowed) {
      return NextResponse.json({ error: 'You can only email staff in your assigned school support channels' }, { status: 403 });
    }

    if (cc && cc.length > 0) {
      const ccList = Array.isArray(cc) ? cc : [cc];
      for (const ccAddr of ccList) {
        const ccOk = await canParentOrStudentEmailRecipient(effectiveSender, ccAddr);
        if (!ccOk) {
          return NextResponse.json({ error: 'You are not permitted to CC that address' }, { status: 403 });
        }
      }
    }
  }

  const senderName  = (effectiveSender as any).full_name || 'Rillcod Technologies';
  const senderOrg   = (effectiveSender as any).school_name || 'Rillcod Technologies';
  const senderClass = (effectiveSender as any).section_class || '';
  const senderRole  = String((effectiveSender as any).role || 'user').toUpperCase();

  const toAddress = to.trim();
  const displayRecipient = to_name ? `${to_name} <${toAddress}>` : toAddress;
  const now = new Date().toISOString();

  // ── In-app rillcod.com address → deliver as in-app notification ────────────
  if (isInAppEmail(toAddress)) {
    try {
      const { data: recipient } = await supabase
        .from('portal_users')
        .select('id, full_name')
        .ilike('email', toAddress)
        .maybeSingle();

      if (recipient) {
        await supabase.from('notifications').insert({
          user_id:    recipient.id,
          title:      subject.trim(),
          message:    `From ${senderName} (${senderRole}): ${body.slice(0, 200)}`,
          type:       'info',
          is_read:    false,
          created_at: now,
          updated_at: now,
        });
      }

      await supabase.from('notifications').insert({
        user_id:    effectiveSender.id,
        title:      `Message sent: ${subject}`,
        message:    `To: ${displayRecipient} — ${body.slice(0, 120)}`,
        type:       'info',
        is_read:    true,
        created_at: now,
        updated_at: now,
      });

      if (['parent', 'student'].includes(effectiveSender.role)) {
        try {
          await recordCommunicationCaseEvent(admin, {
            requesterId: effectiveSender.id,
            requesterName: senderName,
            requesterEmail: effectiveSender.email ?? null,
            requesterPhone: effectiveSender.phone ?? null,
            schoolId: effectiveSender.school_id ?? null,
            classOwnerId: effectiveSender.primary_teacher_id ?? null,
            subject: subject.trim(),
            body: body.trim(),
            channel: 'in_app',
            direction: 'inbound',
            actorId: effectiveSender.id,
          });
        } catch (caseError) {
          console.error('[inbox/email] unified in-app case failed:', caseError);
        }
      }

      return NextResponse.json({
        success: true,
        to: toAddress,
        subject,
        channel: 'in_app',
        note: recipient
          ? 'Delivered as in-app notification (rillcod.com in-app address)'
          : 'Sent — recipient address is an in-app handle but no matching user was found',
      });
    } catch (err: any) {
      console.error('[inbox/email] in-app delivery error:', err);
      return NextResponse.json({ error: 'In-app delivery failed' }, { status: 500 });
    }
  }

  // ── External address or ${brandContact.email} → send via SendPulse SMTP ─────
  // Always use the template, never raw HTML from user input
  const safeBody = body.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = buildInboxOutboundEmail({
    senderName,
    senderRole,
    senderOrg,
    senderClass: senderClass || undefined,
    subject:     subject.trim(),
    body:        safeBody,
  });

  try {
    let outboundCaseId: string | null = null;
    let outboundCaseEventId: string | null = null;
    try {
      const caseResult = await recordCommunicationCaseEvent(admin, {
        requesterId: effectiveSender.id,
        requesterName: senderName,
        requesterEmail: effectiveSender.email ?? toAddress,
        requesterPhone: effectiveSender.phone ?? null,
        schoolId: effectiveSender.school_id ?? null,
        classOwnerId: effectiveSender.primary_teacher_id ?? null,
        subject: subject.trim(),
        body: body.trim(),
        channel: 'email',
        direction: 'outbound',
        actorId: effectiveSender.id,
        sourceType: 'staff_inbox_email',
        sourceId: `${effectiveSender.id}:${Date.now()}`,
      });
      outboundCaseId = caseResult.caseId;
      outboundCaseEventId = caseResult.eventId;
    } catch (caseError) {
      console.error('[inbox/email] outbound case create failed:', caseError);
    }

    const dispatch = await notificationsService.sendExternalEmail({
      to:          toAddress,
      subject:     subject.trim(),
      html,
      fromName:    `${senderName} via Rillcod Technologies`,
      fromEmail: SMTP_FROM_EMAIL,
      ...(validatedAttachments.length > 0 ? { attachments: validatedAttachments } : {}),
      automated: false,
      eventType: 'staff_email',
      referenceId: outboundCaseId || undefined,
      caseId: outboundCaseId || undefined,
      caseEventId: outboundCaseEventId || undefined,
    });

    if (outboundCaseId && dispatch?.providerMessageId) {
      try {
        await admin.from('email_thread_links').upsert({
          case_id: outboundCaseId,
          provider: dispatch.provider,
          provider_message_id: dispatch.providerMessageId,
          internet_message_id: null,
          subject_token: `CASE-${outboundCaseId.slice(0, 8).toUpperCase()}`,
        }, { onConflict: 'provider,provider_message_id' });
        if (outboundCaseEventId) {
          await admin.from('communication_case_events').update({
            provider: dispatch.provider,
            provider_message_id: dispatch.providerMessageId,
            delivery_status: 'sent',
          }).eq('id', outboundCaseEventId);
        }
      } catch (linkError) {
        console.error('[inbox/email] thread link failed:', linkError);
      }
    }

    await supabase.from('notifications').insert({
      user_id:    effectiveSender.id,
      title:      `Email sent: ${subject}`,
      message:    `To: ${displayRecipient}${validatedAttachments.length > 0 ? ` (+ ${validatedAttachments.length} attachment${validatedAttachments.length > 1 ? 's' : ''})` : ''} — ${body.slice(0, 120)}`,
      type:       'info',
      is_read:    true,
      created_at: now,
      updated_at: now,
    }).throwOnError();

    if (['parent', 'student'].includes(effectiveSender.role)) {
      const { upsertBookParent, promoteBookLeadToPortalIfLinked } = await import('@/lib/crm/contact-book');
      const bookId = await upsertBookParent(supabase as any, {
        fullName: senderName,
        email: effectiveSender.email ?? null,
        phone: effectiveSender.phone ?? null,
        schoolName: effectiveSender.school_name ?? null,
        className: effectiveSender.section_class ?? null,
        source: 'self_confirmed_support_email',
        lastChannel: 'email',
        role: effectiveSender.role,
        userId: effectiveSender.id,
        extraMeta: {
          recipient_email: toAddress.toLowerCase(),
          sender_role: effectiveSender.role,
        },
      });
      if (bookId && effectiveSender.role === 'parent') {
        await promoteBookLeadToPortalIfLinked(supabase as any, {
          bookId,
          email: effectiveSender.email,
          phone: effectiveSender.phone,
        });
      }
    }

    if (['parent', 'student'].includes(effectiveSender.role)) {
      try {
        await recordCommunicationCaseEvent(admin, {
          requesterId: effectiveSender.id,
          requesterName: senderName,
          requesterEmail: effectiveSender.email ?? null,
          requesterPhone: effectiveSender.phone ?? null,
          schoolId: effectiveSender.school_id ?? null,
          classOwnerId: effectiveSender.primary_teacher_id ?? null,
          subject: subject.trim(),
          body: body.trim(),
          channel: 'email',
          direction: 'inbound',
          actorId: effectiveSender.id,
        });
      } catch (caseError) {
        console.error('[inbox/email] unified email case failed:', caseError);
      }
    }

    return NextResponse.json({
      success: true,
      to: toAddress,
      subject,
      channel: 'smtp',
      attachments_sent: validatedAttachments.length,
    });
  } catch (err: any) {
    console.error('[inbox/email] SendPulse error:', err);
    return NextResponse.json({ error: 'Email delivery failed' }, { status: 500 });
  }
}
