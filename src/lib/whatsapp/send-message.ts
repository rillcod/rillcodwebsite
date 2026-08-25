import { sendWhatsAppDetailed, type WhatsAppSendResult } from './send';

export interface WhatsAppMessagePayload {
  to: string;
  type: 'text' | 'template';
  body?: string;
  templateName?: string;
  templateVariables?: string[];
}

/**
 * Compatibility wrapper. Every auto-respond / opt-out send goes through the
 * canonical WhatsApp transport so delivery and failure land in one ledger.
 */
export async function sendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<{
  success: boolean;
  error?: string;
  messageId?: string;
  deliveryLogId?: string | null;
}> {
  const result: WhatsAppSendResult = await sendWhatsAppDetailed({
    to: payload.to,
    message: payload.type === 'template' ? undefined : payload.body,
    templateName: payload.type === 'template' ? payload.templateName : undefined,
    templateVariables: payload.templateVariables,
    persistToInbox: false,
    automated: true,
    metadata: { source: 'send-message', type: payload.type },
  });
  return {
    success: result.success,
    error: result.error,
    messageId: result.messageId,
    deliveryLogId: result.deliveryLogId,
  };
}
