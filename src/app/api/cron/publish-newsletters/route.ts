import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { authorSchoolScope, resolveRecipients, deliverNewsletter, type NewsletterTarget } from '@/lib/newsletters/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET|POST /api/cron/publish-newsletters
 * Publishes newsletters whose scheduled_for has passed, delivering to the stored target with
 * the original author's school scope. Idempotent (upsert on the delivery unique index).
 * Schedule every ~15 min on the external scheduler with the cron secret header.
 */
async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = adminClient();
    const { data: due } = await admin.from('newsletters')
      .select('id, author_id, scheduled_target, scheduled_send_email')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    const processed: Array<{ id: string; delivered: number; emailed: number }> = [];
    for (const nl of due ?? []) {
      const { data: author } = await admin.from('portal_users')
        .select('id, role, school_id').eq('id', (nl as any).author_id).maybeSingle();
      const scope = author ? await authorSchoolScope(admin, author as any) : null;
      const target = ((nl as any).scheduled_target || 'all') as NewsletterTarget;
      const userIds = await resolveRecipients(admin, { target, schoolScope: scope });
      if (userIds.length === 0) {
        // Nothing to deliver — publish anyway so it doesn't loop forever.
        await admin.from('newsletters').update({ status: 'published', published_at: new Date().toISOString(), scheduled_for: null }).eq('id', (nl as any).id);
        continue;
      }
      const r = await deliverNewsletter(admin, { newsletterId: (nl as any).id, userIds, sendEmail: (nl as any).scheduled_send_email === true });
      processed.push({ id: (nl as any).id, delivered: r.delivered, emailed: r.emailed });
    }
    return NextResponse.json({ success: true, count: processed.length, processed });
  } catch (err: any) {
    console.error('[cron/publish-newsletters] error:', err);
    return NextResponse.json({ error: err?.message || 'failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
