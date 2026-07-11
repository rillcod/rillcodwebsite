-- Finance Phase 1: invoice balances, payment allocations, receipt uniqueness,
-- transactional cycle+invoice create, and allocate_payment_to_invoice RPC.

-- ─── 1. Invoice balance columns ───────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_remaining numeric;

UPDATE public.invoices
SET
  original_amount = COALESCE(original_amount, amount),
  amount_paid = COALESCE(amount_paid, 0),
  amount_remaining = COALESCE(
    amount_remaining,
    GREATEST(0, COALESCE(original_amount, amount) - COALESCE(amount_paid, 0))
  )
WHERE original_amount IS NULL OR amount_remaining IS NULL;

-- Paid invoices: treat as fully settled when status already paid.
UPDATE public.invoices
SET
  amount_paid = COALESCE(original_amount, amount),
  amount_remaining = 0
WHERE lower(COALESCE(status, '')) = 'paid'
  AND COALESCE(amount_remaining, 0) > 0
  AND COALESCE(amount_paid, 0) = 0;

ALTER TABLE public.invoices
  ALTER COLUMN original_amount SET NOT NULL,
  ALTER COLUMN amount_remaining SET NOT NULL;

ALTER TABLE public.invoices
  ALTER COLUMN original_amount SET DEFAULT 0,
  ALTER COLUMN amount_remaining SET DEFAULT 0;

-- Keep amount in sync with original_amount for legacy readers.
CREATE OR REPLACE FUNCTION public.sync_invoice_amount_from_original()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.original_amount IS NULL THEN
    NEW.original_amount := COALESCE(NEW.amount, 0);
  END IF;
  NEW.amount := NEW.original_amount;
  IF NEW.amount_paid IS NULL THEN
    NEW.amount_paid := 0;
  END IF;
  IF NEW.amount_remaining IS NULL THEN
    NEW.amount_remaining := GREATEST(0, NEW.original_amount - NEW.amount_paid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_amount ON public.invoices;
CREATE TRIGGER trg_sync_invoice_amount
  BEFORE INSERT OR UPDATE OF original_amount, amount, amount_paid, amount_remaining
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_amount_from_original();

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_balance_nonneg;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_balance_nonneg
  CHECK (amount_paid >= 0 AND amount_remaining >= 0 AND original_amount >= 0);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_balance_adds_up;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_balance_adds_up
  CHECK (abs((amount_paid + amount_remaining) - original_amount) <= 0.01);

-- Allowed invoice statuses (soft check — keep 'pending' for legacy rows)
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_allowed;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_allowed
  CHECK (
    status IS NULL OR lower(status) IN (
      'draft', 'pending', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled'
    )
  );

-- ─── 2. payment_allocations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  created_by uuid NULL REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_txn_invoice_unique UNIQUE (payment_transaction_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice
  ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_txn
  ON public.payment_allocations(payment_transaction_id);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_payment_allocations" ON public.payment_allocations;
CREATE POLICY "staff_select_payment_allocations"
  ON public.payment_allocations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'school', 'teacher')
    )
  );

DROP POLICY IF EXISTS "service_all_payment_allocations" ON public.payment_allocations;
CREATE POLICY "service_all_payment_allocations"
  ON public.payment_allocations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 3. Receipt idempotency ─────────────────────────────────────────────────
-- Dedupe existing duplicate receipts keeping the earliest.
DELETE FROM public.receipts r
USING public.receipts newer
WHERE r.transaction_id IS NOT NULL
  AND newer.transaction_id = r.transaction_id
  AND newer.id <> r.id
  AND newer.issued_at IS NOT DISTINCT FROM r.issued_at
  AND newer.id > r.id;

