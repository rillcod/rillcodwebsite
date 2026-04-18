import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/inbox/opt-out — Handle opt-out requests
export async function POST(req: NextRequest) {
  try {
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    // Find conversation
    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id');
    
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversation } = await query.maybeSingle();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Mark conversation as opted out
    await admin
      .from('whatsapp_conversations')
      .update({
        opted_out: true,
        opted_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // If linked to portal user, update their preferences
    if (conversation.portal_user_id) {
      await admin
        .from('portal_users')
        .update({
          whatsapp_opt_in: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.portal_user_id);
    }

    // Send confirmation message
    const confirmationMessage = `✅ You have been unsubscribed from Rillcod Technologies WhatsApp notifications.

You will no longer receive automated messages from us.

To opt back in, reply "START" or visit your dashboard settings.

Thank you for using Rillcod Technologies.`;

    // Save confirmation to database
    await admin
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: confirmationMessage,
        status: 'pending',
        metadata: { 
          auto_response: true,
          opt_out_confirmation: true 
        },
        created_at: new Date().toISOString(),
      });

    // Try to send via WhatsApp API
    const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

    if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
      try {
        await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: conversation.phone_number.replace(/\D/g, ''),
            type: 'text',
            text: { body: confirmationMessage }
          })
        });
      } catch (e) {
        console.error('[Opt-Out] WhatsApp API failed:', e);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'User opted out successfully',
      phone_number: conversation.phone_number
    });
  } catch (err: any) {
    console.error('[Opt-Out] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/inbox/opt-in — Handle opt-in requests
export async function PUT(req: NextRequest) {
  try {
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    // Find conversation
    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id');
    
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversation } = await query.maybeSingle();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Mark conversation as opted in
    await admin
      .from('whatsapp_conversations')
      .update({
        opted_out: false,
        opted_in_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // If linked to portal user, update their preferences
    if (conversation.portal_user_id) {
      await admin
        .from('portal_users')
        .update({
          whatsapp_opt_in: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.portal_user_id);
    }

    // Send welcome back message
    const welcomeMessage = `🎉 Welcome back to Rillcod Technologies WhatsApp notifications!

You will now receive:
✅ Important updates
✅ Assignment reminders
✅ Payment confirmations
✅ Support responses

To unsubscribe anytime, reply "STOP"

Thank you for choosing Rillcod Technologies!`;

    // Save welcome message to database
    await admin
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: welcomeMessage,
        status: 'pending',
        metadata: { 
          auto_response: true,
          opt_in_confirmation: true 
        },
        created_at: new Date().toISOString(),
      });

    // Try to send via WhatsApp API
    const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

    if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
      try {
        await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: conversation.phone_number.replace(/\D/g, ''),
            type: 'text',
            text: { body: welcomeMessage }
          })
        });
      } catch (e) {
        console.error('[Opt-In] WhatsApp API failed:', e);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'User opted in successfully',
      phone_number: conversation.phone_number
    });
  } catch (err: any) {
    console.error('[Opt-In] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
