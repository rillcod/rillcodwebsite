-- 1. Add billing_cycle_id column to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_cycle_id uuid REFERENCES public.billing_cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_billing_cycle_id ON public.invoices(billing_cycle_id);

-- 2. Backfill billing_cycle_id with existing values
UPDATE public.invoices i
   SET billing_cycle_id = bc.id
  FROM public.billing_cycles bc
 WHERE bc.invoice_id = i.id;

-- 3. Recreate the finance_ledger view to retrieve dynamic school commission rates
CREATE OR REPLACE VIEW public.finance_ledger
  WITH (security_invoker = on) AS
SELECT
    t.id                         AS transaction_id,
    t.created_at                 AS transacted_at,
    t.paid_at                    AS paid_at,
    t.payment_status             AS status,
    t.payment_method             AS method,
    t.amount                     AS amount,
    t.currency                   AS currency,
    t.transaction_reference      AS reference,
    t.receipt_url                AS receipt_url,
    t.school_id                  AS school_id,
    t.portal_user_id             AS portal_user_id,
    i.id                         AS invoice_id,
    i.invoice_number             AS invoice_number,
    i.stream                     AS stream,
    r.id                         AS receipt_id,
    r.receipt_number             AS receipt_number,
    coalesce(s.commission_rate, 15) as commission_rate
  FROM public.payment_transactions t
  LEFT JOIN public.invoices i
    ON i.id = t.invoice_id OR i.payment_transaction_id = t.id
  LEFT JOIN public.receipts r ON r.transaction_id = t.id
  LEFT JOIN public.schools s ON s.id = t.school_id;
