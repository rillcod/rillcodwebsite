import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDutyCapacity } from './duty-assignment';
import { resolveApprovedTemplate } from './template-registry';
import { resolveCustomerKey } from './identity';
import { classifyCommunicationSensitivity, requiresRestrictedHumanHandling } from './sensitivity';

type AnyClient = SupabaseClient<any>;

export interface RecordCaseEventInput {
  caseId?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  schoolId?: string | null;
  classOwnerId?: string | null;
  assignedTo?: string | null;
  subject: string;
  body: string;
  category?: string;
  channel: 'whatsapp' | 'email' | 'in_app' | 'feedback' | 'system';
  direction: 'inbound' | 'outbound' | 'internal';
  sourceType?: string | null;
  sourceId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  restrictedToAdmin?: boolean;
  provider?: string | null;
  providerMessageId?: string | null;
  deliveryStatus?: 'recorded' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed';
  automated?: boolean;
  templateKey?: string | null;
  externalThreadId?: string | null;
}

export async function recordCommunicationCaseEvent(admin: AnyClient, input: RecordCaseEventInput) {
  if (input.sourceType && input.sourceId) {
    const { data: existingEvent } = await admin.from('communication_case_events').select('case_id').eq('source_type', input.sourceType).eq('source_id', input.sourceId).maybeSingle();
    if (existingEvent?.case_id) return existingEvent.case_id as string;
  }

  const identity = await resolveCustomerKey(admin, { portalUserId: input.requesterId, email: input.requesterEmail, phone: input.requesterPhone });
  const requesterId = input.requesterId ?? identity.portalUserId;
  let openCase: any = null;
  if (input.caseId) {
    const { data } = await admin.from('communication_cases').select('*').eq('id', input.caseId).maybeSingle();
    openCase = data;
  } else if (requesterId) {
    const { data } = await admin.from('communication_cases').select('*').eq('requester_id', requesterId).eq('category', input.category ?? 'general').in('status', ['open', 'reopened', 'pending_customer', 'in_progress']).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    openCase = data;
  } else if (input.requesterEmail || input.requesterPhone) {
    const query = admin.from('communication_cases').select('*').eq('customer_key', identity.customerKey).eq('category', input.category ?? 'general').in('status', ['open', 'reopened', 'pending_customer', 'in_progress']).order('updated_at', { ascending: false }).limit(1);
    const { data } = await query.maybeSingle();
    openCase = data;
  }
  if (!openCase && input.direction === 'outbound') {
    let fallbackQuery = admin.from('communication_cases').select('*').in('status', ['open', 'pending_customer', 'in_progress']).order('updated_at', { ascending: false }).limit(1);
    if (input.requesterId) {
      fallbackQuery = fallbackQuery.eq('requester_id', input.requesterId);
    } else if (input.requesterEmail) {
      fallbackQuery = fallbackQuery.ilike('requester_email', input.requesterEmail);
    } else if (input.requesterPhone) {
      fallbackQuery = fallbackQuery.eq('requester_phone', input.requesterPhone);
    }
    const { data } = await fallbackQuery.maybeSingle();

    openCase = data;
  }
  const sensitivity = classifyCommunicationSensitivity(input.subject, input.body);
  const restricted = input.restrictedToAdmin === true || requiresRestrictedHumanHandling(sensitivity);
  let assignedTo = openCase?.assigned_to ?? input.assignedTo ?? null;
  if (!openCase && !assignedTo) {
    const capacity = await loadDutyCapacity(admin, { targetSchoolId: input.schoolId, classOwnerId: input.classOwnerId, requiredSkill: restricted ? null : 'customer_care', restrictedToAdmin: restricted });
    assignedTo = capacity.selected?.id ?? null;
  }

  const now = new Date();
  let caseId = openCase?.id as string | undefined;
  let createdNewCase = false;
  if (!caseId) {
    const responseHours = restricted ? 2 : 4;
    const { data, error } = await admin.from('communication_cases').insert({
      requester_id: requesterId ?? null, customer_key: identity.customerKey, requester_name: input.requesterName ?? null, requester_email: input.requesterEmail ?? null, requester_phone: input.requesterPhone ?? null,
      school_id: input.schoolId ?? null, subject: input.subject.slice(0, 240), category: input.category ?? 'general',
      department: restricted ? 'complaints_quality' : 'customer_care', priority: restricted ? 'high' : 'normal', status: 'open', assigned_to: assignedTo,
      first_response_due_at: new Date(now.getTime() + responseHours * 3600000).toISOString(), next_action_due_at: new Date(now.getTime() + responseHours * 3600000).toISOString(), next_action: 'Review and respond to the customer', channels: [input.channel], sensitivity: restricted && sensitivity === 'standard' ? 'complaint' : sensitivity, restricted,
      last_inbound_at: input.direction === 'inbound' ? now.toISOString() : null, last_outbound_at: input.direction === 'outbound' ? now.toISOString() : null,
    }).select('id').single();
    if (error) throw new Error(`Unable to create communication case: ${error.message}`);
    caseId = data.id;
    createdNewCase = true;
  }

  if (!caseId) throw new Error('Communication case id was not created.');
  const { error: eventError } = await admin.from('communication_case_events').insert({
    case_id: caseId, channel: input.channel, direction: input.direction, source_type: input.sourceType ?? null, source_id: input.sourceId ?? null,
    subject: input.subject.slice(0, 240), body: input.body.slice(0, 10000), actor_id: input.actorId ?? null, metadata: input.metadata ?? {},
    provider: input.provider ?? null, provider_message_id: input.providerMessageId ?? null,
    delivery_status: input.deliveryStatus ?? 'recorded', automated: input.automated === true,
    template_key: input.templateKey ?? null, external_thread_id: input.externalThreadId ?? null,
  });
  if (eventError && eventError.code !== '23505') throw new Error(`Unable to record case event: ${eventError.message}`);

  const channels = Array.from(new Set([...(openCase?.channels ?? []), input.channel]));
  const updates: Record<string, unknown> = { channels, updated_at: now.toISOString() };
  if (input.direction === 'inbound') { updates.last_inbound_at = now.toISOString(); updates.status = 'open'; }
  if (input.direction === 'outbound') { updates.last_outbound_at = now.toISOString(); updates.first_responded_at = openCase?.first_responded_at ?? now.toISOString(); updates.status = 'pending_customer'; }
  await admin.from('communication_cases').update(updates).eq('id', caseId);
  if (createdNewCase && restricted) {
    const incidentType = sensitivity === 'standard' ? 'complaint' : sensitivity === 'safeguarding' ? 'child_safety' : sensitivity;
    await admin.from('safeguarding_incidents').upsert({
      case_id: caseId,
      incident_type: incidentType,
      risk_level: sensitivity === 'safeguarding' ? 'critical' : 'high',
      owner_id: assignedTo,
      summary: `${input.subject}: ${input.body}`.slice(0, 2000),
      updated_at: now.toISOString(),
    }, { onConflict: 'case_id' });
  }
  if (createdNewCase && input.direction === 'inbound' && requesterId) {
    const reference = `CASE-${caseId.slice(0, 8)}`;
    const receipt = await resolveApprovedTemplate(admin, 'case_receipt', {
      customer_name: input.requesterName || 'Customer',
      case_reference: reference,
    });
    await admin.from('notifications').insert({
      user_id: requesterId,
      type: 'info',
      title: receipt?.subject || `We received your request ${reference}`,
      message: receipt?.body || `Your request has been recorded as ${reference}. Our team will keep you updated.`,
      link: `/dashboard/cases?id=${caseId}`,
      is_read: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  if (input.direction === 'inbound' && assignedTo && assignedTo !== input.actorId) {
    await admin.from('notifications').insert({
      user_id: assignedTo,
      type: restricted ? 'warning' : 'info',
      title: `${restricted ? 'Priority case' : 'New assigned case'} - CASE-${caseId.slice(0, 8)}`,
      message: `${input.requesterName || 'A customer'}: ${input.subject.slice(0, 160)}`,
      link: `/dashboard/cases?id=${caseId}`,
      is_read: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  }

  return caseId;
}
