import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
      return { 
        success: false, 
        reason: 'api_error',
        error: data.error?.message || 'Unknown error'
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

// POST /api/inbox/send — send a WhatsApp message
export async function POST(req: NextRequest) {
  try {
    const caller = await requireStaff(req);
    const admin = adminClient();

    const body = await req.json();
    const { conversation_id, message } = body;

    if (!conversation_id || !message?.trim()) {
      return NextResponse.json({ error: 'conversation_id and message required' }, { status: 400 });
    }

    // Fetch conversation to get phone number
    const { data: conversation, error: convErr } = await admin
      .from('whatsapp_conversations')
      .select('phone_number, contact_name')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Try to send via WhatsApp Business API
    const whatsappResult = await sendWhatsAppMessage(
      conversation.phone_number,
      message.trim()
    );

    // Determine message status based on API result
    let messageStatus = 'sent';
    let metadata: any = { sent_by: caller.id, sent_by_name: caller.full_name };

    if (whatsappResult.success) {
      messageStatus = 'sent';
      metadata.whatsapp_message_id = whatsappResult.messageId;
      metadata.api_response = 'success';
    } else {
      messageStatus = 'pending'; // Will retry or send manually
      metadata.api_error = whatsappResult.reason;
      metadata.error_details = whatsappResult.error;
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
        message: 'Message sent via WhatsApp Business API'
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        data: newMessage,
        whatsapp_status: 'pending',
        message: whatsappResult.reason === 'credentials_missing'
          ? 'Message saved. WhatsApp API credentials pending - add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to environment variables.'
          : `Message saved but WhatsApp API failed: ${whatsappResult.error || whatsappResult.reason}. You can send manually via wa.me link.`,
        fallback_url: `https://wa.me/${conversation.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(message.trim())}`
      });
    }
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden: Staff access required' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
