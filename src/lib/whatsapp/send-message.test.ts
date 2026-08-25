import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendWhatsAppDetailed } = vi.hoisted(() => ({
  sendWhatsAppDetailed: vi.fn(),
}));

vi.mock('./send', () => ({ sendWhatsAppDetailed }));

import { sendWhatsAppMessage } from './send-message';

describe('sendWhatsAppMessage wrapper', () => {
  beforeEach(() => {
    sendWhatsAppDetailed.mockReset();
    sendWhatsAppDetailed.mockResolvedValue({
      success: true,
      messageId: 'wamid.wrap',
      retryable: false,
      deliveryLogId: 'delivery-1',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends through the canonical transport instead of a second Meta client', async () => {
    const result = await sendWhatsAppMessage({
      to: '2348116600091',
      type: 'text',
      body: 'Hello',
    });

    expect(sendWhatsAppDetailed).toHaveBeenCalledWith(expect.objectContaining({
      to: '2348116600091',
      message: 'Hello',
      persistToInbox: false,
      automated: true,
    }));
    expect(result).toEqual({
      success: true,
      error: undefined,
      messageId: 'wamid.wrap',
      deliveryLogId: 'delivery-1',
    });
  });
});
