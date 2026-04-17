import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify staff role
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 });
    }

    const { conversation_id, message } = await req.json();

    // Validation
    if (!conversation_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message must be a non-empty string' }, { status: 400 });
    }

    if (message.length > 4096) {
      return NextResponse.json({ error: 'Message too long (max 4096 characters)' }, { status: 400 });
    }

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
    let waResponse: any = null;
    let sendError: string | null = null;

    try {
      waResponse = await notificationsService.sendExternalWhatsApp({
        to: conversation.phone_number,
        body: message.trim()
      });
    } catch (err: any) {
      sendError = err.message || 'Failed to send message';
      console.error('WhatsApp send error:', err);
    }

    const metaMessageId = waResponse?.messages?.[0]?.id || null;
    const messageStatus = metaMessageId ? 'sent' : 'failed';

    // 3. Save the outbound message to the database
    const { data: insertedMsg, error: msgError } = await (admin as any)
      .from('whatsapp_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        message_type: 'text',
        body: messageStatus === 'failed' ? `[FAILED] ${message}` : message,
        meta_message_id: metaMessageId,
        status: messageStatus
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
        last_message_preview: `You: ${message.substring(0, 45)}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id);

    if (sendError) {
      return NextResponse.json({ 
        error: sendError, 
        data: insertedMsg 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: insertedMsg });

  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
