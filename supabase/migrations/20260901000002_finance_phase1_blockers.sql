-- Finance Phase 1: atomic refunds and synchronized billing-cycle/invoice edits.

CREATE OR REPLACE FUNCTION public.finalize_full_refund_atomic(
  p_transaction_id uuid,
  p_reason text,
  p_gateway_refund jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx record; v_inv record; v_course record; v_paid numeric; v_remaining numeric; v_invoice_status text; v_cycle_status text; v_cycle_id uuid;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A refund reason is required'; END IF;
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
  IF lower(COALESCE(v_tx.payment_status,''))='refunded' THEN
    RETURN jsonb_build_object('already_refunded',true,'transaction_id',v_tx.id,'invoice_id',v_tx.invoice_id);
  END IF;
  IF lower(COALESCE(v_tx.payment_status,'')) NOT IN ('completed','success','paid') THEN RAISE EXCEPTION 'Only a completed payment can be refunded'; END IF;

  UPDATE public.payment_transactions SET payment_status='refunded', refunded_at=now(), refund_reason=trim(p_reason), updated_at=now(),
    payment_gateway_response=COALESCE(payment_gateway_response,'{}'::jsonb)||jsonb_build_object('refund',COALESCE(p_gateway_refund,'{}'::jsonb)||jsonb_build_object('reason',trim(p_reason),'actor_id',p_actor_id,'finalized_at',now()))
  WHERE id=v_tx.id;

  IF v_tx.invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices WHERE id=v_tx.invoice_id FOR UPDATE;
    IF FOUND THEN
      v_paid:=GREATEST(0,COALESCE(v_inv.amount_paid,0)-COALESCE(v_tx.amount,0));
      v_remaining:=GREATEST(0,COALESCE(v_inv.original_amount,v_inv.amount,0)-v_paid);
      v_invoice_status:=CASE WHEN v_paid>0 THEN 'partially_paid' WHEN v_inv.due_date IS NOT NULL AND v_inv.due_date<now() THEN 'overdue' ELSE 'sent' END;
      UPDATE public.invoices SET amount_paid=v_paid,amount_remaining=v_remaining,status=v_invoice_status,updated_at=now() WHERE id=v_inv.id;
      DELETE FROM public.payment_allocations WHERE payment_transaction_id=v_tx.id AND invoice_id=v_inv.id;
      IF v_inv.billing_cycle_id IS NOT NULL THEN
        v_cycle_id:=v_inv.billing_cycle_id;
        v_cycle_status:=CASE WHEN v_inv.due_date IS NOT NULL AND v_inv.due_date<now() THEN 'past_due' ELSE 'due' END;
        UPDATE public.billing_cycles SET status=v_cycle_status,updated_at=now() WHERE id=v_inv.billing_cycle_id AND status='paid';
      END IF;
    END IF;
  END IF;

  IF v_tx.course_id IS NOT NULL AND v_tx.portal_user_id IS NOT NULL THEN
    SELECT program_id INTO v_course FROM public.courses WHERE id=v_tx.course_id;
    IF FOUND AND v_course.program_id IS NOT NULL THEN UPDATE public.enrollments SET status='suspended' WHERE user_id=v_tx.portal_user_id AND program_id=v_course.program_id; END IF;
  END IF;
  RETURN jsonb_build_object('transaction_id',v_tx.id,'invoice_id',v_tx.invoice_id,'invoice_status',v_invoice_status,'billing_cycle_id',v_cycle_id,'billing_cycle_status',v_cycle_status,'already_refunded',false);
END $$;
REVOKE ALL ON FUNCTION public.finalize_full_refund_atomic(uuid,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_full_refund_atomic(uuid,text,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_billing_cycle_with_invoice(
 p_cycle_id uuid,p_term_label text,p_term_start_date date,p_due_date date,p_amount_due numeric,p_currency text,p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cycle record; v_invoice record; v_remaining numeric; v_invoice_status text;
BEGIN
 SELECT * INTO v_cycle FROM public.billing_cycles WHERE id=p_cycle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Billing cycle not found'; END IF;
 IF v_cycle.status='paid' THEN RAISE EXCEPTION 'Paid billing cycles are financially locked'; END IF;
 IF p_amount_due IS NULL OR p_amount_due<=0 THEN RAISE EXCEPTION 'amount_due must be positive'; END IF;
 IF upper(p_currency) NOT IN ('NGN','USD') THEN RAISE EXCEPTION 'currency must be NGN or USD'; END IF;
 IF p_status NOT IN ('due','past_due','cancelled','rolled_over') THEN RAISE EXCEPTION 'Invalid billing-cycle status'; END IF;
 IF v_cycle.invoice_id IS NOT NULL THEN
  SELECT * INTO v_invoice FROM public.invoices WHERE id=v_cycle.invoice_id FOR UPDATE;
  IF lower(COALESCE(v_invoice.status,''))='paid' OR COALESCE(v_invoice.amount_paid,0)>0 THEN RAISE EXCEPTION 'Billing cycle invoice has payment activity and is financially locked'; END IF;
  v_remaining:=p_amount_due;
  v_invoice_status:=CASE WHEN p_status IN ('cancelled','rolled_over') THEN 'cancelled' WHEN p_due_date<CURRENT_DATE THEN 'overdue' ELSE 'sent' END;
  UPDATE public.invoices SET amount=p_amount_due,original_amount=p_amount_due,amount_remaining=v_remaining,currency=upper(p_currency),due_date=p_due_date,status=v_invoice_status,notes='Auto-generated from billing cycle: '||p_term_label,updated_at=now() WHERE id=v_invoice.id;
 END IF;
 UPDATE public.billing_cycles SET term_label=p_term_label,term_start_date=p_term_start_date,due_date=p_due_date,amount_due=p_amount_due,currency=upper(p_currency),status=p_status,updated_at=now() WHERE id=p_cycle_id;
 RETURN jsonb_build_object('cycle_id',p_cycle_id,'invoice_id',v_cycle.invoice_id,'cycle_status',p_status,'invoice_status',v_invoice_status);
END $$;
REVOKE ALL ON FUNCTION public.update_billing_cycle_with_invoice(uuid,text,date,date,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_billing_cycle_with_invoice(uuid,text,date,date,numeric,text,text) TO service_role;