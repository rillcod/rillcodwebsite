import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/operations/dead-letter', () => ({
  recordDeadLetter: vi.fn().mockResolvedValue('dead-letter-1'),
}));

import { sendWhatsAppDetailed } from './send';

function mockAdminClient(inserted: Array<{ table: string; row: any }>) {
  createAdminClientMock.mockReturnValue({
    from: vi.fn((table: string) => {
      const query: any = {
        insert: vi.fn((row: any) => {
          inserted.push({ table, row });
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: `${table}-1` }, error: null })),
            })),
          };
        }),
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(() => query),
      };
      return query;
    }),
  });
}

describe('sendWhatsAppDetailed persistence ownership', () => {
  const inserted: Array<{ table: string; row: any }> = [];

  beforeEach(() => {
    inserted.length = 0;
    createAdminClientMock.mockReset();
    mockAdminClient(inserted);
    process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/test/messages';
    process.env.WHATSAPP_API_TOKEN = 'test-token';
    process.env.WHATSAPP_CLOUD_API_APPROVED = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_CLOUD_API_APPROVED;
  });

  it('does not create a hidden second inbox record when the caller owns persistence', async () => {
    const result = await sendWhatsAppDetailed({
      to: '2348116600091',
      message: 'Test response',
      persistToInbox: false,
    });

    await Promise.resolve();
    expect(result).toMatchObject({ success: true, messageId: 'wamid.test', deliveryLogId: 'communication_delivery_log-1' });
    expect(inserted.some((row) => row.table === 'whatsapp_messages')).toBe(false);
    expect(inserted.some((row) => row.table === 'whatsapp_conversations')).toBe(false);
  });

  it('still records a successful send on the central delivery ledger', async () => {
    const result = await sendWhatsAppDetailed({
      to: '2348116600091',
      message: 'Ledger success',
      persistToInbox: false,
      templateName: null,
    });

    expect(result.success).toBe(true);
    const delivery = inserted.find((row) => row.table === 'communication_delivery_log');
    expect(delivery?.row).toMatchObject({
      channel: 'whatsapp',
      status: 'sent',
      provider: 'meta',
      provider_message_id: 'wamid.test',
      recipient: '2348116600091',
    });
  });

  it('records failed WhatsApp attempts instead of dropping them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: { message: 'Not a WhatsApp user', code: 131026 } }),
    }));

    const result = await sendWhatsAppDetailed({
      to: '2348116600091',
      message: 'Ledger failure',
      persistToInbox: false,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_whatsapp_user');
    const delivery = inserted.find((row) => row.table === 'communication_delivery_log');
    expect(delivery?.row).toMatchObject({
      channel: 'whatsapp',
      status: 'failed',
      error: 'Not a WhatsApp user',
    });
  });
});
