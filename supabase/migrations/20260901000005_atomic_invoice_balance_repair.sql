CREATE OR REPLACE FUNCTION public.recompute_invoice_balances_atomic(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice record; v_paid numeric; v_remaining numeric; v_status text; v_count integer;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT COUNT(*),COALESCE(SUM(amount),0) INTO v_count,v_paid FROM public.payment_allocations WHERE invoice_id=p_invoice_id;
  IF v_count=0 THEN RAISE EXCEPTION 'Invoice has no allocation evidence; automatic balance repair is unsafe'; END IF;
  v_remaining:=GREATEST(0,COALESCE(v_invoice.original_amount,v_invoice.amount,0)-v_paid);
  v_status:=CASE WHEN v_remaining<=0.01 THEN 'paid' WHEN v_paid>0 THEN 'partially_paid' WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date<now() THEN 'overdue' ELSE 'sent' END;
  UPDATE public.invoices SET amount_paid=v_paid,amount_remaining=CASE WHEN v_remaining<=0.01 THEN 0 ELSE v_remaining END,status=v_status,updated_at=now() WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,'amount_paid',v_paid,'amount_remaining',v_remaining,'status',v_status,'allocation_count',v_count);
END $$;
REVOKE ALL ON FUNCTION public.recompute_invoice_balances_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_balances_atomic(uuid) TO service_role;
