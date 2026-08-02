-- Financial evidence is immutable: withdrawing a receipt marks it as withdrawn
-- and unlinks it from the live payment view, but never deletes the receipt row.
CREATE OR REPLACE FUNCTION public.withdraw_receipt_atomic(
  p_receipt_id uuid,
  p_actor_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt record;
  v_withdrawn_at timestamptz := now();
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A withdrawal reason is required';
  END IF;

  SELECT id, receipt_number, transaction_id, amount, currency, metadata
    INTO v_receipt
    FROM public.receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  IF COALESCE((v_receipt.metadata ->> 'withdrawn')::boolean, false) THEN
    RETURN jsonb_build_object(
      'receipt_id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number,
      'transaction_id', v_receipt.transaction_id,
      'amount', v_receipt.amount,
      'currency', v_receipt.currency,
      'already_withdrawn', true,
      'reason', v_receipt.metadata ->> 'withdrawal_reason'
    );
  END IF;

  UPDATE public.receipts
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'withdrawn', true,
       'withdrawn_at', v_withdrawn_at,
       'withdrawn_by', p_actor_id,
       'withdrawal_reason', trim(p_reason)
     )
   WHERE id = v_receipt.id;

  IF v_receipt.transaction_id IS NOT NULL THEN
    UPDATE public.payment_transactions
       SET receipt_url = NULL,
           updated_at = v_withdrawn_at
     WHERE id = v_receipt.transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'transaction_id', v_receipt.transaction_id,
    'amount', v_receipt.amount,
    'currency', v_receipt.currency,
    'actor_id', p_actor_id,
    'withdrawn_at', v_withdrawn_at,
    'reason', trim(p_reason),
    'already_withdrawn', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_receipt_atomic(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_receipt_atomic(uuid, uuid, text) TO service_role;
