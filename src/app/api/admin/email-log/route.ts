import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isInAppEmail } from '@/lib/email/rillcod-transactional-email';
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

  // The delivery log records an address, not a person, so school and role are
  // resolved by matching the recipient back to portal_users. A parent's own
  // school_name is often blank, so fall back to the school of a child they are
  // linked to — that is the school the message actually concerns.
  const addresses = Array.from(
    new Set((data ?? []).map((r) => String(r.recipient ?? '').toLowerCase()).filter(Boolean)),
  );

  const people = new Map<string, { name: string | null; role: string | null; school: string | null }>();
  if (addresses.length) {
    const { data: users } = await db
      .from('portal_users')
      .select('id, email, full_name, role, school_name')
      .in('email', addresses);

    for (const u of users ?? []) {
      if (!u.email) continue;
      people.set(String(u.email).toLowerCase(), {
        name: u.full_name, role: u.role, school: u.school_name || null,
      });
    }

    // Fill blank schools for parents via their linked child.
    const parentsMissingSchool = (users ?? []).filter((u) => u.role === 'parent' && !u.school_name);
    if (parentsMissingSchool.length) {
      const { data: links } = await db
        .from('parent_student_links')
        .select('parent_id, students!student_id(school_name)')
        .in('parent_id', parentsMissingSchool.map((p) => p.id));

      const byParent = new Map<string, string>();
      for (const l of (links ?? []) as any[]) {
        const s = l.students?.school_name;
        if (l.parent_id && s && !byParent.has(l.parent_id)) byParent.set(l.parent_id, s);
      }
      for (const p of parentsMissingSchool) {
        const s = byParent.get(p.id);
        const entry = p.email ? people.get(String(p.email).toLowerCase()) : null;
        if (s && entry) entry.school = s;
      }
    }
  }

  const rows = (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const who = people.get(String(r.recipient ?? '').toLowerCase());
    return {
      id: r.id,
      recipient: r.recipient,
      recipient_name: who?.name ?? (typeof meta.parent_name === 'string' ? meta.parent_name : null),
      recipient_role: who?.role ?? null,
      school: who?.school ?? null,
      // A portal identifier rather than a real mailbox.
      internal: isInAppEmail(String(r.recipient ?? '')),
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
  // `internal` is split out because 914 of 918 students hold an @rillcod.com
  // portal identifier rather than a mailbox — mail to those can never confirm
  // delivery, and counting it as "unconfirmed" makes deliverability look far
  // worse than it is. support@rillcod.com is the one real inbox on that domain.
  const unconfirmed = rows.filter(
    (r) => !r.delivered_at && !r.failed_at && String(r.status).toLowerCase() === 'sent',
  );
  const summary = {
    total: rows.length,
    delivered: rows.filter((r) => r.delivered_at).length,
    failed: rows.filter((r) => r.failed_at || r.error).length,
    // Both opened and clicked map to status 'read' and set read_at, so the
    // status column cannot tell them apart. metadata.provider_event keeps the
    // raw event, which is the only way to separate a click from an open.
    engaged: rows.filter((r) => r.read_at).length,
    opened: rows.filter((r) => /^open/.test(String(r.provider_event ?? ''))).length,
    clicked: rows.filter((r) => /^click/.test(String(r.provider_event ?? ''))).length,
    stuck_sent: unconfirmed.filter((r) => !r.internal).length,
    internal_sent: unconfirmed.filter((r) => r.internal).length,
    triggered: rows.filter((r) => r.automated).length,
    manual: rows.filter((r) => !r.automated).length,
  };

  return NextResponse.json({ rows, summary }, { headers: { 'Cache-Control': 'no-store' } });
}
