import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getSummerBalanceDue, getSummerTotalTuition } from '@/lib/summer-school/pricing';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function requireAdmin() {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await admin().from('portal_users').select('role').eq('id', user.id).single();
  return p && p.role === 'admin' ? user : null;
}

const remindCount = (notes: string | null) => {
  const m = (notes || '').match(/\[BalanceRemindCount:\s*(\d+)\]/i);
  return m ? parseInt(m[1], 10) || 0 : 0;
};
const lastReminded = (notes: string | null) => {
  const m = (notes || '').match(/\[BalanceReminded:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
};
const isPaused = (notes: string | null) => /\[BalanceRemindPaused\]/i.test(notes || '');

// GET — settings + live list of parents in the reminder pipeline (with balances).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const db = admin();

  const { data: settings } = await db.from('balance_reminder_settings').select('*').eq('id', 1).maybeSingle();
  const { data: prospects } = await db
    .from('prospective_students')
    .select('id, full_name, parent_name, parent_email, email, parent_phone, notes, preferred_schedule, updated_at')
    .eq('status', 'partially_paid').eq('is_active', true)
    .order('updated_at', { ascending: false }).limit(200);

  const list = [];
  for (const p of (prospects ?? []) as any[]) {
    const email = String(p.parent_email || p.email || '').trim().toLowerCase();
    const { data: txs } = await db
      .from('payment_transactions').select('amount')
      .contains('payment_gateway_response', { prospect_id: p.id })
      .in('payment_status', ['completed', 'success', 'paid']);
    const amountPaid = ((txs ?? []) as any[]).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const [{ count: sc }, { count: pc }] = await Promise.all([
      db.from('students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
      db.from('prospective_students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
    ]);
    const hasSibling = ((sc || 0) + (pc || 0)) > 1;
    const mode = p.preferred_schedule || 'Online';
    list.push({
      id: p.id,
      name: p.full_name,
      parentName: p.parent_name,
      email,
      phone: p.parent_phone,
      amountPaid,
      totalTuition: getSummerTotalTuition(mode, hasSibling),
      balanceDue: getSummerBalanceDue(mode, amountPaid, hasSibling),
      remindersSent: remindCount(p.notes),
      lastReminded: lastReminded(p.notes),
      paused: isPaused(p.notes),
    });
  }

  return NextResponse.json({ settings, list });
}

// PATCH — update the regulator settings.
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const upd: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['enabled', 'every_days', 'max_reminders', 'channel_email', 'channel_whatsapp']) {
    if (body[k] !== undefined) upd[k] = body[k];
  }
  if ('every_days' in upd) upd.every_days = Math.min(60, Math.max(1, Number(upd.every_days) || 5));
  if ('max_reminders' in upd) upd.max_reminders = Math.min(20, Math.max(1, Number(upd.max_reminders) || 4));
  const { data, error } = await admin().from('balance_reminder_settings').update(upd).eq('id', 1).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

// POST — per-parent actions + run-now.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const { action, prospectId } = await req.json().catch(() => ({}));
  const db = admin();

  if (action === 'run_now') {
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
    const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '';
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured on the server.' }, { status: 500 });
    const r = await fetch(`${base}/api/cron/payment-reminders`, { method: 'POST', headers: { 'x-cron-secret': secret } });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: r.ok, result: j });
  }

  if (!prospectId) return NextResponse.json({ error: 'prospectId required' }, { status: 400 });
  const now = new Date().toISOString();

  if (action === 'mark_paid') {
    await db.from('prospective_students').update({ status: 'paid', updated_at: now }).eq('id', prospectId);
    return NextResponse.json({ ok: true });
  }

  const { data: p } = await db.from('prospective_students').select('notes').eq('id', prospectId).maybeSingle();
  let notes = (p as any)?.notes || '';
  if (action === 'pause') {
    if (!isPaused(notes)) notes = `${notes} [BalanceRemindPaused]`.trim();
  } else if (action === 'resume') {
    notes = notes.replace(/\s*\[BalanceRemindPaused\]/gi, '').trim();
  } else if (action === 'reset') {
    notes = notes.replace(/\s*\[BalanceReminded:[^\]]*\]/gi, '').replace(/\s*\[BalanceRemindCount:[^\]]*\]/gi, '').trim();
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  await db.from('prospective_students').update({ notes, updated_at: now }).eq('id', prospectId);
  return NextResponse.json({ ok: true });
}
