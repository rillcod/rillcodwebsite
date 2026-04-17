import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/inbox/auto-respond — auto-respond to common queries
export async function POST(req: NextRequest) {
  try {
    const admin = adminClient();
    const body = await req.json();
    const { message, conversation_id, phone_number } = body;

    if (!message || !conversation_id) {
      return NextResponse.json({ error: 'message and conversation_id required' }, { status: 400 });
    }

    // Identify student and school for scoping
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('portal_user_id')
      .eq('id', conversation_id)
      .single();

    if (!conv?.portal_user_id) return NextResponse.json({ success: true, message: 'Unlinked conversation' });

    const { data: student } = await admin
      .from('portal_users')
      .select('school_id')
      .eq('id', conv.portal_user_id)
      .single();

    if (!student?.school_id) return NextResponse.json({ success: true, message: 'Student has no school association' });

    // Check school-specific control settings
    const { data: settings } = await admin
      .from('school_whatsapp_settings')
      .select('is_enabled, human_takeover_timeout_minutes')
      .eq('school_id', student.school_id)
      .maybeSingle();

    if (settings && !settings.is_enabled) {
      return NextResponse.json({ success: true, responded: false, message: 'Auto-responder disabled for this school' });
    }

    // HUMAN TAKEOVER check: Did a teacher/admin reply recently?
    const timeout = settings?.human_takeover_timeout_minutes ?? 30;
    const sinceTime = new Date(Date.now() - timeout * 60 * 1000).toISOString();
    
    const { data: recentHumanMsg } = await admin
      .from('whatsapp_messages')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'outbound')
      .is('metadata->auto_response', null) // Only check non-auto messages
      .gte('created_at', sinceTime)
      .limit(1)
      .maybeSingle();

    if (recentHumanMsg) {
      return NextResponse.json({ success: true, responded: false, message: 'Human is currently in active conversation' });
    }

    const lowerMsg = message.toLowerCase().trim();

    // Auto-response rules
    let autoResponse: string | null = null;
    let shouldRespond = false;

    // Greeting detection
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)/i.test(lowerMsg)) {
      autoResponse = `Hello! 👋 Welcome to Rillcod Technologies. I'm here to help you with:

📚 Course information
💳 Payment inquiries
📊 Progress reports
🎓 Assignment help
📞 Technical support

How can I assist you today?`;
      shouldRespond = true;
    }
    // Payment queries
    else if (/payment|pay|invoice|fee|bill|cost|price/i.test(lowerMsg)) {
      autoResponse = `💳 For payment inquiries:

1. Check your invoice in the dashboard: https://rillcod.com/dashboard/finance
2. Pay online via Paystack (instant confirmation)
3. Contact our finance team: finance@rillcod.com

Need help with payment plans? Let me know!`;
      shouldRespond = true;
    }
    // Assignment help
    else if (/assignment|homework|project|task/i.test(lowerMsg)) {
      autoResponse = `📚 Assignment Help:

1. View all assignments: https://rillcod.com/dashboard/assignments
2. Submit your work directly in the dashboard
3. Check deadlines and grades

Which assignment do you need help with? I can connect you with your teacher.`;
      shouldRespond = true;
    }
    // Technical support
    else if (/problem|issue|error|not working|can't|cannot|help/i.test(lowerMsg)) {
      autoResponse = `🔧 Technical Support:

I'm sorry you're experiencing issues. To help you faster:

1. Describe the problem
2. Share any error messages
3. Tell me which device you're using

Our support team will respond within 2 hours. For urgent issues, call: 08116600000`;
      shouldRespond = true;
    }
    // Schedule/timetable
    else if (/schedule|timetable|class|time|when/i.test(lowerMsg)) {
      autoResponse = `📅 Class Schedule:

Check your personalized timetable: https://rillcod.com/dashboard/timetable

Classes run Monday-Friday, 9 AM - 3 PM.
Live sessions are announced in the dashboard.

Need to reschedule? Let me know!`;
      shouldRespond = true;
    }
    // Progress/grades
    else if (/grade|score|result|progress|report/i.test(lowerMsg)) {
      autoResponse = `📊 Progress & Grades:

View your progress: https://rillcod.com/dashboard/results

You can see:
✅ Assignment grades
✅ Test scores
✅ Overall progress
✅ Certificates earned

Parents can also access this from their portal!`;
      shouldRespond = true;
    }
    // Thank you
    else if (/thank|thanks|appreciate/i.test(lowerMsg)) {
      autoResponse = `You're very welcome! 🎉

We're always here to help. Feel free to reach out anytime.

Have a great day! 🚀`;
      shouldRespond = true;
    }

    if (shouldRespond && autoResponse) {
      const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
      const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

      // Try to send via Meta WhatsApp API
      let whatsappMessageId = null;
      let apiStatus = 'pending';

      if (WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
        try {
          const waRes = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phone_number.replace(/\D/g, ''),
              type: 'text',
              text: { body: autoResponse }
            })
          });

          if (waRes.ok) {
            const waData = await waRes.json();
            whatsappMessageId = waData.messages?.[0]?.id;
            apiStatus = 'sent';
          }
        } catch (e) {
          console.error('[AutoRespond] WhatsApp API failed:', e);
        }
      }

      // Save auto-response to database
      const { data: newMessage, error: msgErr } = await admin
        .from('whatsapp_messages')
        .insert({
          conversation_id,
          direction: 'outbound',
          body: autoResponse,
          status: apiStatus,
          created_at: new Date().toISOString(),
          metadata: { 
            auto_response: true, 
            trigger: lowerMsg.slice(0, 50),
            whatsapp_message_id: whatsappMessageId 
          },
        })
        .select()
        .single();

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
      }

      // Update conversation
      await admin
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: autoResponse.slice(0, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation_id);

      return NextResponse.json({ 
        success: true, 
        responded: true,
        whatsapp_status: apiStatus,
        data: newMessage 
      });
    }

    return NextResponse.json({ 
      success: true, 
      responded: false,
      message: 'No auto-response triggered' 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
