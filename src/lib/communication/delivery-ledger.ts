export type CommunicationDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'suppressed';

export function canAdvanceDeliveryStatus(
  current: CommunicationDeliveryStatus,
  next: CommunicationDeliveryStatus,
): boolean {
  if (current === 'read') return false;
  if (current === 'delivered' && next !== 'read') return false;
  if (current === 'sent' && next === 'queued') return false;
  return true;
}

export type DeliveryEventInput = {
  deliveryId: string;
  eventKey: string;
  status: CommunicationDeliveryStatus;
  channel: 'email' | 'whatsapp' | 'in_app' | 'sms' | 'push';
  provider?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  occurredAt?: string;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordCommunicationDeliveryEvent(db: any, input: DeliveryEventInput) {
  const { data, error } = await db.rpc('record_communication_delivery_event', {
    p_delivery_id: input.deliveryId,
    p_event_key: input.eventKey,
    p_status: input.status,
    p_channel: input.channel,
    p_provider: input.provider ?? null,
    p_provider_message_id: input.providerMessageId ?? null,
    p_provider_status: input.providerStatus ?? null,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    p_error: input.error?.slice(0, 4000) ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Could not record delivery event: ${error.message}`);
  return data?.[0] ?? null;
}

export async function recordUnmatchedDeliveryEvent(
  db: any,
  input: Omit<DeliveryEventInput, 'deliveryId'>,
) {
  const { error } = await db.from('communication_delivery_events').upsert({
    delivery_id: null,
    event_key: input.eventKey,
    channel: input.channel,
    provider: input.provider ?? null,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
    provider_status: input.providerStatus ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    error: input.error?.slice(0, 4000) ?? null,
    metadata: input.metadata ?? {},
  }, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw new Error(`Could not preserve unmatched provider receipt: ${error.message}`);
}

