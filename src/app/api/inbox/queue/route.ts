import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, Tables } from '@/types/supabase';
import { computeQueueFlags, shouldCreateAutoEscalation } from '@/lib/progression/queue-automation';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

async function ensureAutomationForQueue(
  admin: ReturnType<typeof adminClient>,
  rows: Array<{
    id: string;
    contact_name: string;
    assigned_staff_id: string | null;
    sla_due_at: string | null;
    is_overdue: boolean;
    open_reports: number;
    needs_escalation: boolean;
  }>,
  callerId: string,
) {
  for (const row of rows) {
    if (row.is_overdue) {
      const taskTitle = 'SLA overdue: WhatsApp follow-up required';
      const { data: existingTask } = await admin
        .from('crm_tasks')
        .select('id')
        .eq('contact_id', row.id)
        .eq('title', taskTitle)
        .in('status', ['open', 'in_progress'])
        .limit(1)
        .maybeSingle();
      if (!existingTask) {
        await admin.from('crm_tasks').insert({
          contact_id: row.id,
          contact_name: row.contact_name || 'Unknown contact',
          title: taskTitle,
          due_at: row.sla_due_at,
          priority: 'high',
          status: 'open',
          owner_id: row.assigned_staff_id,
          created_by: callerId,
        });
      }
    }

    if (shouldCreateAutoEscalation({ needs_escalation: row.needs_escalation, open_reports: row.open_reports })) {
      const { data: existingEsc } = await admin
        .from('communication_escalations')
        .select('id')
        .eq('target_conversation_id', row.id)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();
      if (!existingEsc) {
        await admin.from('communication_escalations').insert({
          target_conversation_id: row.id,
          target_user_id: row.assigned_staff_id,
          reason: `auto_escalation:open_reports_${row.open_reports}`,
          status: 'open',
          metadata: {
            source: 'queue_automation',
            created_at: new Date().toISOString(),
          },
        });
      }
    }
  }
}

export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = adminClient();
  const nowIso = new Date().toISOString();
  const filter = new URL(req.url).searchParams.get('filter') ?? 'all';

  let convQ = admin
    .from('whatsapp_conversations')
    .select('id, phone_number, contact_name, assigned_staff_id, school_id, last_message_at, unread_count');
  if (caller.role !== 'admin' && caller.school_id) {
    convQ = convQ.eq('school_id', caller.school_id);
  }

  const { data: conversations, error } = await convQ.order('last_message_at', { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (conversations ?? []).map((c) => c.id);
  const [{ data: metaRows }, { data: reportRows }] = await Promise.all([
    ids.length > 0
      ? admin.from('communication_conversation_meta').select('conversation_id, priority, sla_due_at, status').in('conversation_id', ids)
      : Promise.resolve({ data: [] as Pick<Tables<'communication_conversation_meta'>, 'conversation_id' | 'priority' | 'sla_due_at' | 'status'>[] }),
    ids.length > 0
      ? admin
          .from('communication_reports')
          .select('target_conversation_id, status')
          .in('target_conversation_id', ids)
          .eq('status', 'open')
      : Promise.resolve({ data: [] as Pick<Tables<'communication_reports'>, 'target_conversation_id' | 'status'>[] }),
  ]);

  const metaById = new Map((metaRows ?? []).map((m) => [m.conversation_id, m]));
  const reportCount = new Map<string, number>();
  for (const r of reportRows ?? []) {
    const id = String(r.target_conversation_id ?? '');
    if (!id) continue;
    reportCount.set(id, (reportCount.get(id) ?? 0) + 1);
  }

  let queue = (conversations ?? []).map((c) => {
    const meta = metaById.get(c.id);
    const openReports = reportCount.get(c.id) ?? 0;
    const flags = computeQueueFlags({
      sla_due_at: meta?.sla_due_at ?? null,
      status: meta?.status ?? 'open',
      assigned_staff_id: c.assigned_staff_id ?? null,
      open_reports: openReports,
      now_iso: nowIso,
    });
    return {
      id: c.id,
      contact_name: c.contact_name || c.phone_number || 'Unknown',
      phone_number: c.phone_number,
      assigned_staff_id: c.assigned_staff_id ?? null,
      last_message_at: c.last_message_at ?? null,
      unread_count: Number(c.unread_count ?? 0),
      priority: meta?.priority ?? 'medium',
      sla_due_at: meta?.sla_due_at ?? null,
      status: meta?.status ?? 'open',
      is_overdue: flags.isOverdue,
      is_unassigned: flags.isUnassigned,
      open_reports: openReports,
      needs_escalation: flags.needsEscalation,
    };
  });

  await ensureAutomationForQueue(admin, queue, caller.id);

  if (filter === 'unassigned') queue = queue.filter((q) => q.is_unassigned);
  if (filter === 'overdue') queue = queue.filter((q) => q.is_overdue);
  if (filter === 'needs_escalation') queue = queue.filter((q) => q.needs_escalation);

  const summary = {
    all: queue.length,
    unassigned: queue.filter((q) => q.is_unassigned).length,
    overdue: queue.filter((q) => q.is_overdue).length,
    needs_escalation: queue.filter((q) => q.needs_escalation).length,
  };

  return NextResponse.json({ data: queue, summary });
}
