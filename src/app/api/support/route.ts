import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { SMTP_FROM_EMAIL } from '@/config/brand';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, full_name, email')
    .eq('id', user.id)
    .single();
  return profile ?? null;
}

// GET /api/support — list tickets
// Staff: sees all (with optional ?status= filter)
// Students/parents: sees only their own
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const admin = adminClient();

  let query = (admin as any)
    .from('support_tickets')
    .select('*, portal_users!support_tickets_user_id_fkey(id, full_name, email, role), assigned_to_user:portal_users!support_tickets_assigned_to_fkey(id, full_name)')
    .order('created_at', { ascending: false });

  const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);
  if (!isStaff) {
    query = query.eq('user_id', caller.id);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    // Table may not exist yet — return empty gracefully
    if (error.code === '42P01') return NextResponse.json({ data: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/support — create ticket
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { subject, message, category, invoice_id, priority } = body;

  if (!subject || !message) {
    return NextResponse.json({ error: 'subject and message are required' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('support_tickets')
    .insert({
      user_id: caller.id,
      subject: subject.slice(0, 200),
      message,
      category: category ?? 'general',
      invoice_id: invoice_id ?? null,
      priority: priority ?? 'normal',
      status: 'open',
    } as any)
    .select('id, subject, status, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Req 12.4 — acknowledgement email to ticket creator
  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildSupportTicketEmail } = await import('@/lib/email/rillcod-transactional-email');
    const { data: userProfile } = await admin
      .from('portal_users')
      .select('email, full_name')
      .eq('id', caller.id)
      .maybeSingle();

    if (userProfile?.email) {
      const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/support`;
      const html = buildSupportTicketEmail({
        recipientName: userProfile.full_name || 'there',
        ticketId:      String((data as any).id).slice(0, 8).toUpperCase(),
        subject:       subject.slice(0, 200),
        category:      String(category ?? 'General'),
        status:        'open',
        message:       message.slice(0, 500),
        portalUrl,
      });
      await notificationsService.sendEmail(caller.id, {
        to:        userProfile.email,
        subject:   `Support Ticket Received — Rillcod Technologies`,
        fromName:  'Rillcod Support',
        fromEmail: SMTP_FROM_EMAIL,
        html,
      });
    }
  } catch { /* non-critical */ }

  // Notify admins via internal notification
  try {
    const { data: admins } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .limit(5);

    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id,
          title: `New Support Ticket: ${subject.slice(0, 60)}`,
          message: `From ${caller.full_name || caller.email} — ${message.slice(0, 100)}`,
          type: 'info',
          action_url: '/dashboard/support',
        }))
      );
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ success: true, data });
}
