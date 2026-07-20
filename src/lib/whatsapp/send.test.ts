import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

import { sendWhatsAppDetailed } from './send';

describe('sendWhatsAppDetailed persistence ownership', () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
    process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/test/messages';
    process.env.WHATSAPP_API_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;
  });

  it('does not create a hidden second inbox record when the caller owns persistence', async () => {
    const result = await sendWhatsAppDetailed({
      to: '2348116600091',
      message: 'Test response',
      persistToInbox: false,
    });

    await Promise.resolve();
    expect(result).toMatchObject({ success: true, messageId: 'wamid.test' });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
