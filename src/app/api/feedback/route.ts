import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { sendFeedbackAutoResponseEmail } from '@/lib/email/feedback-autoresponder';
import { validateFeedbackInput } from '@/lib/feedback/validation';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { assignFeedbackOwner } from '@/lib/communication/duty-assignment';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const dynamic = 'force-dynamic';

// POST /api/feedback — submit user feedback
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: 'Active profile required' }, { status: 403 });
    }

    await Promise.all([
      checkCustomRateLimit({ key: `feedback:user:${user.id}`, max: 5, window: 3600 }),
      checkCustomRateLimit({ key: `feedback:ip:${getClientIp(req)}`, max: 20, window: 3600 }),
    ]);

    const body = await req.json();
    const parsed = validateFeedbackInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { type, rating, subject, message } = parsed.data;

    // Save feedback
    const { data: feedback, error: feedbackErr } = await admin
      .from('feedback')
      .insert({
        user_id: user.id,
        user_name: profile.full_name || user.email || 'User',
        user_email: profile.email || user.email || null,
        user_role: profile.role,
        type,
        rating,
        subject,
        message,
        status: 'new',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (feedbackErr) {
      return NextResponse.json({ error: feedbackErr.message }, { status: 500 });
    }

    // Assign routine work to the best available duty operator. Complaints stay with admin.
    let assignedTo: string | null = null;
    let assignmentSaved = false;
    try {
      const assignment = await assignFeedbackOwner(admin, {
        id: feedback.id,
        type,
        user_id: user.id,
      });
      assignedTo = assignment.assigneeId;
      assignmentSaved = assignment.assignmentSaved;
      if (assignment.snapshot.warnings.length) {
        console.warn('[feedback] duty assignment warnings:', assignment.snapshot.warnings);
      }
    } catch (assignmentError) {
      console.error('[feedback] duty assignment failed:', assignmentError);
    }

    let notificationRecipients: Array<{ id: string }> = [];
    if (assignedTo && assignmentSaved) {
      notificationRecipients = [{ id: assignedTo }];
    } else {
      const { data: admins } = await admin
        .from('portal_users')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)
        .limit(10);
      notificationRecipients = admins ?? [];
    }
    if (notificationRecipients.length) {
      await admin.from('notifications').insert(
        notificationRecipients.map((recipient) => ({
          user_id: recipient.id,
          type: 'info',
          title: assignmentSaved ? `Assigned ${type}: ${subject}` : `New ${type}: ${subject}`,
          message: `${profile.full_name || 'A user'} submitted ${type} feedback (${rating ? rating + ' stars' : 'no rating'})`,
          link: `/dashboard/feedback/${feedback.id}`,
          created_at: new Date().toISOString(),
        }))
      );
    }

    // Auto-respond based on type
    let autoResponseMessage = '';
    if (type === 'complaint') {
      autoResponseMessage = `We're sorry to hear about your experience. Our team will review your complaint and respond within 24 hours. Reference: FB-${feedback.id.slice(0, 8)}`;
    } else if (type === 'praise') {
      autoResponseMessage = `Thank you for your kind words! We're thrilled to hear you're enjoying Rillcod. Your feedback motivates us to keep improving!`;
    } else if (type === 'question') {
      autoResponseMessage = `Thank you for your question. Our support team will provide a detailed answer within 24 hours. Reference: FB-${feedback.id.slice(0, 8)}`;
    } else {
      autoResponseMessage = `Thank you for your suggestion! We review all feedback carefully and will consider it for future updates. Reference: FB-${feedback.id.slice(0, 8)}`;
    }

    const recipientEmail = profile.email || user.email;
    if (recipientEmail) {
      const emailResult = await sendFeedbackAutoResponseEmail(recipientEmail, autoResponseMessage, { recipientName: profile.full_name || undefined, category: type });
      if (!emailResult.sent) {
        console.warn('[feedback] Acknowledgement email was not delivered; the feedback remains recorded.');
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: feedback,
      message: autoResponseMessage
    });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('[feedback] submission failed:', err);
    return NextResponse.json({ error: 'Unable to submit feedback right now.' }, { status: 500 });
  }
}

// GET /api/feedback — list all feedback (admin only)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile?.is_active || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    let query = admin
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);
    if (profile.role === 'teacher') query = query.eq('assigned_to', user.id).neq('type', 'complaint');
    if (type) query = query.eq('type', type);

    const { data: feedbackList, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: feedbackList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
