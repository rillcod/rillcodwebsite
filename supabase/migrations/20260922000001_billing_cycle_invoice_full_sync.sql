-- Extend billing-cycle edits so school invoice line items, metadata, and notes stay in sync.
-- Must run after 20260901000002 (7-param RPC) and 20260921000006 (school term invoices).

DROP FUNCTION IF EXISTS public.update_billing_cycle_with_invoice(uuid, text, date, date, numeric, text, text);

CREATE OR REPLACE FUNCTION public.update_billing_cycle_with_invoice(
  p_cycle_id uuid,
  p_term_label text,
  p_term_start_date date,
  p_due_date date,
  p_amount_due numeric,
  p_currency text,
  p_status text,
  p_items jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle record;
  v_invoice record;
  v_remaining numeric;
  v_invoice_status text;
  v_notes text;
BEGIN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked term record not found';
  END IF;
  IF v_cycle.status = 'paid' THEN
    RAISE EXCEPTION 'Cannot edit a paid invoice';
  END IF;
  IF p_amount_due IS NULL OR p_amount_due <= 0 THEN
    RAISE EXCEPTION 'amount must be a positive number';
  END IF;
  IF upper(p_currency) NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'currency must be NGN or USD';
  END IF;
  IF p_status NOT IN ('due', 'past_due', 'cancelled', 'rolled_over') THEN
    RAISE EXCEPTION 'Invalid term status';
  END IF;

  v_notes := COALESCE(NULLIF(trim(p_notes), ''), 'Auto-generated from billing cycle: ' || p_term_label);

  IF v_cycle.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_cycle.invoice_id FOR UPDATE;
    IF lower(COALESCE(v_invoice.status, '')) = 'paid' OR COALESCE(v_invoice.amount_paid, 0) > 0 THEN
      RAISE EXCEPTION 'Invoice has payment activity and is financially locked';
    END IF;
    v_remaining := p_amount_due;
    v_invoice_status := CASE
      WHEN p_status IN ('cancelled', 'rolled_over') THEN 'cancelled'
      WHEN p_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'sent'
    END;
    UPDATE public.invoices
    SET
      amount = p_amount_due,
      original_amount = p_amount_due,
      amount_remaining = v_remaining,
      currency = upper(p_currency),
      due_date = p_due_date,
      status = v_invoice_status,
      notes = v_notes,
      items = COALESCE(p_items, items),
      metadata = CASE
        WHEN p_metadata IS NOT NULL THEN COALESCE(metadata, '{}'::jsonb) || p_metadata
        ELSE metadata
      END,
      updated_at = now()
    WHERE id = v_invoice.id;
  END IF;

  UPDATE public.billing_cycles
  SET
    term_label = p_term_label,
    term_start_date = p_term_start_date,
    due_date = p_due_date,
    amount_due = p_amount_due,
    currency = upper(p_currency),
    status = p_status,
    items = COALESCE(p_items, items),
    updated_at = now()
  WHERE id = p_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', p_cycle_id,
    'invoice_id', v_cycle.invoice_id,
    'cycle_status', p_status,
    'invoice_status', v_invoice_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_billing_cycle_with_invoice(uuid, text, date, date, numeric, text, text, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_billing_cycle_with_invoice(uuid, text, date, date, numeric, text, text, jsonb, jsonb, text) TO service_role;
