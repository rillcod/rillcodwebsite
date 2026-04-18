-- migration: add payment amount validation to process_payment_atomic
-- fixes critical issue where wrong payment amounts could be accepted

create or replace function public.process_payment_atomic(
  p_reference  text,
  p_invoice_id uuid,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_existing_id   uuid;
  v_transaction_id uuid;
  v_rows          int;
  v_invoice_amount numeric;
begin
  -- ----------------------------------------------------------------
  -- 1. idempotency check
  -- ----------------------------------------------------------------
  select id
    into v_existing_id
    from public.payment_transactions
   where transaction_reference = p_reference
   limit 1;

  if found then
    return jsonb_build_object(
      'status',         'already_processed',
      'transaction_id', v_existing_id
    );
  end if;

  -- ----------------------------------------------------------------
  -- 2. validate payment amount matches invoice
  -- ----------------------------------------------------------------
  select amount
    into v_invoice_amount
    from public.invoices
   where id = p_invoice_id;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  -- Allow small rounding differences (1 kobo) but reject significant mismatches
  if abs(p_amount - v_invoice_amount) > 0.01 then
    raise exception 
      'Payment amount (%) does not match invoice amount (%). Difference: %',
      p_amount, v_invoice_amount, abs(p_amount - v_invoice_amount);
  end if;

  -- ----------------------------------------------------------------
  -- 3. insert payment transaction
  -- ----------------------------------------------------------------
  insert into public.payment_transactions (
    transaction_reference,
    amount,
    payment_status,
    paid_at,
    invoice_id
  )
  values (
    p_reference,
    p_amount,
    'completed',
    now(),
    p_invoice_id
  )
  returning id into v_transaction_id;

  -- ----------------------------------------------------------------
  -- 4. update invoice status
  -- ----------------------------------------------------------------
  update public.invoices
     set status                 = 'paid',
         payment_transaction_id = v_transaction_id,
         updated_at             = now()
   where id = p_invoice_id;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception
      'process_payment_atomic: invoice % not found — rolling back',
      p_invoice_id;
  end if;

  -- ----------------------------------------------------------------
  -- 5. success
  -- ----------------------------------------------------------------
  return jsonb_build_object(
    'status',         'processed',
    'transaction_id', v_transaction_id
  );

exception
  when others then
    -- re-raise so postgres rolls back the entire transaction
    raise;
end;
$$;

-- grant remains the same
grant execute on function public.process_payment_atomic(text, uuid, numeric)
  to service_role;
