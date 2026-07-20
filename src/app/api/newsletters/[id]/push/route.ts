import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { authorSchoolScope, resolveRecipients, deliverNewsletter, type NewsletterTarget } from '@/lib/newsletters/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TARGETS: NewsletterTarget[] = ['all', 'students', 'teachers', 'schools'];

// POST /api/newsletters/[id]/push
// body: { target, sendEmail?, scheduleFor? }
//   scheduleFor (future ISO) → queue it (cron publishes later); else deliver now.
// Recipients are scoped to the author's school(s); admin broadcasts globally.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await context.params;
    const { data: nl } = await admin.from('newsletters').select('id, author_id, purpose').eq('id', id).maybeSingle();
    if (!nl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const purpose = ((nl as any).purpose || 'service') as 'marketing' | 'service' | 'retention';
    if (purpose === 'marketing' && caller.role !== 'admin') return NextResponse.json({ error: 'Marketing campaigns require administrator approval and sending.' }, { status: 403 });
    if (caller.role !== 'admin' && (nl as any).author_id !== caller.id) {
      return NextResponse.json({ error: 'You can only send your own newsletters' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const target: NewsletterTarget = TARGETS.includes(body.target) ? body.target : 'all';
    const sendEmail = body.sendEmail === true;
    const scheduleFor = typeof body.scheduleFor === 'string' ? body.scheduleFor : null;

    // ── Schedule for later ──
    if (scheduleFor) {
      const when = new Date(scheduleFor);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Schedule time must be in the future' }, { status: 400 });
      }
      await admin.from('newsletters').update({
        status: 'scheduled',
        scheduled_for: when.toISOString(),
        scheduled_target: target,
        scheduled_send_email: sendEmail,
      }).eq('id', id);
      return NextResponse.json({ scheduled: true, scheduledFor: when.toISOString(), target });
    }

    // ── Deliver now ──
    const schoolScope = await authorSchoolScope(admin, caller);
    const userIds = await resolveRecipients(admin, { target, schoolScope, purpose });
    if (userIds.length === 0) return NextResponse.json({ error: 'No recipients match this audience/scope' }, { status: 400 });
    const result = await deliverNewsletter(admin, { newsletterId: id, userIds, sendEmail, purpose });
    return NextResponse.json({ pushed: true, target, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
