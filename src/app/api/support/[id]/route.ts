import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

// PATCH /api/support/[id] — update ticket (admin: any field; user: only add reply)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();

  const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);

  if (isStaff) {
    // Staff can update status, assigned_to, admin_reply
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.status)       update.status       = body.status;
    if (body.admin_reply)  update.admin_reply  = body.admin_reply;
    if (body.assigned_to)  update.assigned_to  = body.assigned_to;
    if (body.priority)     update.priority     = body.priority;
    if (body.status === 'resolved') update.resolved_at = new Date().toISOString();

    const { data, error } = await admin
      .from('support_tickets')
      .update(update as any)
      .eq('id', id)
      .select('id, status, admin_reply')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify the user that their ticket was updated
    try {
      const { data: ticket } = await admin
        .from('support_tickets')
        .select('user_id, subject')
        .eq('id', id)
        .single();
      if (ticket?.user_id && body.admin_reply) {
        await admin.from('notifications').insert({
          user_id: ticket.user_id,
          title: `Support reply on: ${(ticket as any).subject?.slice(0, 60)}`,
          message: body.admin_reply.slice(0, 120),
          type: 'info',
          link: '/dashboard/support',
        } as any);
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data });
  }

  // Non-staff can only add a follow-up message
  if (!body.follow_up) {
    return NextResponse.json({ error: 'You can only add a follow_up message' }, { status: 403 });
  }

  // Verify ownership
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('user_id, status')
    .eq('id', id)
    .single();

  if (!ticket || ticket.user_id !== caller.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('support_tickets')
    .update({
      follow_up: body.follow_up,
      status: ticket.status === 'resolved' ? 'reopened' : ticket.status,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id)
    .select('id, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
