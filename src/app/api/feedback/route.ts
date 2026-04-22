import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { sendFeedbackAutoResponseEmail } from '@/lib/email/feedback-autoresponder';

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
    const { data: { user } } = await supabase.auth.getUser();
    
    const admin = adminClient();
    const body = await req.json();
    const { type, rating, subject, message, user_id, user_name, user_email, user_role } = body;

    if (!type || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'type, subject, and message required' }, { status: 400 });
    }

    // Save feedback
    const { data: feedback, error: feedbackErr } = await admin
      .from('feedback')
      .insert({
        user_id: user?.id || user_id,
        user_name: user_name || 'Anonymous',
        user_email: user_email || null,
        user_role: user_role || 'guest',
        type,
        rating: rating || null,
        subject: subject.trim(),
        message: message.trim(),
        status: 'new',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (feedbackErr) {
      return NextResponse.json({ error: feedbackErr.message }, { status: 500 });
    }

    // Notify all admin users of new feedback
    const { data: admins } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(10);
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a: { id: string }) => ({
          user_id: a.id,
          type: 'info',
          title: `New ${type}: ${subject.trim()}`,
          message: `${user_name || 'A user'} submitted ${type} feedback (${rating ? rating + ' stars' : 'no rating'})`,
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

    if (user_email?.trim()) {
      const emailResult = await sendFeedbackAutoResponseEmail(user_email.trim(), autoResponseMessage);
      if (!emailResult.sent && emailResult.reason === 'email_not_configured') {
        console.info('[feedback] In-app notification only; configure RESEND_API_KEY + RESEND_FROM_EMAIL for auto-response emails.');
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: feedback,
      message: autoResponseMessage
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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
