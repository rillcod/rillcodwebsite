/**
 * Paystack webhook — verify HMAC, then either forward to Next.js or process inline.
 *
 * Secrets (Dashboard → Edge Functions → paystack-webhook):
 *   PAYSTACK_SECRET_KEY           — same as Paystack dashboard secret key
 *   EDGE_SERVICE_ROLE_KEY         — service role for inline mode (cannot use SUPABASE_* name in secrets)
 *
 * Optional:
 *   PAYSTACK_WEBHOOK_FORWARD_URL  — full URL to POST body (e.g. https://rillcod.com/api/payments/webhook)
 *   APP_URL / NEXT_PUBLIC_APP_URL — if set and FORWARD_URL unset, forwards to `${APP_URL}/api/payments/webhook`
 *   PAYMENT_WEBHOOK_INTERNAL_SECRET — if set with same value on Next + RECEIPT_CALLBACK_URL, triggers receipt job
 *   RECEIPT_CALLBACK_URL          — default `${APP_URL}/api/payments/internal/generate-receipt`
 *
 * Paystack: https://paystack.com/docs/payments/webhooks
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function processChargeSuccess(
  supabase: ReturnType<typeof createClient>,
  reference: string,
  rawGatewayData: Record<string, unknown>,
): Promise<{ ok: boolean; skipped?: string; transactionId?: string }> {
  const { data: transaction, error: txError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('transaction_reference', reference)
    .maybeSingle();

  if (txError || !transaction) {
    console.error('[paystack-webhook] transaction not found:', reference, txError?.message);
    return { ok: true, skipped: 'transaction_not_found' };
  }

  const prevGateway =
    transaction.payment_gateway_response &&
    typeof transaction.payment_gateway_response === 'object' &&
    !Array.isArray(transaction.payment_gateway_response)
      ? (transaction.payment_gateway_response as Record<string, unknown>)
      : {};

  const mergedGateway = { ...prevGateway, paystack: rawGatewayData };

  const { data: updatedTx, error: updateErr } = await supabase
    .from('payment_transactions')
    .update({
      payment_status: 'completed',
      paid_at: new Date().toISOString(),
      payment_gateway_response: mergedGateway as unknown as Record<string, unknown>,
    })
    .eq('id', transaction.id)
    .neq('payment_status', 'completed')
    .select('id')
    .maybeSingle();

  if (updateErr) {
    console.error('[paystack-webhook] update failed:', reference, updateErr.message);
    return { ok: false };
  }
  if (!updatedTx) {
    return { ok: true, skipped: 'already_completed' };
  }

  const gatewayResponse = mergedGateway;
  const isRegistrationPayment = gatewayResponse.payment_type === 'registration';
  const studentId = gatewayResponse.student_id as string | undefined;

  if (isRegistrationPayment && studentId) {
    await supabase
      .from('students')
      .update({
        status: 'pending',
        registration_payment_at: new Date().toISOString(),
        registration_paystack_reference: reference,
      })
      .eq('id', studentId)
      .eq('status', 'pending');
  } else if ((transaction as { invoice_id?: string }).invoice_id) {
    await supabase
      .from('invoices')
      .update({
        status: 'paid',
        payment_transaction_id: transaction.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (transaction as { invoice_id: string }).invoice_id);
  }

  return { ok: true, transactionId: transaction.id };
}

async function triggerReceiptOnApp(transactionId: string): Promise<void> {
  const secret = Deno.env.get('PAYMENT_WEBHOOK_INTERNAL_SECRET');
  const base =
    Deno.env.get('RECEIPT_CALLBACK_URL') ||
    (() => {
      const app = (Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || '').replace(/\/$/, '');
      return app ? `${app}/api/payments/internal/generate-receipt` : '';
    })();
  if (!base || !secret) return;

  try {
    const r = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rillcod-payment-secret': secret,
      },
      body: JSON.stringify({ transactionId }),
    });
    if (!r.ok) console.error('[paystack-webhook] receipt callback failed', r.status, await r.text());
  } catch (e) {
    console.error('[paystack-webhook] receipt callback error', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        service: 'paystack-webhook',
        hint: 'POST webhooks from Paystack with header x-paystack-signature. Browser return uses callback_url from transaction initialize.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!paystackSecret) {
    return new Response(JSON.stringify({ error: 'PAYSTACK_SECRET_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const signature = req.headers.get('x-paystack-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'missing_x_paystack_signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let expected: string;
  try {
    expected = await hmacSha512Hex(paystackSecret, rawBody);
  } catch (e) {
    console.error('[paystack-webhook] hmac error', e);
    return new Response(JSON.stringify({ error: 'signature_compute_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!timingSafeEqual(expected, signature)) {
    return new Response(JSON.stringify({ error: 'invalid_signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const appBase = (Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || '').replace(/\/$/, '');
  const forwardUrl =
    Deno.env.get('PAYSTACK_WEBHOOK_FORWARD_URL') ||
    (appBase ? `${appBase}/api/payments/webhook` : '');

  if (forwardUrl) {
    try {
      const fr = await fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signature,
        },
        body: rawBody,
      });
      const text = await fr.text();
      return new Response(text || JSON.stringify({ received: true }), {
        status: fr.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    } catch (e) {
      console.error('[paystack-webhook] forward failed', e);
      return new Response(JSON.stringify({ error: 'forward_failed', received: false }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // Inline processing (no Next URL configured)
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey =
    Deno.env.get('EDGE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({
        error:
          'Set APP_URL (forward to Next) or EDGE_SERVICE_ROLE_KEY for inline DB updates. Reserved SUPABASE_* secret names are not allowed in the dashboard.',
        received: false,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }

  let event: { event?: string; data?: { reference?: string } & Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json', received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (event.event !== 'charge.success') {
    console.info('[paystack-webhook] ignored event', event.event);
    return new Response(JSON.stringify({ received: true, ignored: event.event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const ref = event.data?.reference;
  if (!ref || typeof ref !== 'string') {
    return new Response(JSON.stringify({ received: true, skipped: 'no_reference' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await processChargeSuccess(supabase, ref, (event.data || {}) as Record<string, unknown>);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: 'processing_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (result.skipped === 'already_completed') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (result.skipped === 'transaction_not_found') {
    return new Response(JSON.stringify({ received: true, skipped: 'transaction_not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (result.transactionId) {
    triggerReceiptOnApp(result.transactionId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
});
