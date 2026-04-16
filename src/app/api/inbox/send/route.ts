import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversation_id, message } = await req.json();

    if (!conversation_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Get the conversation to find the phone number
    const { data: conversation, error: convError } = await (admin as any)
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Send the message via Meta API
    const waResponse = await notificationsService.sendExternalWhatsApp({
      to: conversation.phone_number,
      body: message
    });

    const metaMessageId = waResponse?.messages?.[0]?.id || null;

    // 3. Save the outbound message to the database
    const { data: insertedMsg, error: msgError } = await (admin as any)
      .from('whatsapp_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        message_type: 'text',
        body: message,
        meta_message_id: metaMessageId,
        status: metaMessageId ? 'sent' : 'failed'
      })
      .select()
      .single();

    if (msgError) {
      console.error('Failed to log outbound message:', msgError);
    }

    // 4. Update the conversation preview
    await (admin as any)
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `You: ${message.substring(0, 45)}`
      })
      .eq('id', conversation_id);

    return NextResponse.json({ success: true, data: insertedMsg });

  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
