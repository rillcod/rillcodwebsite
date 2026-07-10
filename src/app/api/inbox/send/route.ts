import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage } from '@/lib/communication/abusePolicy';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireStaff(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  
  if (authErr || !user) {
    throw new Error('Unauthorized');
  }

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    throw new Error('Forbidden: Staff access required');
  }

  return profile;
}

/** Normalize to E.164 digits (no +). Nigerian 08XX → 234XX. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  return digits;
}

function getWhatsAppConfig() {
  const explicitUrl = process.env.WHATSAPP_API_URL;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  const token = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const url = explicitUrl || (phoneNumberId ? `https://graph.facebook.com/${version}/${phoneNumberId}/messages` : '');
  return { url, token };
}

// Send through the unified WhatsApp transport.
async function sendWhatsAppMessage(to: string, message: string) {
  return sendWhatsAppDetailed({ to, message });
}

// Send a pre-approved WhatsApp template message (for initiating conversations)
async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: string[],
) {
  return sendWhatsAppDetailed({ to, templateName, templateVariables: variables });
}

// POST /api/inbox/send — send a message (staff → WhatsApp; learner → inbound portal message)
export async function POST(req: NextRequest) {
  try {
    const admin = adminClient();
    const body = await req.json();
    const { conversation_id, message, use_template, template_name, template_variables } = body;

    if (!conversation_id || !message?.trim()) {
      return NextResponse.json({ error: 'conversation_id and message required' }, { status: 400 });
    }

    if (message.trim().length > 4096) {
      return NextResponse.json({ error: 'Message exceeds WhatsApp 4096 character limit' }, { status: 400 });
    }

    // Auth: allow staff AND learners (student/parent send inbound portal messages)
    const supabaseServer = await createServerClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: callerProfile } = await admin
      .from('portal_users')
      .select('id, role, school_id, full_name')
      .eq('id', user.id)
      .single();

    const role = callerProfile?.role ?? '';
    if (!['admin', 'teacher', 'school', 'student', 'parent'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isLearner = role === 'student' || role === 'parent';

    if (isLearner) {
      // Learner path: save as inbound (from their side), no WhatsApp API call
      const { data: conv } = await admin
        .from('whatsapp_conversations')
        .select('id, portal_user_id')
        .eq('id', conversation_id)
        .maybeSingle();
      if (!conv || conv.portal_user_id !== callerProfile!.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const { data: newMessage, error: msgErr } = await admin
        .from('whatsapp_messages')
        .insert({
          conversation_id,
          direction: 'inbound',
          body: message.trim(),
          status: 'received',
          // whatsapp_messages has no sender_id column — record the sender in metadata.
          metadata: { sender_id: callerProfile!.id, source: 'parent_portal' },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
      await admin.from('whatsapp_conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: message.trim().slice(0, 100),
        updated_at: new Date().toISOString(),
      }).eq('id', conversation_id);
      return NextResponse.json({ success: true, data: newMessage });
    }

    // ── Staff path (original behaviour) ─────────────────────────────────────
    const caller = callerProfile as { id: string; role: string; school_id: string | null; full_name: string };
    if (!['admin', 'teacher', 'school'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 });
    }

    // Fetch conversation to get phone number, opt-out status and scope.
    const { data: conversation, error: convErr } = await admin
      .from('whatsapp_conversations')
      .select('phone_number, contact_name, opted_out, assigned_staff_id, portal_user_id, portal_user:portal_users!portal_user_id(school_id)')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const portalUser = Array.isArray((conversation as any).portal_user)
      ? (conversation as any).portal_user[0]
      : (conversation as any).portal_user;

    if (caller.role === 'teacher' && conversation.assigned_staff_id !== caller.id) {
      return NextResponse.json({ error: 'You can only send WhatsApp messages for conversations assigned to you' }, { status: 403 });
    }

    if (caller.role === 'school' && (!conversation.portal_user_id || portalUser?.school_id !== caller.school_id)) {
      return NextResponse.json({ error: 'You can only send WhatsApp messages for your school contacts' }, { status: 403 });
    }

    // Check if user has opted out
    if (conversation.opted_out) {
      return NextResponse.json({ 
        error: 'User has opted out of WhatsApp notifications. They must reply "START" to opt back in.',
        opted_out: true
      }, { status: 403 });
    }

    const policy = await evaluateAndTrackMessage({
      senderId: caller.id,
      senderRole: (caller.role ?? 'teacher') as 'student' | 'parent' | 'teacher' | 'admin' | 'school',
      channel: 'whatsapp_direct',
      message: message.trim(),
      targetConversationId: conversation_id,
    });
    if (!policy.allowed) {
      return NextResponse.json(
        {
          error: policy.reason ?? 'Message blocked by safety policy',
          cooldown_remaining_seconds: policy.cooldownRemainingSeconds ?? null,
          remaining_daily: policy.remainingDaily ?? null,
          recommendation: policy.recommendation ?? 'none',
        },
        { status: policy.cooldownRemainingSeconds ? 429 : 403 },
      );
    }

    // Try to send via WhatsApp Business API
    // use_template=true → approved template (for initiating conversations)
    // default → free-form text (only works within 24h reply window)
    const whatsappResult = use_template
      ? await sendWhatsAppTemplate(
          conversation.phone_number,
          template_name || 'student_update_notification',
          template_variables || [conversation.contact_name || 'Parent', message.trim()],
        )
      : await sendWhatsAppMessage(conversation.phone_number, message.trim());

    // Determine message status based on API result
    let messageStatus = 'sent';
    const metadata: any = {
      sent_by: caller.id,
      sent_by_name: caller.full_name,
      sent_by_role: caller.role,
      channel_label: 'Rillcod Company WhatsApp',
      company_representative: true,
    };

    if (whatsappResult.success) {
      messageStatus = 'sent';
      metadata.whatsapp_message_id = whatsappResult.messageId;
      metadata.api_response = 'success';
    } else {
      messageStatus = 'pending'; // Will retry or send manually
      metadata.api_error = whatsappResult.reason;
      metadata.error_details = whatsappResult.error;
      metadata.is_not_whatsapp_user = (whatsappResult as any).isNotWhatsAppUser || false;
      metadata.is_rate_limit_error = (whatsappResult as any).isRateLimitError || false;
      metadata.error_code = whatsappResult.errorCode;
    }

    // Create outbound message record in database
    const { data: newMessage, error: msgErr } = await admin
      .from('whatsapp_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        body: message.trim(),
        status: messageStatus,
        metadata,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    // Update conversation last_message
    await admin
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: message.trim().slice(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    // Return appropriate response
    if (whatsappResult.success) {
      return NextResponse.json({ 
        success: true, 
        data: newMessage,
        whatsapp_status: 'sent',
        message: 'Message sent through the Rillcod company WhatsApp channel',
        policy: {
          remaining_daily: policy.remainingDaily ?? null,
          recommendation: policy.recommendation ?? 'none',
        },
      });
    } else {
      const isNotWhatsAppUser = (whatsappResult as any).isNotWhatsAppUser || whatsappResult.reason === 'not_whatsapp_user';
      const isRateLimitError = (whatsappResult as any).isRateLimitError || whatsappResult.reason === 'rate_limit';
      
      return NextResponse.json({ 
        success: true, 
        data: newMessage,
        whatsapp_status: 'pending',
        is_not_whatsapp_user: isNotWhatsAppUser,
        is_rate_limit_error: isRateLimitError,
        message: whatsappResult.reason === 'credentials_missing'
          ? 'Message saved. WhatsApp API credentials pending - add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN, or WHATSAPP_API_URL and WHATSAPP_API_TOKEN, to environment variables.'
          : isNotWhatsAppUser
          ? `This number (+${conversation.phone_number}) is not registered on WhatsApp. Message saved on the Rillcod company channel but cannot be delivered via WhatsApp.`
          : isRateLimitError
          ? `⚠️ Rate limit reached! You've hit WhatsApp's message limit (1,000 conversations/month or 250 messages/day). Message saved but not sent. Consider upgrading to paid tier.`
          : `Message saved on the Rillcod company channel but WhatsApp delivery failed: ${whatsappResult.error || whatsappResult.reason}. You can send manually via wa.me link.`,
        fallback_url: `https://wa.me/${conversation.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(message.trim())}`,
        policy: {
          remaining_daily: policy.remainingDaily ?? null,
          recommendation: policy.recommendation ?? 'none',
        },
      });
    }
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
