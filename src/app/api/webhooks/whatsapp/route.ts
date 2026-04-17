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
      return NextResponse.json({ error: 'Ignore' }, { status: 200 });
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
            const textBody = msg.text?.body || msg.caption || '';
            const mediaUrl = msg.image?.link || msg.video?.link || msg.document?.link || null;

            // Skip if message already exists (duplicate webhook delivery)
            const { data: existingMsg } = await (admin as any)
              .from('whatsapp_messages')
              .select('id')
              .eq('meta_message_id', messageId)
              .maybeSingle();

            if (existingMsg) {
              console.log(`Duplicate message ${messageId}, skipping`);
              continue;
            }

            // 1. Find or create the conversation
            let { data: conversation } = await (admin as any).from('whatsapp_conversations')
              .select('*')
              .eq('phone_number', fromNumber)
              .maybeSingle();

            if (!conversation) {
              // Try to link to existing user by phone
              const { data: existingUser } = await (admin as any)
                .from('portal_users')
                .select('id')
                .eq('phone', fromNumber)
                .maybeSingle();

              const { data: newConv } = await (admin as any).from('whatsapp_conversations')
                .insert({
                  phone_number: fromNumber,
                  contact_name: contactName,
                  portal_user_id: existingUser?.id || null,
                  last_message_at: new Date().toISOString(),
                  last_message_preview: textBody.substring(0, 50),
                  unread_count: 1
                })
                .select()
                .single();
              conversation = newConv;
            } else {
              // Update conversation
              await (admin as any).from('whatsapp_conversations')
                .update({
                  last_message_at: new Date().toISOString(),
                  last_message_preview: textBody.substring(0, 50),
                  unread_count: (conversation.unread_count || 0) + 1,
                  contact_name: contactName !== 'Unknown' ? contactName : conversation.contact_name,
                  updated_at: new Date().toISOString()
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
                media_url: mediaUrl,
                status: 'received'
              });

            // 3. (Optional) Auto-responder or notification to staff
            // You can trigger notifications here if needed
          }
        }

        if (change.value.statuses) {
          // Status updates (delivered, read, failed)
          for (const status of change.value.statuses) {
            const updateData: any = { status: status.status };
            
            // Add error details if message failed
            if (status.status === 'failed' && status.errors) {
              updateData.body = `[FAILED] ${status.errors[0]?.title || 'Unknown error'}`;
            }

            await (admin as any).from('whatsapp_messages')
              .update(updateData)
              .eq('meta_message_id', status.id);
          }
        }
      }
    }

    // Always return 200 OK to Meta quickly so they don't retry and ban your webhook
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 });
  }
}
