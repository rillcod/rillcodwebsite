import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { brandContact } from '@/config/brand';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send-message';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Intent definitions: each has a score function (higher = more specific match) and a response builder
type IntentDef = {
  id: string;
  score: (msg: string) => number;
  response: (name: string) => string;
};

const INTENTS: IntentDef[] = [
  {
    id: 'payment',
    score: msg => {
      let s = 0;
      if (/payment|pay|invoice|fee|bill/i.test(msg)) s += 3;
      if (/cost|price|amount|due|balance/i.test(msg)) s += 2;
      if (/paystack|bank|transfer|receipt/i.test(msg)) s += 2;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 👋 For payment inquiries:

1. View & pay your invoice: https://rillcod.com/dashboard/finance
2. Pay instantly via Paystack (card or bank transfer)
3. Email our finance team: finance@rillcod.com

A team member will follow up within 2 hours for personalized assistance.

_Reply STOP to unsubscribe from notifications_`,
  },
  {
    id: 'assignment',
    score: msg => {
      let s = 0;
      if (/assignment|homework|project|submit|submission/i.test(msg)) s += 3;
      if (/deadline|due date|late|grade|score/i.test(msg)) s += 2;
      if (/task|exercise|quiz|test/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 📚 For assignments & homework:

1. View all assignments: https://rillcod.com/dashboard/assignments
2. Submit your work directly in the dashboard
3. Check deadlines, grades, and teacher feedback

A teacher will respond shortly for specific questions.

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'technical',
    score: msg => {
      let s = 0;
      if (/problem|issue|error|bug|crash|broken/i.test(msg)) s += 3;
      if (/not working|can't|cannot|won't|failed/i.test(msg)) s += 2;
      if (/login|password|reset|access|account/i.test(msg)) s += 2;
      if (/app|website|platform|portal/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 🔧 I'm sorry you're experiencing an issue.

To help our team fix this fast, please share:
• A description of the problem
• Any error messages you see
• Which device / browser you're using

Our support team will respond within 2 hours. For urgent issues: 08116600000

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'schedule',
    score: msg => {
      let s = 0;
      if (/schedule|timetable|class|session|lecture/i.test(msg)) s += 3;
      if (/time|when|today|tomorrow|next|week/i.test(msg)) s += 1;
      if (/reschedule|postpone|cancel|absent|miss/i.test(msg)) s += 2;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 📅 Class schedules & sessions:

View your personalised timetable: https://rillcod.com/dashboard/timetable

Classes run Monday–Friday, 9 AM – 3 PM.
Live sessions and announcements appear in your dashboard.

A team member will respond soon for rescheduling requests.

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'progress',
    score: msg => {
      let s = 0;
      if (/grade|score|result|mark|performance/i.test(msg)) s += 3;
      if (/progress|report|certificate|transcript/i.test(msg)) s += 2;
      if (/pass|fail|improve|better/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 📊 Progress & grades:

View your results: https://rillcod.com/dashboard/results

You can see:
✅ Assignment grades
✅ Test & quiz scores
✅ Overall progress
✅ Certificates earned

Parents can also access this from their parent portal!

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'enrollment',
    score: msg => {
      let s = 0;
      if (/enrol|enroll|register|admission|join|sign.?up/i.test(msg)) s += 3;
      if (/course|program|programme|class|student/i.test(msg)) s += 2;
      if (/how|start|begin|get.?started/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! 🎓 Interested in enrolling?

Here's how to get started:
1. Visit: https://rillcod.com/enroll
2. Choose your programme (Web Dev, Python, STEM, etc.)
3. Complete registration & make payment

Our admissions team will contact you within 24 hours.
📞 Call/WhatsApp: 08116600000
📧 Email: admissions@rillcod.com

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'feedback',
    score: msg => {
      let s = 0;
      if (/complain|complaint|feedback|review|unhappy|disappoint|bad|poor|terrible/i.test(msg)) s += 3;
      if (/suggest|improve|better|wish|should|could/i.test(msg)) s += 2;
      if (/experience|service|quality/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hi ${name}! We're sorry to hear you're having a concern. 😔

Your feedback matters to us greatly. A senior team member will review your message and respond personally within 2 hours.

For urgent complaints:
📞 Call: 08116600000
📧 Email: ${brandContact.email}

Thank you for helping us improve! 🙏

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'thanks',
    score: msg => {
      let s = 0;
      if (/\b(thank|thanks|thank you|appreciate|grateful)\b/i.test(msg)) s += 3;
      if (/great|excellent|awesome|perfect|wonderful/i.test(msg)) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

You're very welcome, ${name}! 🎉

We're always here to help. Feel free to reach out anytime.

Have a great day! 🚀

_Reply STOP to unsubscribe_`,
  },
  {
    id: 'greeting',
    score: msg => {
      let s = 0;
      if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy|what's up)\b/i.test(msg)) s += 2;
      if (/^(hi|hello|hey)\b/i.test(msg) && msg.trim().split(/\s+/).length <= 4) s += 1;
      return s;
    },
    response: name => `🤖 *Auto-Response* — Rillcod Technologies

Hello ${name}! 👋 Welcome to Rillcod Technologies.

I can help with:
📚 Course & assignment info
💳 Payment inquiries
📊 Progress & grades
📅 Class schedules
🔧 Technical support

A team member will respond soon for personalized assistance.

_Reply STOP to unsubscribe_`,
  },
];

function pickIntent(msg: string): IntentDef | null {
  let best: IntentDef | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const s = intent.score(msg);
    if (s > bestScore) { bestScore = s; best = intent; }
  }
  return bestScore >= 2 ? best : null;
}

