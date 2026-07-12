CREATE OR REPLACE FUNCTION public.withdraw_receipt_atomic(
  p_receipt_id uuid,
  p_actor_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_receipt record;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A withdrawal reason is required';
  END IF;
  SELECT id, receipt_number, transaction_id, amount, currency
    INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;

  IF v_receipt.transaction_id IS NOT NULL THEN
    UPDATE public.payment_transactions SET receipt_url = NULL, updated_at = now()
     WHERE id = v_receipt.transaction_id;
  END IF;
  DELETE FROM public.receipts WHERE id = v_receipt.id;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'transaction_id', v_receipt.transaction_id,
    'amount', v_receipt.amount,
    'currency', v_receipt.currency,
    'actor_id', p_actor_id,
    'reason', trim(p_reason)
  );
END $$;
REVOKE ALL ON FUNCTION public.withdraw_receipt_atomic(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_receipt_atomic(uuid,uuid,text) TO service_role;
