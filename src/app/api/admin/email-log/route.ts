import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

/**
 * Email & messaging delivery log — the Resend dashboard, in-app.
 *
 * Everything shown here already exists in communication_delivery_log; the
 * subject line lives in metadata.subject (populated on 120 of 121 rows), and
 * provider_event / webhook_provider are written by the email-status webhook.
 *
 * Admin only. Reads with the service-role client, matching the rest of the API
 * layer: authenticate the caller first, then act with elevated privileges.
 */

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfiguration: Supabase env vars are not set.');
  return createClient<Database>(url, key);
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 200, MAX_ROWS);

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Misconfigured' }, { status: 500 });
  }

  const { data, error } = await db
    .from('communication_delivery_log')
    .select('id, channel, recipient, provider, status, automated, template_key, campaign_key, error, metadata, sent_at, delivered_at, read_at, failed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      recipient: r.recipient,
      subject: typeof meta.subject === 'string' ? meta.subject : null,
      channel: r.channel,
      provider: r.provider,
      status: r.status,
      automated: r.automated,
      template_key: r.template_key,
      campaign_key: r.campaign_key,
      error: r.error,
      // provider_event is written by the email-status webhook; it is the most
      // truthful state we have when it disagrees with `status`.
      provider_event: typeof meta.provider_event === 'string' ? meta.provider_event : null,
      provider_reason: typeof meta.provider_reason === 'string' ? meta.provider_reason : null,
      sent_at: r.sent_at,
      delivered_at: r.delivered_at,
      read_at: r.read_at,
      failed_at: r.failed_at,
      created_at: r.created_at,
    };
  });

  // Counted over the returned window so the tiles always agree with the table.
  const summary = {
    total: rows.length,
    delivered: rows.filter((r) => r.delivered_at).length,
    failed: rows.filter((r) => r.failed_at || r.error).length,
    opened: rows.filter((r) => r.read_at).length,
    // sent with no delivery confirmation and no failure — in limbo
    stuck_sent: rows.filter((r) => !r.delivered_at && !r.failed_at && String(r.status).toLowerCase() === 'sent').length,
    triggered: rows.filter((r) => r.automated).length,
    manual: rows.filter((r) => !r.automated).length,
  };

  return NextResponse.json({ rows, summary }, { headers: { 'Cache-Control': 'no-store' } });
}
