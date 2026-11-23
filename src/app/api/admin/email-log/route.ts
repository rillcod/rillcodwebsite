import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildRillcodTransactionalEmailHtml, escapeHtml, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';
import type { Database } from '@/types/supabase';

/**
 * Provider-neutral communication delivery log and recovery evidence.
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

  const deliveryIds = (data ?? []).map((row) => row.id);
  const [lifecycleResult, eventResult, unmatchedResult] = await Promise.all([
    deliveryIds.length
      ? (db as any).from('communication_delivery_log')
          .select('id,recipient_user_id,source_type,source_id,outbox_id,attempt_count,queued_at,provider_accepted_at,last_event_at')
          .in('id', deliveryIds)
      : Promise.resolve({ data: [], error: null }),
    deliveryIds.length
      ? (db as any).from('communication_delivery_events')
          .select('delivery_id,status,provider_status,occurred_at')
          .in('delivery_id', deliveryIds)
          .order('occurred_at', { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    (db as any).from('communication_delivery_events')
      .select('id', { count: 'exact', head: true })
      .is('delivery_id', null),
  ]);
  const lifecycleById = new Map((lifecycleResult.data ?? []).map((row: any) => [row.id, row]));
  const eventSummary = new Map<string, { count: number; lastStatus: string | null; lastAt: string | null }>();
  for (const event of eventResult.data ?? []) {
    const current = eventSummary.get(event.delivery_id) ?? { count: 0, lastStatus: null, lastAt: null };
    current.count += 1;
    if (!current.lastAt) {
      current.lastStatus = event.provider_status || event.status;
      current.lastAt = event.occurred_at;
    }
    eventSummary.set(event.delivery_id, current);
  }
  let operatorDataReady = !lifecycleResult.error && !eventResult.error && !unmatchedResult.error;
  if (!operatorDataReady) {
    console.error('[communication-delivery] lifecycle enrichment failed', {
      lifecycle: lifecycleResult.error?.message,
      events: eventResult.error?.message,
      unmatched: unmatchedResult.error?.message,
    });
  }

  // The delivery log records an address, not a person, so school and role are
  // resolved by matching the recipient back to portal_users. A parent's own
  // school_name is often blank, so fall back to the school of a child they are
  // linked to — that is the school the message actually concerns.
  const addresses = Array.from(
    new Set((data ?? []).map((r) => String(r.recipient ?? '').toLowerCase()).filter(Boolean)),
  );

  const people = new Map<string, { name: string | null; role: string | null; school: string | null }>();
  const peopleById = new Map<string, { name: string | null; role: string | null; school: string | null }>();
  if (addresses.length) {
    const { data: users, error: usersError } = await db
      .from('portal_users')
      .select('id, email, full_name, role, school_name')
      .in('email', addresses);
    if (usersError) {
      operatorDataReady = false;
      console.error('[communication-delivery] recipient enrichment failed', usersError.message);
    }

    for (const u of users ?? []) {
      if (!u.email) continue;
      people.set(String(u.email).toLowerCase(), {
        name: u.full_name, role: u.role, school: u.school_name || null,
      });
      peopleById.set(u.id, { name: u.full_name, role: u.role, school: u.school_name || null });
    }

    // Fill blank schools for parents via their linked child.
    const parentsMissingSchool = (users ?? []).filter((u) => u.role === 'parent' && !u.school_name);
    if (parentsMissingSchool.length) {
      const { data: links, error: linksError } = await db
        .from('parent_student_links')
        .select('parent_id, students!student_id(school_name)')
        .in('parent_id', parentsMissingSchool.map((p) => p.id));
      if (linksError) {
        operatorDataReady = false;
        console.error('[communication-delivery] parent school enrichment failed', linksError.message);
      }

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
  const recipientIds = Array.from(new Set(
    Array.from(lifecycleById.values()).map((row: any) => row.recipient_user_id).filter(Boolean),
  ));
  if (recipientIds.length) {
    const { data: identifiedUsers, error: identifiedUsersError } = await db.from('portal_users')
      .select('id,full_name,role,school_name').in('id', recipientIds);
    if (identifiedUsersError) {
      operatorDataReady = false;
      console.error('[communication-delivery] linked recipient enrichment failed', identifiedUsersError.message);
    }
    for (const person of identifiedUsers ?? []) {
      peopleById.set(person.id, {
        name: person.full_name,
        role: person.role,
        school: person.school_name || null,
      });
    }
  }

  const rows = (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const lifecycle = lifecycleById.get(r.id) as any;
    const events = eventSummary.get(r.id);
    const who = (lifecycle?.recipient_user_id ? peopleById.get(lifecycle.recipient_user_id) : null)
      ?? people.get(String(r.recipient ?? '').toLowerCase());
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
      // provider_event retains the provider's raw wording; canonical `status`
      // is the monotonic lifecycle authority used for operator decisions.
      provider_event: typeof meta.provider_event === 'string' ? meta.provider_event : null,
      provider_reason: typeof meta.provider_reason === 'string' ? meta.provider_reason : null,
      sent_at: r.sent_at,
      delivered_at: r.delivered_at,
      read_at: r.read_at,
      failed_at: r.failed_at,
      source_type: lifecycle?.source_type ?? (typeof meta.source_type === 'string' ? meta.source_type : null),
      source_id: lifecycle?.source_id ?? (typeof meta.source_id === 'string' ? meta.source_id : null),
      attempt_count: lifecycle?.attempt_count ?? null,
      event_count: events?.count ?? null,
      last_event_at: lifecycle?.last_event_at ?? events?.lastAt ?? null,
      created_at: r.created_at,
    };
  });

  // Counted over the returned window so the tiles always agree with the table.
  // `internal` is split out because 914 of 918 students hold an @rillcod.com
  // portal identifier rather than a mailbox — mail to those can never confirm
  // delivery, and counting it as "unconfirmed" makes deliverability look far
  // worse than it is. support@rillcod.com is the one real inbox on that domain.
  const unconfirmed = rows.filter(
    (r) => String(r.status).toLowerCase() === 'sent',
  );
  const summary = {
    total: rows.length,
    delivered: rows.filter((r) => ['delivered', 'read'].includes(String(r.status).toLowerCase())).length,
    failed: rows.filter((r) => String(r.status).toLowerCase() === 'failed').length,
    // Both opened and clicked map to status 'read' and set read_at, so the
    // status column cannot tell them apart. metadata.provider_event keeps the
    // raw event, which is the only way to separate a click from an open.
    engaged: rows.filter((r) => String(r.status).toLowerCase() === 'read').length,
    opened: rows.filter((r) => /^open/.test(String(r.provider_event ?? ''))).length,
    clicked: rows.filter((r) => /^click/.test(String(r.provider_event ?? ''))).length,
    stuck_sent: unconfirmed.filter((r) => !r.internal).length,
    internal_sent: unconfirmed.filter((r) => r.internal).length,
    triggered: rows.filter((r) => r.automated).length,
    manual: rows.filter((r) => !r.automated).length,
    queued: rows.filter((r) => r.status === 'queued').length,
    suppressed: rows.filter((r) => r.status === 'suppressed').length,
    unmatched_receipts: unmatchedResult.count ?? 0,
  };

  return NextResponse.json({ rows, summary, ledger_ready: operatorDataReady }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/admin/email-log
 * { action: 'retry_delivery', delivery_id: string, override_recipient?: string }
 * Re-dispatches a failed/bounced/stuck email cleanly through the canonical
 * notificationsService, optionally using a corrected recipient address.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
      .from('portal_users')
      .select('id, role, full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'retry_delivery') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
    const deliveryId = String(body?.delivery_id || '').trim();
    if (!deliveryId) return NextResponse.json({ error: 'delivery_id is required' }, { status: 400 });

    const db = adminClient();
    const { data: row, error: fetchErr } = await db
      .from('communication_delivery_log')
      .select('id, channel, recipient, template_key, metadata')
      .eq('id', deliveryId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'Delivery record not found' }, { status: 404 });

    const targetEmail = String(body?.override_recipient || row.recipient || '').trim();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return NextResponse.json({ error: 'A valid recipient email address is required to retry.' }, { status: 400 });
    }
    if (isInAppEmail(targetEmail)) {
      return NextResponse.json(
        { error: 'Internal @rillcod.com portal IDs cannot receive external email. Enter a real mailbox address.' },
        { status: 422 },
      );
    }

    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, any>;
    const subject = String(meta.subject || 'Rillcod Technologies — Communication Follow-Up').trim();
    const rawBody = String(meta.body || meta.message || '').trim();
    const html =
      typeof meta.html === 'string' && meta.html.trim().length > 20
        ? meta.html
        : buildRillcodTransactionalEmailHtml({
            eyebrow: 'Rillcod Technologies · Delivery Retry',
            title: subject,
            bodyHtml: rawBody
              ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937;">${escapeHtml(rawBody).replace(/\n/g, '<br/>')}</p>`
              : `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937;">We are re-sending our recent message regarding <strong>${escapeHtml(subject)}</strong> from Rillcod Technologies. Please reply if you need any assistance.</p>`,
            footerNote: `Retried by ${caller.full_name || 'Rillcod Admin'} · www.rillcod.com`,
          });

    const sent = await notificationsService.sendEmail(caller.id, {
      to: targetEmail,
      subject,
      html,
    });

    if (!sent) {
      return NextResponse.json(
        { error: `Retry could not be delivered to ${targetEmail} (suppressed or undeliverable).` },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      recipient: targetEmail,
      message: `Retried delivery cleanly to ${targetEmail}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: 500 });
  }
}
