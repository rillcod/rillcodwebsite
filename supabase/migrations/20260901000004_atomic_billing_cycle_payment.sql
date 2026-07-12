CREATE OR REPLACE FUNCTION public.settle_billing_cycle_payment_atomic(
  p_billing_cycle_id uuid,
  p_transaction_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle record; v_tx record; v_invoice record; v_invoice_id uuid; v_invoice_number text;
BEGIN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id = p_billing_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing cycle not found'; END IF;
  IF lower(COALESCE(v_cycle.status, '')) IN ('cancelled','rolled_over') THEN
    RAISE EXCEPTION 'A cancelled or rolled-over billing cycle cannot be settled';
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
  IF lower(COALESCE(v_tx.payment_status, '')) NOT IN ('completed','success','paid') THEN
    RAISE EXCEPTION 'Payment transaction must be completed before cycle settlement';
  END IF;
  IF upper(COALESCE(v_tx.currency,'NGN')) <> upper(COALESCE(v_cycle.currency,'NGN')) THEN
    RAISE EXCEPTION 'Payment currency does not match billing cycle currency';
  END IF;
  IF COALESCE(v_tx.amount,0) + 0.01 < COALESCE(v_cycle.amount_due,0) THEN
    RAISE EXCEPTION 'Payment amount is below the billing cycle amount due';
  END IF;

  v_invoice_id := COALESCE(v_tx.invoice_id, v_cycle.invoice_id);
  IF v_invoice_id IS NULL THEN
    v_invoice_number := 'INV-CYC-' || upper(substr(replace(v_tx.id::text,'-',''),1,16));
    INSERT INTO public.invoices (
      invoice_number, school_id, portal_user_id, amount, original_amount, amount_paid,
      amount_remaining, currency, status, due_date, items, notes, stream,
      billing_cycle_id, payment_transaction_id, metadata, created_at, updated_at
    ) VALUES (
      v_invoice_number, COALESCE(v_cycle.owner_school_id,v_cycle.school_id), v_cycle.owner_user_id,
      v_cycle.amount_due, v_cycle.amount_due, v_cycle.amount_due, 0, upper(v_cycle.currency), 'paid',
      v_cycle.due_date, COALESCE(v_cycle.items,'[]'::jsonb),
      'Billing cycle payment: ' || v_cycle.term_label,
      CASE WHEN v_cycle.owner_type='school' THEN 'school' ELSE 'individual' END,
      v_cycle.id, v_tx.id,
      jsonb_build_object('source','billing_cycle_payment','billing_cycle_id',v_cycle.id,'actor_id',p_actor_id),
      now(), now()
    ) RETURNING id INTO v_invoice_id;
  ELSE
    SELECT * INTO v_invoice FROM public.invoices WHERE id=v_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked invoice not found'; END IF;
    UPDATE public.invoices SET
      billing_cycle_id=v_cycle.id,
      status='paid',
      original_amount=COALESCE(original_amount,amount,v_cycle.amount_due),
      amount_paid=COALESCE(original_amount,amount,v_cycle.amount_due),
      amount_remaining=0,
      payment_transaction_id=v_tx.id,
      updated_at=now()
    WHERE id=v_invoice_id;
  END IF;

  UPDATE public.payment_transactions SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_tx.id;
  UPDATE public.billing_cycles SET invoice_id=v_invoice_id,status='paid',updated_at=now() WHERE id=v_cycle.id;
  IF v_cycle.sticky_notice_id IS NOT NULL THEN
    UPDATE public.billing_notices SET is_resolved=true,resolved_at=now(),updated_at=now()
      WHERE id=v_cycle.sticky_notice_id;
  END IF;
  RETURN jsonb_build_object('billing_cycle_id',v_cycle.id,'invoice_id',v_invoice_id,'transaction_id',v_tx.id,'status','paid');
END $$;
REVOKE ALL ON FUNCTION public.settle_billing_cycle_payment_atomic(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_billing_cycle_payment_atomic(uuid,uuid,uuid) TO service_role;
