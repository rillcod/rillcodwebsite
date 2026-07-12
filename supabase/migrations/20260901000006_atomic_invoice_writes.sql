CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
 p_invoice_number text,p_school_id uuid,p_portal_user_id uuid,p_amount numeric,p_currency text,p_status text,
 p_due_date timestamptz,p_items jsonb,p_notes text,p_stream text,p_billing_cycle_id uuid,p_metadata jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cycle record; v_invoice_id uuid;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;
 IF p_billing_cycle_id IS NOT NULL THEN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id=p_billing_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing cycle not found'; END IF;
  IF v_cycle.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Billing cycle already has an invoice'; END IF;
 END IF;
 INSERT INTO public.invoices(invoice_number,school_id,portal_user_id,amount,original_amount,amount_paid,amount_remaining,currency,status,due_date,items,notes,stream,billing_cycle_id,metadata,created_at,updated_at)
 VALUES(p_invoice_number,p_school_id,p_portal_user_id,p_amount,p_amount,0,p_amount,upper(p_currency),p_status,p_due_date,COALESCE(p_items,'[]'::jsonb),p_notes,p_stream,p_billing_cycle_id,COALESCE(p_metadata,'{}'::jsonb),now(),now()) RETURNING id INTO v_invoice_id;
 IF p_billing_cycle_id IS NOT NULL THEN UPDATE public.billing_cycles SET invoice_id=v_invoice_id,updated_at=now() WHERE id=p_billing_cycle_id; END IF;
 RETURN jsonb_build_object('invoice_id',v_invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.create_invoice_atomic(text,uuid,uuid,numeric,text,text,timestamptz,jsonb,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(text,uuid,uuid,numeric,text,text,timestamptz,jsonb,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_settled_invoice_atomic(
 p_transaction_id uuid,p_invoice_number text,p_amount numeric,p_currency text,p_school_id uuid,p_portal_user_id uuid,p_items jsonb,p_metadata jsonb,p_stream text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tx record; v_invoice_id uuid;
BEGIN
 SELECT * INTO v_tx FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
 IF lower(COALESCE(v_tx.payment_status,'')) NOT IN ('completed','success','paid') THEN RAISE EXCEPTION 'Only a completed payment can produce a settled invoice'; END IF;
 IF v_tx.invoice_id IS NOT NULL THEN RETURN jsonb_build_object('invoice_id',v_tx.invoice_id,'reused',true); END IF;
 IF abs(COALESCE(v_tx.amount,0)-p_amount)>0.01 OR upper(COALESCE(v_tx.currency,'NGN'))<>upper(p_currency) THEN RAISE EXCEPTION 'Invoice amount or currency does not match payment'; END IF;
 INSERT INTO public.invoices(invoice_number,school_id,portal_user_id,amount,original_amount,amount_paid,amount_remaining,currency,status,due_date,payment_transaction_id,items,metadata,stream,created_at,updated_at)
 VALUES(p_invoice_number,p_school_id,p_portal_user_id,p_amount,p_amount,p_amount,0,upper(p_currency),'paid',NULL,v_tx.id,COALESCE(p_items,'[]'::jsonb),COALESCE(p_metadata,'{}'::jsonb),p_stream,now(),now()) RETURNING id INTO v_invoice_id;
 UPDATE public.payment_transactions SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_tx.id;
 RETURN jsonb_build_object('invoice_id',v_invoice_id,'reused',false);
END $$;
REVOKE ALL ON FUNCTION public.ensure_settled_invoice_atomic(uuid,text,numeric,text,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_settled_invoice_atomic(uuid,text,numeric,text,uuid,uuid,jsonb,jsonb,text) TO service_role;
