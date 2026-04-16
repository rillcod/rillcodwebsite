import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/config/env';

// GET /api/webhooks/whatsapp
// Meta's webhook verification process
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('WhatsApp Webhook Verified!');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Failed validation' }, { status: 403 });
}

// POST /api/webhooks/whatsapp
// Receive incoming messages and statuses from WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if it's a WhatsApp webhook payload
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ error: 'Ignore' }, { status: 404 });
    }

    const admin = createAdminClient();

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          // It's an incoming message
          for (const msg of change.value.messages) {
            const contactName = change.value.contacts?.[0]?.profile?.name || 'Unknown';
            const fromNumber = msg.from;
            const messageId = msg.id;
            const messageType = msg.type;
            const textBody = msg.text?.body || '';

            // 1. Find or create the conversation
            let { data: conversation } = await (admin as any).from('whatsapp_conversations')
              .select('*')
              .eq('phone_number', fromNumber)
              .maybeSingle();

            if (!conversation) {
              const { data: newConv } = await (admin as any).from('whatsapp_conversations')
                .insert({
                  phone_number: fromNumber,
                  contact_name: contactName,
                  last_message_at: new Date().toISOString(),
                  last_message_preview: textBody.substring(0, 50),
                  unread_count: 1
                })
                .select()
                .single();
              conversation = newConv;
            } else {
              await (admin as any).from('whatsapp_conversations')
                .update({
                  last_message_at: new Date().toISOString(),
                  last_message_preview: textBody.substring(0, 50),
                  unread_count: conversation.unread_count + 1
                  // Optionally update contact_name if it was Unknown previously
                })
                .eq('id', conversation.id);
            }

            // 2. Insert the message
            await (admin as any).from('whatsapp_messages')
              .insert({
                conversation_id: conversation.id,
                direction: 'inbound',
                meta_message_id: messageId,
                message_type: messageType,
                body: textBody,
                status: 'received'
              });

            // 3. (Optional) Auto-responder or Assignment Bot Logic
            // You can trigger the NotificationService here if you want to immediately reply
          }
        }

        if (change.value.statuses) {
          // Status updates (delivered, read, failed)
          for (const status of change.value.statuses) {
             await (admin as any).from('whatsapp_messages')
               .update({ status: status.status })
               .eq('meta_message_id', status.id);
          }
        }
      }
    }

    // Always return 200 OK to Meta quickly so they don't retry and ban your webhook
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
