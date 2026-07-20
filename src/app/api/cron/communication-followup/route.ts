import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient() as any;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { data: overdue, error } = await admin
    .from('communication_conversation_meta')
    .select('conversation_id, priority, sla_due_at, reminder_count, last_reminder_at, whatsapp_conversations!inner(assigned_staff_id, contact_name, phone_number)')
    .in('status', ['open', 'pending'])
    .not('sla_due_at', 'is', null)
    .lte('sla_due_at', now.toISOString())
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${oneHourAgo}`)
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load overdue communication work.' }, { status: 500 });

  const { data: admins } = await admin.from('portal_users').select('id').eq('role', 'admin').eq('is_active', true);
  let reminded = 0;
  let escalated = 0;
  const failures: string[] = [];

  for (const row of overdue ?? []) {
    const conversation = Array.isArray(row.whatsapp_conversations) ? row.whatsapp_conversations[0] : row.whatsapp_conversations;
    const assignedId = conversation?.assigned_staff_id ?? null;
    const shouldEscalate = Number(row.reminder_count || 0) >= 2 || !assignedId;
    const recipientIds = new Set<string>();
    if (assignedId) recipientIds.add(assignedId);
    if (shouldEscalate) for (const adminRow of admins ?? []) recipientIds.add(adminRow.id);
    if (!recipientIds.size) { failures.push(row.conversation_id); continue; }

    const reference = `WA-${String(row.conversation_id).slice(0, 8)}`;
    const { error: notificationError } = await admin.from('notifications').insert([...recipientIds].map((userId) => ({
      user_id: userId,
      type: shouldEscalate ? 'warning' : 'info',
      title: shouldEscalate ? `Overdue communication escalated - ${reference}` : `Communication follow-up due - ${reference}`,
      message: `${conversation?.contact_name || conversation?.phone_number || 'Customer'} is waiting for a response.`,
      link: `/dashboard/inbox?conversation=${row.conversation_id}`,
      is_read: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })));
    if (notificationError) { failures.push(row.conversation_id); continue; }

    await admin.from('communication_conversation_meta').update({
      reminder_count: Number(row.reminder_count || 0) + 1,
      last_reminder_at: now.toISOString(),
      escalated_at: shouldEscalate ? now.toISOString() : null,
      updated_at: now.toISOString(),
    }).eq('conversation_id', row.conversation_id);
    reminded += 1;
    if (shouldEscalate) escalated += 1;
  }

  return NextResponse.json({ success: failures.length === 0, checked: overdue?.length ?? 0, reminded, escalated, failures });
}
