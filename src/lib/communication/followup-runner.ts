import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveApprovedTemplate } from './template-registry';

export interface CommunicationFollowupResult {
  success: boolean;
  checked: number;
  reminded: number;
  escalated: number;
  failures: string[];
}

export async function runCommunicationFollowup(admin: SupabaseClient<any>): Promise<CommunicationFollowupResult> {
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
  if (error) throw new Error(`Unable to load overdue communication work: ${error.message}`);

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

  const { data: caseRows, error: caseError } = await admin
    .from('communication_cases')
    .select('id, subject, requester_name, assigned_to, first_response_due_at, next_follow_up_at')
    .in('status', ['open', 'in_progress'])
    .not('first_response_due_at', 'is', null)
    .lte('first_response_due_at', now.toISOString())
    .or(`next_follow_up_at.is.null,next_follow_up_at.lte.${now.toISOString()}`)
    .limit(100);
  if (caseError) throw new Error(`Unable to load overdue unified cases: ${caseError?.message || 'unknown error'}`);

  for (const caseRow of caseRows ?? []) {
    const dueMs = new Date(caseRow.first_response_due_at).getTime();
    const shouldEscalate = !caseRow.assigned_to || now.getTime() - dueMs >= 2 * 60 * 60 * 1000;
    const recipientIds = new Set<string>();
    const reference = `CASE-${String(caseRow.id).slice(0, 8)}`;
    const reminder = await resolveApprovedTemplate(admin, 'staff_case_followup', {
      case_reference: reference,
      subject: caseRow.subject,
    });
    if (caseRow.assigned_to) recipientIds.add(caseRow.assigned_to);
    if (shouldEscalate) for (const adminRow of admins ?? []) recipientIds.add(adminRow.id);
    if (!recipientIds.size) { failures.push(caseRow.id); continue; }
    const { error: notificationError } = await admin.from('notifications').insert([...recipientIds].map((userId) => ({
      user_id: userId, type: shouldEscalate ? 'warning' : 'info',
      title: shouldEscalate ? `Overdue: ${reminder?.subject || `case ${reference}`}` : reminder?.subject || `Case response due - ${reference}`,
      message: reminder?.body || `${caseRow.requester_name || 'Customer'} is waiting: ${caseRow.subject}`,
      link: `/dashboard/cases?id=${caseRow.id}`, is_read: false, created_at: now.toISOString(), updated_at: now.toISOString(),
    })));
    if (notificationError) { failures.push(caseRow.id); continue; }
    await admin.from('communication_cases').update({ next_follow_up_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), updated_at: now.toISOString() }).eq('id', caseRow.id);
    reminded += 1;
    if (shouldEscalate) escalated += 1;
  }

  return { success: failures.length === 0, checked: (overdue?.length ?? 0) + (caseRows?.length ?? 0), reminded, escalated, failures };
}