const BOT_COOLDOWN_MINUTES = 5;

// POST /api/inbox/auto-respond
export async function POST(req: NextRequest) {
  try {
    // Internal-only endpoint — must be called with x-internal-secret header
    const INTERNAL_SECRET = process.env.CRON_SECRET;
    if (!INTERNAL_SECRET) {
      console.error('[auto-respond] CRON_SECRET not configured — rejecting all requests');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const callerSecret = req.headers.get('x-internal-secret');
    if (!callerSecret || callerSecret !== INTERNAL_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = adminClient();
    const body = await req.json();
    const { message, conversation_id, phone_number } = body;

    if (typeof message !== 'string' || message.length > 4096) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }
    if (typeof conversation_id !== 'string' || conversation_id.length > 36) {
      return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 });
    }

    // Fetch conversation + opted_out status
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('portal_user_id, opted_out')
      .eq('id', conversation_id)
      .single();

    if (!conv?.portal_user_id) return NextResponse.json({ success: true, responded: false, message: 'Unlinked conversation — skipping bot' });
    if (conv.opted_out) return NextResponse.json({ success: true, responded: false, message: 'User opted out' });

    const { data: portalUser } = await admin
      .from('portal_users')
      .select('full_name, school_id')
      .eq('id', conv.portal_user_id)
      .single();

    if (!portalUser?.school_id) return NextResponse.json({ success: true, responded: false, message: 'No school association' });

    // School-level enable/disable + human takeover timeout
    const { data: settings } = await admin
      .from('school_whatsapp_settings')
      .select('is_enabled, human_takeover_timeout_minutes')
      .eq('school_id', portalUser.school_id)
      .maybeSingle();

    if (settings && !settings.is_enabled) {
      return NextResponse.json({ success: true, responded: false, message: 'Auto-responder disabled for this school' });
    }

    const humanTimeout = settings?.human_takeover_timeout_minutes ?? 30;
    const sinceHuman = new Date(Date.now() - humanTimeout * 60 * 1000).toISOString();

    // Human takeover check: staff replied recently (not a bot message)
    const { data: recentHuman } = await admin
      .from('whatsapp_messages')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'outbound')
      .filter('metadata->>auto_response', 'is', null)
      .gte('created_at', sinceHuman)
      .limit(1)
      .maybeSingle();

    if (recentHuman) {
      return NextResponse.json({ success: true, responded: false, message: 'Human is in active conversation' });
    }

    // Bot cooldown: don't auto-respond twice to same convo within BOT_COOLDOWN_MINUTES
    const sinceBotCooldown = new Date(Date.now() - BOT_COOLDOWN_MINUTES * 60 * 1000).toISOString();
    const { data: recentBot } = await admin
      .from('whatsapp_messages')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'outbound')
      .filter('metadata->>auto_response', 'eq', 'true')
      .gte('created_at', sinceBotCooldown)
      .limit(1)
      .maybeSingle();

    if (recentBot) {
      return NextResponse.json({ success: true, responded: false, message: 'Bot cooldown active' });
    }

    const intent = pickIntent(message.toLowerCase().trim());
    if (!intent) {
      return NextResponse.json({ success: true, responded: false, message: 'No intent matched' });
    }

    const firstName = (portalUser.full_name || 'there').split(' ')[0];
    const autoResponse = intent.response(firstName);

    let whatsappMessageId: string | null = null;
    let apiStatus = 'pending';
    let waResult: Awaited<ReturnType<typeof sendWhatsAppMessage>> | null = null;

    if (phone_number) {
      waResult = await sendWhatsAppMessage({
        to: phone_number.replace(/\D/g, ''),
        type: 'text',
        body: autoResponse,
      });

      if (waResult.success) {
        whatsappMessageId = waResult.messageId ?? null;
        apiStatus = 'sent';
      } else {
        console.error('[AutoRespond] WhatsApp API failed:', waResult.error);
      }
    }

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
          intent: intent.id,
          whatsapp_message_id: whatsappMessageId,
        },
      })
      .select()
      .single();

    if (msgErr) {
      console.error('[auto-respond] insert failed:', msgErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (waResult?.deliveryLogId) {
      try {
        await admin.from('communication_delivery_log').update({
          metadata: {
            auto_response: true,
            intent: intent.id,
            whatsapp_message_row_id: newMessage.id,
            conversation_id,
          },
          updated_at: new Date().toISOString(),
        }).eq('id', waResult.deliveryLogId);
      } catch (deliveryError) {
        console.error('[auto-respond] delivery log update failed:', deliveryError);
      }
    }

    await admin
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `🤖 ${autoResponse.split('\n').find(l => l.trim() && !l.startsWith('🤖')) || autoResponse.slice(0, 80)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    return NextResponse.json({ success: true, responded: true, intent: intent.id, whatsapp_status: apiStatus, data: newMessage });
  } catch (err: any) {
    console.error('[auto-respond]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
