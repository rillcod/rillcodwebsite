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
    await requireStaff(req);
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id, opted_out');
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversation } = await query.maybeSingle();
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Idempotent — already opted out
    if (conversation.opted_out) {
      return NextResponse.json({ success: true, message: 'Already opted out', phone_number: conversation.phone_number });
    }

    await admin.from('whatsapp_conversations').update({
      opted_out: true,
      opted_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    if (conversation.portal_user_id) {
      await admin.from('portal_users').update({
        whatsapp_opt_in: false,
        updated_at: new Date().toISOString(),
      }).eq('id', conversation.portal_user_id);
    }

    const confirmationMessage = `✅ You have been unsubscribed from Rillcod Technologies WhatsApp notifications.\n\nYou will no longer receive automated messages from us.\n\nTo opt back in, reply "START" or visit your dashboard settings.\n\nThank you for using Rillcod Technologies.`;

    // Try sending via WhatsApp API — record actual status
    const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
    let msgStatus = 'pending';
    let waMessageId: string | null = null;

    if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
      try {
        const res = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: conversation.phone_number.replace(/\D/g, ''),
            type: 'text',
            text: { body: confirmationMessage, preview_url: false },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          waMessageId = data.messages?.[0]?.id ?? null;
          msgStatus = 'sent';
        }
      } catch (e) {
        console.error('[Opt-Out] WhatsApp API failed:', e);
      }
    }

    await admin.from('whatsapp_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      body: confirmationMessage,
      status: msgStatus,
      metadata: { auto_response: true, opt_out_confirmation: true, whatsapp_message_id: waMessageId },
      created_at: new Date().toISOString(),
    });

    await admin.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: confirmationMessage.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    return NextResponse.json({ success: true, message: 'User opted out successfully', phone_number: conversation.phone_number });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

// PUT /api/inbox/opt-out — Opt a user back in (staff action)
export async function PUT(req: NextRequest) {
  try {
    await requireStaff(req);
    const admin = adminClient();
    const body = await req.json();
    const { phone_number, conversation_id } = body;

    if (!phone_number && !conversation_id) {
      return NextResponse.json({ error: 'phone_number or conversation_id required' }, { status: 400 });
    }

    let query = admin.from('whatsapp_conversations').select('id, phone_number, portal_user_id, opted_out');
    if (conversation_id) {
      query = query.eq('id', conversation_id);
    } else {
      query = query.eq('phone_number', phone_number.replace(/\D/g, ''));
    }

    const { data: conversation } = await query.maybeSingle();
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Idempotent — already opted in
    if (!conversation.opted_out) {
      return NextResponse.json({ success: true, message: 'Already opted in', phone_number: conversation.phone_number });
    }

    await admin.from('whatsapp_conversations').update({
      opted_out: false,
      opted_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    if (conversation.portal_user_id) {
      await admin.from('portal_users').update({
        whatsapp_opt_in: true,
        updated_at: new Date().toISOString(),
      }).eq('id', conversation.portal_user_id);
    }

    const welcomeMessage = `🎉 Welcome back to Rillcod Technologies WhatsApp notifications!\n\nYou will now receive:\n✅ Important updates\n✅ Assignment reminders\n✅ Payment confirmations\n✅ Support responses\n\nTo unsubscribe anytime, reply "STOP"\n\nThank you for choosing Rillcod Technologies!`;

    const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
    let msgStatus = 'pending';
    let waMessageId: string | null = null;

    if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
      try {
        const res = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: conversation.phone_number.replace(/\D/g, ''),
            type: 'text',
            text: { body: welcomeMessage, preview_url: false },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          waMessageId = data.messages?.[0]?.id ?? null;
          msgStatus = 'sent';
        }
      } catch (e) {
        console.error('[Opt-In] WhatsApp API failed:', e);
      }
    }

    await admin.from('whatsapp_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      body: welcomeMessage,
      status: msgStatus,
      metadata: { auto_response: true, opt_in_confirmation: true, whatsapp_message_id: waMessageId },
      created_at: new Date().toISOString(),
    });

    await admin.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: welcomeMessage.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    return NextResponse.json({ success: true, message: 'User opted in successfully', phone_number: conversation.phone_number });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
