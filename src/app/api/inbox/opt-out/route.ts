import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send-message';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireStaff(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    throw new Error('Forbidden');
  }
  return profile;
}

// POST /api/inbox/opt-out — Manually opt a user out (staff action)
export async function POST(req: NextRequest) {
  try {
    const profile = await requireStaff(req);
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id, opted_out, assigned_staff_id');
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversations } = await query;
    if (!conversations || conversations.length === 0) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    if (profile.role === 'school' || profile.role === 'teacher') {
      const portalIds = conversations.map((c: any) => c.portal_user_id).filter(Boolean);
      const { data: users } = portalIds.length
        ? await admin.from('portal_users').select('id, school_id').in('id', portalIds)
        : { data: [] as any[] };
      const schools = new Map((users ?? []).map((u: any) => [u.id, u.school_id]));
      const unauthorized = conversations.some((c: any) => c.portal_user_id
        ? schools.get(c.portal_user_id) !== profile.school_id
        : c.assigned_staff_id !== profile.id);
      if (unauthorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const conversation = conversations[0];
    const conversationIds = conversations.map(c => c.id);

    const { data: updated } = await admin
      .from('whatsapp_conversations')
      .update({
        opted_out: true,
        opted_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', conversationIds)
      .eq('opted_out', false)
      .select();

    if (!updated || updated.length === 0) {
      return NextResponse.json({ success: true, already_opted_out: true, phone_number: conversation.phone_number });
    }

    const portalUserIds = conversations.map(c => c.portal_user_id).filter(Boolean);
    if (portalUserIds.length > 0) {
      await admin.from('portal_users').update({
        whatsapp_opt_in: false,
        updated_at: new Date().toISOString(),
      }).in('id', portalUserIds);
    }

    const confirmationMessage = `✅ You have been unsubscribed from Rillcod Technologies WhatsApp notifications.\n\nYou will no longer receive automated messages from us.\n\nTo opt back in, reply "START" or visit your dashboard settings.\n\nThank you for using Rillcod Technologies.`;

    let msgStatus = 'pending';
    let waMessageId: string | null = null;

    const waResult = await sendWhatsAppMessage({
      to: conversation.phone_number.replace(/\D/g, ''),
      type: 'text',
      body: confirmationMessage,
    });

    if (waResult.success) {
      waMessageId = waResult.messageId ?? null;
      msgStatus = 'sent';
    } else {
      console.error('[Opt-Out] WhatsApp API failed:', waResult.error);
    }

    const messagesToInsert = updated.map(c => ({
      conversation_id: c.id,
      direction: 'outbound',
      body: confirmationMessage,
      status: msgStatus,
      metadata: { auto_response: true, opt_out_confirmation: true, whatsapp_message_id: waMessageId },
      created_at: new Date().toISOString(),
    }));
    await admin.from('whatsapp_messages').insert(messagesToInsert);

    await admin.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: confirmationMessage.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).in('id', updated.map(c => c.id));

    // Send confirmation email if the user has a portal email address
    if (conversation.portal_user_id) {
      try {
        const { data: userProfile } = await admin
          .from('portal_users')
          .select('email, full_name')
          .eq('id', conversation.portal_user_id)
          .maybeSingle();
        if (userProfile?.email) {
          const { notificationsService } = await import('@/services/notifications.service');
          const { buildOptInConfirmationEmail } = await import('@/lib/email/rillcod-transactional-email');
          const html = buildOptInConfirmationEmail({
            recipientName: userProfile.full_name || undefined,
            direction:     'out',
            phoneNumber:   conversation.phone_number,
            portalUrl:     `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
          });
          await notificationsService.sendExternalEmail({
            to:        userProfile.email,
            subject:   'You have unsubscribed from Rillcod Technologies WhatsApp notifications',
            fromName:  'Rillcod Technologies',
            fromEmail: SMTP_FROM_EMAIL,
            html,
          });
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, message: 'User opted out successfully', phone_number: conversation.phone_number });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('[inbox/opt-out]', err);
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : err.message }, { status });
  }
}

// PUT /api/inbox/opt-out — Opt a user back in (staff action)
export async function PUT(req: NextRequest) {
  try {
    const profile = await requireStaff(req);
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id, opted_out, assigned_staff_id');
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversations } = await query;
    if (!conversations || conversations.length === 0) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    if (profile.role === 'school' || profile.role === 'teacher') {
      const portalIds = conversations.map((c: any) => c.portal_user_id).filter(Boolean);
      const { data: users } = portalIds.length
        ? await admin.from('portal_users').select('id, school_id').in('id', portalIds)
        : { data: [] as any[] };
      const schools = new Map((users ?? []).map((u: any) => [u.id, u.school_id]));
      const unauthorized = conversations.some((c: any) => c.portal_user_id
        ? schools.get(c.portal_user_id) !== profile.school_id
        : c.assigned_staff_id !== profile.id);
      if (unauthorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const conversation = conversations[0];
    const conversationIds = conversations.map(c => c.id);

    const { data: updated } = await admin
      .from('whatsapp_conversations')
      .update({
        opted_out: false,
        opted_in_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', conversationIds)
      .eq('opted_out', true)
      .select();

    if (!updated || updated.length === 0) {
      return NextResponse.json({ success: true, already_opted_in: true, phone_number: conversation.phone_number });
    }

    const portalUserIds = conversations.map(c => c.portal_user_id).filter(Boolean);
    if (portalUserIds.length > 0) {
      await admin.from('portal_users').update({
        whatsapp_opt_in: true,
        updated_at: new Date().toISOString(),
      }).in('id', portalUserIds);
    }

    const welcomeMessage = `🎉 Welcome back to Rillcod Technologies WhatsApp notifications!\n\nYou will now receive:\n✅ Important updates\n✅ Assignment reminders\n✅ Payment confirmations\n✅ Support responses\n\nTo unsubscribe anytime, reply "STOP"\n\nThank you for choosing Rillcod Technologies!`;

    let msgStatus = 'pending';
    let waMessageId: string | null = null;

    const waResult = await sendWhatsAppMessage({
      to: conversation.phone_number.replace(/\D/g, ''),
      type: 'text',
      body: welcomeMessage,
    });

    if (waResult.success) {
      waMessageId = waResult.messageId ?? null;
      msgStatus = 'sent';
    } else {
      console.error('[Opt-In] WhatsApp API failed:', waResult.error);
    }

    const messagesToInsert = updated.map(c => ({
      conversation_id: c.id,
      direction: 'outbound',
      body: welcomeMessage,
      status: msgStatus,
      metadata: { auto_response: true, opt_in_confirmation: true, whatsapp_message_id: waMessageId },
      created_at: new Date().toISOString(),
    }));
    await admin.from('whatsapp_messages').insert(messagesToInsert);

    await admin.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: welcomeMessage.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).in('id', updated.map(c => c.id));

    // Send confirmation email if the user has a portal email address
    if (conversation.portal_user_id) {
      try {
        const { data: userProfile } = await admin
          .from('portal_users')
          .select('email, full_name')
          .eq('id', conversation.portal_user_id)
          .maybeSingle();
        if (userProfile?.email) {
          const { notificationsService } = await import('@/services/notifications.service');
          const { buildOptInConfirmationEmail } = await import('@/lib/email/rillcod-transactional-email');
          const html = buildOptInConfirmationEmail({
            recipientName: userProfile.full_name || undefined,
            direction:     'in',
            phoneNumber:   conversation.phone_number,
            portalUrl:     `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
          });
          await notificationsService.sendExternalEmail({
            to:        userProfile.email,
            subject:   'WhatsApp Notifications Enabled — Rillcod Technologies',
            fromName:  'Rillcod Technologies',
            fromEmail: SMTP_FROM_EMAIL,
            html,
          });
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, message: 'User opted in successfully', phone_number: conversation.phone_number });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    if (status === 500) console.error('[inbox/opt-out]', err);
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : err.message }, { status });
  }
}
