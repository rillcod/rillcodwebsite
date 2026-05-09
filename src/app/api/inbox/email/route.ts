import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import type { TablesInsert } from '@/types/supabase';
import { missingCustomerTags } from '@/lib/api-guards';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase.from('portal_users')
    .select('id, role, full_name, email, phone, school_name, section_class')
    .eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return { ...user, ...profile };
}

async function canParentOrStudentEmailRecipient(sender: any, toEmail: string): Promise<boolean> {
  const supabase = await createClient();
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

    let q = supabase.from('students').select('id, school_id, current_class, section, grade_level');
    if (sender.email && linkedIds.length > 0) {
      q = q.or(`parent_email.ilike.${String(sender.email).trim().toLowerCase()},id.in.(${linkedIds.join(',')})`) as typeof q;
    } else if (sender.email) {
      q = q.ilike('parent_email', String(sender.email).trim().toLowerCase()) as typeof q;
    } else if (linkedIds.length > 0) {
      q = q.in('id', linkedIds) as typeof q;
    } else return false;

    const { data: children } = await q;
    for (const c of children ?? []) {
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
 * Returns true if the address is an @rillcod.com address that is NOT a real
 * SMTP mailbox (i.e. not support@rillcod.com). These are in-app-only handles
 * and must be delivered as in-app notifications rather than real SMTP mail.
 */
function isInAppRillcodEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return lower.endsWith('@rillcod.com') && lower !== 'support@rillcod.com';
}

/**
 * POST /api/inbox/email
 * Smart-routes outbound messages:
 *   • to = @rillcod.com (except support@) → in-app notification (no SMTP)
 *   • to = support@rillcod.com or external  → real email via SendPulse SMTP
 *   When the recipient is an in-app rillcod.com user the sender ALSO gets a
 *   sent-confirmation notification, and the recipient gets an unread in-app
 *   notification — mirroring how real email works but through the platform.
 * Body: { to: string, to_name?: string, subject: string, body: string, cc?: string }
 */
export async function POST(req: NextRequest) {
  const sender = await requireStaff();
  const supabase = await createClient();
  let effectiveSender: any = sender;
  if (!effectiveSender) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('portal_users')
      .select('id, role, full_name, email, phone, school_name, section_class')
      .eq('id', user.id).single();
    if (!profile || !['parent', 'student'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    effectiveSender = { ...user, ...profile };
  }

  const { to, to_name, subject, body, cc } = await req.json();

  if (!to?.trim()) return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!body?.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });

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
  }

  const senderName  = (effectiveSender as any).full_name || 'Rillcod Academy';
  const senderOrg   = (effectiveSender as any).school_name || 'Rillcod Academy';
  const senderClass = (effectiveSender as any).section_class || 'Unspecified';
  const senderRole = String((effectiveSender as any).role || 'user').toUpperCase();

  const toAddress = to.trim();
  const displayRecipient = to_name ? `${to_name} <${toAddress}>` : toAddress;
  const now = new Date().toISOString();

  // ── In-app rillcod.com address → deliver as in-app notification ────────────
  if (isInAppRillcodEmail(toAddress)) {
    try {
      // Look up the recipient user by their in-app email handle
      const { data: recipient } = await supabase
        .from('portal_users')
        .select('id, full_name')
        .ilike('email', toAddress)
        .maybeSingle();

      if (recipient) {
        // Deliver to recipient's notification bell
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

      // Sent-confirmation for the sender
      await supabase.from('notifications').insert({
        user_id:    effectiveSender.id,
        title:      `Message sent: ${subject}`,
        message:    `To: ${displayRecipient} — ${body.slice(0, 120)}`,
        type:       'info',
        is_read:    true,
        created_at: now,
        updated_at: now,
      });

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
      return NextResponse.json({ error: err.message || 'In-app delivery failed' }, { status: 500 });
    }
  }

  // ── External address or support@rillcod.com → send via SendPulse SMTP ─────
  const html = buildRillcodTransactionalEmailHtml({
    title:    subject,
    eyebrow:  senderOrg,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#e4e4e7;">
        <strong style="color:#fff;">From:</strong> ${escapeHtml(senderName)} via Rillcod Academy
      </p>
      <p style="margin:0 0 12px;color:#d4d4d8;font-size:13px;">
        <strong style="color:#fff;">Origin:</strong> ${escapeHtml(senderRole)} · ${escapeHtml(senderOrg)} · ${escapeHtml(String(senderClass))}
      </p>
      <div style="background:#1a1a2e;border-left:3px solid #c0392b;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        ${body.split('\n').map((line: string) =>
          `<p style="margin:0 0 8px;color:#d4d4d8;font-size:15px;line-height:1.6;">${escapeHtml(line) || '&nbsp;'}</p>`
        ).join('')}
      </div>
    `,
    footerNote: `<span style="color:#71717a;">Sent via Rillcod Academy Unified Inbox · Reply to this email to respond directly.</span>`,
  });

  try {
    await notificationsService.sendExternalEmail({
      to:        toAddress,
      subject:   subject.trim(),
      html,
      fromName:  `${senderName} (Rillcod Academy)`,
      fromEmail: 'support@rillcod.com',
    });

    // Sent-confirmation log for the sender
    await supabase.from('notifications').insert({
      user_id:    effectiveSender.id,
      title:      `Email sent: ${subject}`,
      message:    `To: ${displayRecipient} — ${body.slice(0, 120)}`,
      type:       'info',
      is_read:    true,
      created_at: now,
      updated_at: now,
    }).throwOnError();

    // Soft customer-book capture from support email channel.
    if (['parent', 'student'].includes(effectiveSender.role)) {
      const row: TablesInsert<'customer_contact_book'> = {
        user_id: effectiveSender.id,
        role: effectiveSender.role,
        full_name: senderName,
        email: effectiveSender.email ?? null,
        phone: effectiveSender.phone ?? null,
        school_name: effectiveSender.school_name ?? null,
        class_name: effectiveSender.section_class ?? null,
        source: 'self_confirmed_support_email',
        last_channel: 'email',
        metadata: {
          recipient_email: toAddress.toLowerCase(),
          sender_role: effectiveSender.role,
        },
        confirmed_at: now,
        updated_at: now,
      };
      await supabase
        .from('customer_contact_book')
        .upsert(row, { onConflict: 'user_id' });
    }

    return NextResponse.json({ success: true, to: toAddress, subject, channel: 'smtp' });
  } catch (err: any) {
    console.error('[inbox/email] SendPulse error:', err);
    return NextResponse.json({ error: err.message || 'Email delivery failed' }, { status: 500 });
  }
}
