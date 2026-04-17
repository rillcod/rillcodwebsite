import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const dynamic = 'force-dynamic';

// GET /api/webhooks/whatsapp — Webhook verification (Meta requirement)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'rillcod_webhook_secret_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.error('[WhatsApp Webhook] Verification failed');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST /api/webhooks/whatsapp — Receive incoming WhatsApp messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = adminClient();

    // Meta sends webhook in this format
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ success: true, message: 'No value in webhook' });
    }

    // Handle incoming messages
    if (value.messages) {
      for (const message of value.messages) {
        const from = message.from; // Phone number
        const messageId = message.id;
        const timestamp = message.timestamp;
        const messageType = message.type;
        let messageBody = '';

        // Extract message body based on type
        if (messageType === 'text') {
          messageBody = message.text?.body || '';
        } else if (messageType === 'image') {
          messageBody = `[Image] ${message.image?.caption || 'Image received'}`;
        } else if (messageType === 'document') {
          messageBody = `[Document] ${message.document?.filename || 'Document received'}`;
        } else if (messageType === 'audio') {
          messageBody = '[Audio message]';
        } else if (messageType === 'video') {
          messageBody = `[Video] ${message.video?.caption || 'Video received'}`;
        } else {
          messageBody = `[${messageType}] Unsupported message type`;
        }

        // Get or create conversation
        let { data: conversation } = await admin
          .from('whatsapp_conversations')
          .select('id, contact_name, unread_count, portal_user_id')
          .eq('phone_number', from)
          .maybeSingle();

        if (!conversation) {
          // Check if this phone number belongs to an existing portal user
          const { data: user } = await admin
            .from('portal_users')
            .select('id')
            .ilike('phone', `%${from.slice(-10)}%`) // Match last 10 digits to catch variations in country codes
            .limit(1)
            .maybeSingle();

          // Create new conversation
          const { data: newConv, error: convErr } = await admin
            .from('whatsapp_conversations')
            .insert({
              phone_number: from,
              portal_user_id: user?.id || null,
              contact_name: value.contacts?.[0]?.profile?.name || null,
              last_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
              last_message_preview: messageBody.slice(0, 100),
              unread_count: 1,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (convErr) {
            console.error('[WhatsApp Webhook] Failed to create conversation:', convErr);
            continue;
          }
          conversation = newConv;
        } else {
          // If conversation exists but isn't linked, try linking it now
          if (!conversation.portal_user_id) {
             const { data: user } = await admin
              .from('portal_users')
              .select('id')
              .ilike('phone', `%${from.slice(-10)}%`)
              .limit(1)
              .maybeSingle();
             
             if (user) {
               await admin.from('whatsapp_conversations').update({ portal_user_id: user.id }).eq('id', conversation.id);
             }
          }

          // Update existing conversation
          await admin
            .from('whatsapp_conversations')
            .update({
              last_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
              last_message_preview: messageBody.slice(0, 100),
              unread_count: (conversation as any).unread_count + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversation.id);
        }

        // Final safety check for TypeScript
        if (!conversation) {
          console.error('[WhatsApp Webhook] No conversation found or created for', from);
          continue;
        }

        // Save message to database
        const { error: msgErr } = await admin
          .from('whatsapp_messages')
          .insert({
            conversation_id: conversation.id,
            direction: 'inbound',
            body: messageBody,
            status: 'received',
            metadata: {
              whatsapp_message_id: messageId,
              message_type: messageType,
              timestamp: parseInt(timestamp),
            },
            created_at: new Date(parseInt(timestamp) * 1000).toISOString(),
          });

        if (msgErr) {
          console.error('[WhatsApp Webhook] Failed to save message:', msgErr);
          continue;
        }

        // Trigger auto-response if enabled
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/inbox/auto-respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: messageBody,
              conversation_id: conversation.id,
              phone_number: from,
            }),
          });
        } catch (autoResErr) {
          console.error('[WhatsApp Webhook] Auto-response failed:', autoResErr);
        }

        console.log(`[WhatsApp Webhook] Message received from ${from}: ${messageBody.slice(0, 50)}...`);
      }
    }

    // Handle message status updates (sent, delivered, read)
    if (value.statuses) {
      for (const status of value.statuses) {
        const messageId = status.id;
        const newStatus = status.status; // sent, delivered, read, failed

        await admin
          .from('whatsapp_messages')
          .update({ 
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('metadata->>whatsapp_message_id', messageId);

        console.log(`[WhatsApp Webhook] Message ${messageId} status: ${newStatus}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