DELETE FROM public.receipts r
USING public.receipts keep
WHERE r.transaction_id IS NOT NULL
  AND keep.transaction_id = r.transaction_id
  AND keep.id <> r.id
  AND keep.issued_at < r.issued_at;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_transaction_id_unique
  ON public.receipts (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ─── 4. Automation log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  stage text NULL,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'pending'
    CHECK (lower(status) IN ('pending', 'success', 'failed', 'skipped')),
  attempt int NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  error text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_automation_log_entity
  ON public.finance_automation_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_automation_log_failed
  ON public.finance_automation_log(status, created_at DESC)
  WHERE lower(status) = 'failed';

-- One successful delivery per stream/entity/stage/channel
CREATE UNIQUE INDEX IF NOT EXISTS finance_automation_log_success_dedup
  ON public.finance_automation_log (stream, entity_id, (COALESCE(stage, '')), channel)
  WHERE lower(status) = 'success';

ALTER TABLE public.finance_automation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_finance_automation_log" ON public.finance_automation_log;
CREATE POLICY "admin_select_finance_automation_log"
  ON public.finance_automation_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.portal_users pu WHERE pu.id = auth.uid() AND pu.role = 'admin')
  );
DROP POLICY IF EXISTS "service_all_finance_automation_log" ON public.finance_automation_log;
CREATE POLICY "service_all_finance_automation_log"
  ON public.finance_automation_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 5. allocate_payment_to_invoice (partial-safe, locked) ──────────────────
