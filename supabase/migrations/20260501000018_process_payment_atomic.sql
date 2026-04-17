-- migration: create / replace process_payment_atomic rpc
-- requirements: req 6.1
--
-- wraps the payment_transactions insert and invoices status update in a
-- single postgres transaction.  plpgsql functions run inside an implicit
-- savepoint; any unhandled exception causes postgres to roll back all
-- changes made inside the function before the error propagates to the
-- caller.
--
-- idempotency: if a payment_transactions row with the same
-- transaction_reference already exists the function returns immediately
-- with status 'already_processed' without touching the invoices table.
--
-- parameters:
--   p_reference  text  — unique payment gateway reference string
--   p_invoice_id uuid  — the invoice being paid
--   p_amount     numeric — the payment amount to record
--
-- return value (jsonb):
--   { "status": "already_processed", "transaction_id": <uuid> }
--   { "status": "processed",          "transaction_id": <uuid> }
--
-- security: security definer so the function runs with the privileges of
-- its owner (postgres superuser / migration role) rather than the calling
-- role.  only service_role may execute it — browser clients must never
-- call this function directly.

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
begin
  -- ----------------------------------------------------------------
  -- 1. idempotency check
  --    if we have already processed this reference, return early
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
  -- 2. insert payment transaction
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
  -- 3. update invoice status
  --    if the invoice row does not exist (0 rows updated) raise an
  --    exception so postgres rolls back the insert above
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
  -- 4. success
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

-- only the server-side service_role may call this function.
-- authenticated browser users must never invoke it directly.
grant execute on function public.process_payment_atomic(text, uuid, numeric)
  to service_role;
