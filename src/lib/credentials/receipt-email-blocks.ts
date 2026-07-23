import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/** Receipt PDF attachment + fallback link block for activation / paid registration emails. */
export async function buildReceiptEmailExtras(
  admin: AnySupabase,
  portalUserId: string | undefined,
  fullName: string,
): Promise<{
  attachments?: Array<{ filename: string; content: string }>;
  appendHtml: string;
}> {
  if (!portalUserId) return { appendHtml: '' };

  try {
    const { data: tx } = await admin
      .from('payment_transactions')
      .select('id')
      .eq('portal_user_id', portalUserId)
      .in('payment_status', ['completed', 'success', 'paid'])
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!tx?.id) return { appendHtml: '' };

    const { paymentsService } = await import('@/services/payments.service');
    const receiptUrl = (await paymentsService.generateReceipt(tx.id)) || '';
    if (!receiptUrl) return { appendHtml: '' };

    let attachments: Array<{ filename: string; content: string }> | undefined;
    try {
      const r = await fetch(receiptUrl);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        const safeName = (fullName || 'Student').replace(/[^a-z0-9]+/gi, '_');
        attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
      }
    } catch (err) {
      console.error('[buildReceiptEmailExtras] receipt attachment failed:', err);
    }

    const appendHtml = `
<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
  <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Payment Receipt</p>
  <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">${attachments ? 'Your receipt is attached as a PDF.' : 'Your payment receipt is ready.'} View or download any time:</p>
  <a href="${receiptUrl}" style="display:inline-block;padding:9px 20px;background:#10b981;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">View / Download Receipt →</a>
</div>`;

    return { attachments, appendHtml };
  } catch (err) {
    console.error('[buildReceiptEmailExtras] failed:', err);
    return { appendHtml: '' };
  }
}

/** Summer school cohort WhatsApp group promo block. */
export async function buildSummerWhatsAppBlock(): Promise<string> {
  try {
    const { getSummerSchoolWhatsAppLink } = await import('@/lib/summer-school/whatsapp-group');
    const waGroupLink = (await getSummerSchoolWhatsAppLink()) || '';
    if (!waGroupLink) return '';
    return `
<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
  <p style="margin:0 0 8px;font-size:11px;color:#25d366;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Class WhatsApp Group</p>
  <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">Join the cohort WhatsApp group to receive class links, daily updates, and schedules:</p>
  <a href="${waGroupLink}" style="display:inline-block;padding:9px 20px;background:#25d366;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Join WhatsApp Group →</a>
</div>`;
  } catch (err) {
    console.error('[buildSummerWhatsAppBlock] failed:', err);
    return '';
  }
}
