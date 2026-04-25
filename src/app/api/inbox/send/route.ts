import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage } from '@/lib/communication/abusePolicy';

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

// Send message via Meta WhatsApp Business API
async function sendWhatsAppMessage(to: string, message: string) {
  const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
  const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    console.warn('[WhatsApp] API credentials not configured. Message saved to DB only.');
    return { success: false, reason: 'credentials_missing' };
  }

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''), // Remove non-digits
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[WhatsApp API Error]', data);
      
      // Check if it's a "not a WhatsApp user" error
      const errorMessage = data.error?.message || '';
      const errorCode = data.error?.code;
      
      const isNotWhatsAppUser = errorMessage.toLowerCase().includes('not a whatsapp user') || 
                                 errorMessage.toLowerCase().includes('phone number is not registered') ||
                                 errorCode === 131026;
      
      // Check for rate limit errors
      const isRateLimitError = errorCode === 80007 || 
                                errorCode === 130429 ||
                                errorMessage.toLowerCase().includes('rate limit') ||
                                errorMessage.toLowerCase().includes('too many requests');
      
      return { 
        success: false, 
        reason: isNotWhatsAppUser ? 'not_whatsapp_user' : isRateLimitError ? 'rate_limit' : 'api_error',
        error: data.error?.message || 'Unknown error',
        errorCode,
        isNotWhatsAppUser,
        isRateLimitError
      };
    }

    return { 
      success: true, 
      messageId: data.messages?.[0]?.id,
      data 
    };
  } catch (error: any) {
    console.error('[WhatsApp API Exception]', error);
    return { 
      success: false, 
      reason: 'network_error',
      error: error.message 
    };
  }
}

// Send a pre-approved WhatsApp template message (for initiating conversations)
async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: string[], // ordered list of {{1}}, {{2}} values
) {
  const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
  const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN) {
    return { success: false, reason: 'credentials_missing' };
  }
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: variables.length > 0 ? [{
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: v })),
          }] : [],
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error?.message, errorCode: data.error?.code };
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, reason: 'network_error', error: err.message };
  }
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
          sender_id: callerProfile!.id,
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

    // Fetch conversation to get phone number and opt-out status
    const { data: conversation, error: convErr } = await admin
      .from('whatsapp_conversations')
      .select('phone_number, contact_name, opted_out')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
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
    const metadata: any = { sent_by: caller.id, sent_by_name: caller.full_name };

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
        message: 'Message sent via WhatsApp Business API',
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
          ? 'Message saved. WhatsApp API credentials pending - add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to environment variables.'
          : isNotWhatsAppUser
          ? `This number (+${conversation.phone_number}) is not registered on WhatsApp. Message saved but cannot be delivered via WhatsApp.`
          : isRateLimitError
          ? `⚠️ Rate limit reached! You've hit WhatsApp's message limit (1,000 conversations/month or 250 messages/day). Message saved but not sent. Consider upgrading to paid tier.`
          : `Message saved but WhatsApp API failed: ${whatsappResult.error || whatsappResult.reason}. You can send manually via wa.me link.`,
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