CREATE OR REPLACE FUNCTION public.allocate_payment_to_invoice(
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn record;
  v_inv record;
  v_alloc_id uuid;
  v_alloc_amount numeric;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_existing uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, amount, currency, payment_status, invoice_id
    INTO v_txn
    FROM public.payment_transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment transaction % not found', p_transaction_id;
  END IF;

  IF lower(COALESCE(v_txn.payment_status, '')) NOT IN ('completed', 'success', 'paid') THEN
    RAISE EXCEPTION 'Payment must be completed before allocation';
  END IF;

  -- Idempotent: already allocated this txn→invoice
  SELECT id INTO v_existing
    FROM public.payment_allocations
   WHERE payment_transaction_id = p_transaction_id
     AND invoice_id = p_invoice_id
   LIMIT 1;

  IF FOUND THEN
    SELECT id, status, amount_paid, amount_remaining, original_amount
      INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
    RETURN jsonb_build_object(
      'status', 'already_allocated',
      'allocation_id', v_existing,
      'invoice_id', p_invoice_id,
      'invoice_status', v_inv.status,
      'amount_paid', v_inv.amount_paid,
      'amount_remaining', v_inv.amount_remaining
    );
  END IF;

  SELECT id, status, original_amount, amount_paid, amount_remaining, currency, amount
    INTO v_inv
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF lower(COALESCE(v_inv.status, '')) IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot allocate to a void/cancelled invoice';
  END IF;

  v_alloc_amount := LEAST(p_amount, COALESCE(v_inv.amount_remaining, v_inv.amount, 0));
  IF v_alloc_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice has no remaining balance' USING ERRCODE = 'check_violation';
  END IF;

  IF p_amount > COALESCE(v_inv.amount_remaining, 0) + 0.01 THEN
    RAISE EXCEPTION
      'Over-allocation: requested % exceeds remaining %',
      p_amount, v_inv.amount_remaining
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payment_allocations (
    payment_transaction_id, invoice_id, amount, currency, created_by
  ) VALUES (
    p_transaction_id, p_invoice_id, v_alloc_amount,
    COALESCE(v_txn.currency, v_inv.currency, 'NGN'),
    p_actor_id
  )
  RETURNING id INTO v_alloc_id;

  v_new_paid := COALESCE(v_inv.amount_paid, 0) + v_alloc_amount;
  v_new_remaining := GREATEST(0, COALESCE(v_inv.original_amount, v_inv.amount, 0) - v_new_paid);

  IF v_new_remaining <= 0.01 THEN
    v_new_status := 'paid';
    v_new_remaining := 0;
    v_new_paid := COALESCE(v_inv.original_amount, v_inv.amount, v_new_paid);
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.invoices
     SET amount_paid = v_new_paid,
         amount_remaining = v_new_remaining,
         status = v_new_status,
         payment_transaction_id = CASE
           WHEN v_new_status = 'paid' THEN p_transaction_id
           ELSE payment_transaction_id
         END,
         updated_at = now()
   WHERE id = p_invoice_id;

  -- Mark matching open instalment items (FIFO by due_date)
  UPDATE public.instalment_items ii
     SET status = 'paid',
         paid_at = now(),
         transaction_ref = p_transaction_id::text
   WHERE ii.id IN (
     SELECT i2.id
       FROM public.instalment_items i2
       JOIN public.instalment_plans ip ON ip.id = i2.plan_id
      WHERE ip.invoice_id = p_invoice_id
        AND lower(COALESCE(i2.status, '')) IN ('pending', 'due', 'overdue', 'scheduled')
      ORDER BY i2.due_date ASC NULLS LAST
      LIMIT 1
   )
   AND abs(ii.amount - v_alloc_amount) <= 0.01;

  RETURN jsonb_build_object(
    'status', 'allocated',
    'allocation_id', v_alloc_id,
    'allocated_amount', v_alloc_amount,
    'invoice_id', p_invoice_id,
    'invoice_status', v_new_status,
    'amount_paid', v_new_paid,
    'amount_remaining', v_new_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_payment_to_invoice(uuid, uuid, numeric, uuid)
  TO service_role;

-- ─── 6. create_billing_cycle_with_invoice (one transaction) ─────────────────
CREATE OR REPLACE FUNCTION public.create_billing_cycle_with_invoice(
  p_owner_type text,
  p_owner_school_id uuid,
  p_owner_user_id uuid,
  p_term_label text,
  p_term_start_date date,
  p_due_date date,
  p_amount_due numeric,
  p_currency text DEFAULT 'NGN',
  p_status text DEFAULT 'due',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_subscription_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_stream text;
  v_school_id uuid;
BEGIN
  IF p_owner_type NOT IN ('school', 'individual') THEN
    RAISE EXCEPTION 'owner_type must be school or individual';
  END IF;
  IF p_amount_due IS NULL OR p_amount_due <= 0 THEN
    RAISE EXCEPTION 'amount_due must be positive';
  END IF;
  IF p_status NOT IN ('due', 'past_due') THEN
    RAISE EXCEPTION 'New billing cycles must start as due or past_due';
  END IF;

  v_school_id := CASE WHEN p_owner_type = 'school' THEN p_owner_school_id ELSE NULL END;
  v_stream := CASE WHEN p_owner_type = 'school' THEN 'school' ELSE 'individual' END;
  v_invoice_number := 'BCY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.billing_cycles (
    owner_type, owner_school_id, owner_user_id, school_id,
    term_label, term_start_date, due_date, amount_due, currency, status,
    items, subscription_id, created_at, updated_at
  ) VALUES (
    p_owner_type, p_owner_school_id, p_owner_user_id, v_school_id,
    p_term_label, p_term_start_date, p_due_date, p_amount_due,
    upper(COALESCE(p_currency, 'NGN')), p_status,
    COALESCE(p_items, '[]'::jsonb), p_subscription_id, now(), now()
  )
  RETURNING id INTO v_cycle_id;

  INSERT INTO public.invoices (
    invoice_number, school_id, portal_user_id, amount, original_amount,
    amount_paid, amount_remaining, currency, due_date, status, stream,
    billing_cycle_id, notes, items, created_at, updated_at
  ) VALUES (
    v_invoice_number,
    v_school_id,
    CASE WHEN p_owner_type = 'individual' THEN p_owner_user_id ELSE NULL END,
    p_amount_due, p_amount_due, 0, p_amount_due,
    upper(COALESCE(p_currency, 'NGN')),
    p_due_date, 'sent', v_stream, v_cycle_id,
    'Auto-generated from billing cycle: ' || p_term_label,
    COALESCE(p_items, '[]'::jsonb), now(), now()
  )
  RETURNING id INTO v_invoice_id;

  UPDATE public.billing_cycles
     SET invoice_id = v_invoice_id, updated_at = now()
   WHERE id = v_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'created_by', p_actor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_billing_cycle_with_invoice(
  text, uuid, uuid, text, date, date, numeric, text, text, jsonb, uuid, uuid
) TO service_role;

-- ─── 7. Unique open settlement per billing cycle ────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS school_settlements_active_cycle_unique
  ON public.school_settlements (billing_cycle_id)
  WHERE billing_cycle_id IS NOT NULL AND lower(COALESCE(status, '')) <> 'void';
