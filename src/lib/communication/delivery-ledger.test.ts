import { describe, expect, it, vi } from 'vitest';
import {
  canAdvanceDeliveryStatus,
  recordCommunicationDeliveryEvent,
  recordUnmatchedDeliveryEvent,
} from './delivery-ledger';

describe('communication delivery lifecycle', () => {
  it('never regresses provider-confirmed delivery or reading', () => {
    expect(canAdvanceDeliveryStatus('read', 'failed')).toBe(false);
    expect(canAdvanceDeliveryStatus('delivered', 'sent')).toBe(false);
    expect(canAdvanceDeliveryStatus('delivered', 'failed')).toBe(false);
    expect(canAdvanceDeliveryStatus('sent', 'queued')).toBe(false);
  });

  it('allows a retry to recover an earlier transport failure', () => {
    expect(canAdvanceDeliveryStatus('failed', 'queued')).toBe(true);
    expect(canAdvanceDeliveryStatus('failed', 'sent')).toBe(true);
    expect(canAdvanceDeliveryStatus('failed', 'delivered')).toBe(true);
    expect(canAdvanceDeliveryStatus('delivered', 'read')).toBe(true);
  });

  it('records matched provider receipts through the atomic database boundary', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ delivery_id: 'delivery-1', current_status: 'delivered', event_inserted: true }],
      error: null,
    });
    await recordCommunicationDeliveryEvent({ rpc }, {
      deliveryId: 'delivery-1',
      eventKey: 'resend:message-1:delivered',
      status: 'delivered',
      channel: 'email',
      provider: 'resend',
      providerMessageId: 'message-1',
    });
    expect(rpc).toHaveBeenCalledWith('record_communication_delivery_event', expect.objectContaining({
      p_delivery_id: 'delivery-1',
      p_event_key: 'resend:message-1:delivered',
      p_status: 'delivered',
    }));
  });

  it('preserves early provider receipts idempotently for reconciliation', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    await recordUnmatchedDeliveryEvent({ from }, {
      eventKey: 'meta:message-2:read',
      status: 'read',
      channel: 'whatsapp',
      provider: 'meta',
      providerMessageId: 'message-2',
    });
    expect(from).toHaveBeenCalledWith('communication_delivery_events');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      delivery_id: null,
      event_key: 'meta:message-2:read',
    }), { onConflict: 'event_key', ignoreDuplicates: true });
  });
});
