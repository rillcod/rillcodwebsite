-- Align payment_transactions constraints with what the application writes.
--
-- 1. payment_method: the original check only allowed stripe/paystack/bank_transfer,
--    but staff verification and manual payment routes record cash, pos, cheque,
--    mobile_money, manual, and other. Those inserts violated the constraint.
-- 2. payment_status: normalise any legacy 'success' / 'paid' rows to 'completed'
--    so revenue queries and idempotency checks see one canonical value.

-- ── 1. Relax payment_method to the full set used in code ─────────────────────
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_payment_method_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'stripe'::text,
    'paystack'::text,
    'bank_transfer'::text,
    'cash'::text,
    'pos'::text,
    'cheque'::text,
    'mobile_money'::text,
    'manual'::text,
    'card'::text,
    'online'::text,
    'other'::text
  ]));

-- ── 2. Normalise legacy statuses ──────────────────────────────────────────────
-- Some rows written before the pipeline unification used 'success' or 'paid'.
-- Drop the status constraint first in case those rows exist (they would make
-- re-validation fail), normalise, then re-add.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_payment_status_check;

UPDATE public.payment_transactions
   SET payment_status = 'completed'
 WHERE payment_status IN ('success', 'paid');

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_status_check
  CHECK (payment_status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'completed'::text,
    'failed'::text,
    'refunded'::text
  ]));
