-- Close the two remaining non-grading PL/pgSQL warnings and bring the legacy
-- parent-link RPC under the same identity/scope invariants as the modern API.

create or replace function public.create_parent_and_link(
  p_email text,
  p_full_name text,
  p_phone text,
  p_student_id uuid,
  p_relationship text default 'Guardian'::text,
  p_auth_user_id uuid default null::uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.portal_users%rowtype;
  v_parent public.portal_users%rowtype;
  v_student public.students%rowtype;
  v_parent_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_auth_email text;
begin
  select * into v_caller
    from public.portal_users
   where id = auth.uid()
     and role in ('admin', 'teacher', 'school')
     and coalesce(is_active, true) = true
     and coalesce(is_deleted, false) = false;
  if not found then
    raise exception 'Authorised staff access is required' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid parent email is required' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'A parent name is required' using errcode = '22023';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if v_student.user_id is null then
    raise exception 'The student portal account must be created before linking a parent'
      using errcode = '23514';
  end if;
  if v_caller.role <> 'admin' and (
    v_caller.school_id is null or v_student.school_id is distinct from v_caller.school_id
  ) then
    raise exception 'This student is outside your school scope' using errcode = '42501';
  end if;

  select * into v_parent
    from public.portal_users
   where lower(btrim(email)) = v_email
   limit 1
   for update;

  if found then
    if v_parent.role <> 'parent' or coalesce(v_parent.is_deleted, false) then
      raise exception 'This email belongs to a different account type' using errcode = '23505';
    end if;
    if p_auth_user_id is not null and p_auth_user_id <> v_parent.id then
      raise exception 'The supplied account does not match the existing parent' using errcode = '23505';
    end if;
    v_parent_id := v_parent.id;
    update public.portal_users
       set full_name = v_name,
           phone = nullif(btrim(coalesce(p_phone, '')), ''),
           updated_at = now()
     where id = v_parent_id;
  else
    if p_auth_user_id is null then
      raise exception 'Create the parent authentication account before linking'
        using errcode = '23514';
    end if;
    select lower(btrim(email)) into v_auth_email
      from auth.users
     where id = p_auth_user_id;
    if not found or v_auth_email is distinct from v_email then
      raise exception 'The parent authentication account does not match this email'
        using errcode = '23514';
    end if;
    insert into public.portal_users (
      id, email, full_name, role, phone, school_id, school_name,
      is_active, is_deleted, created_at, updated_at
    ) values (
      p_auth_user_id, v_email, v_name, 'parent', nullif(btrim(coalesce(p_phone, '')), ''),
      v_student.school_id, v_student.school_name, true, false, now(), now()
    ) returning id into v_parent_id;
  end if;

  insert into public.parent_student_links (parent_id, student_id, created_at, updated_at)
  values (v_parent_id, v_student.id, now(), now())
  on conflict (parent_id, student_id) do update set updated_at = excluded.updated_at;

  update public.students
     set parent_email = v_email,
         parent_name = v_name,
         parent_phone = nullif(btrim(coalesce(p_phone, '')), ''),
         parent_relationship = coalesce(nullif(btrim(p_relationship), ''), 'Guardian'),
         updated_at = now()
   where id = v_student.id;

  insert into public.parent_claim_audit (
    student_id, parent_id, email, phone, action, note
  ) values (
    v_student.user_id, v_parent_id, v_email, nullif(btrim(coalesce(p_phone, '')), ''),
    'linked', 'Parent linked by authorised staff through the legacy compatibility RPC.'
  );

  return json_build_object(
    'parent_id', v_parent_id,
    'student_id', v_student.id,
    'student_portal_user_id', v_student.user_id,
    'email', v_email,
    'linked', true
  );
end;
$$;

revoke execute on function public.create_parent_and_link(text, text, text, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.create_parent_and_link(text, text, text, uuid, text, uuid) to authenticated;

comment on function public.create_parent_and_link(text, text, text, uuid, text, uuid) is
  'Compatibility RPC for staff. Enforces school scope, auth-backed parent identity, role safety, and the canonical parent_student_links junction.';

create or replace function public.settle_billing_cycle_payment_atomic(
  p_billing_cycle_id uuid,
  p_transaction_id uuid,
  p_actor_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle record;
  v_tx record;
  v_invoice_id uuid;
  v_invoice_number text;
begin
  select * into v_cycle from public.billing_cycles where id = p_billing_cycle_id for update;
  if not found then raise exception 'Billing cycle not found'; end if;
  if lower(coalesce(v_cycle.status, '')) in ('cancelled', 'rolled_over') then
    raise exception 'A cancelled or rolled-over billing cycle cannot be settled';
  end if;

  select * into v_tx from public.payment_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Payment transaction not found'; end if;
  if lower(coalesce(v_tx.payment_status, '')) not in ('completed', 'success', 'paid') then
    raise exception 'Payment transaction must be completed before cycle settlement';
  end if;
  if upper(coalesce(v_tx.currency, 'NGN')) <> upper(coalesce(v_cycle.currency, 'NGN')) then
    raise exception 'Payment currency does not match billing cycle currency';
  end if;
  if coalesce(v_tx.amount, 0) + 0.01 < coalesce(v_cycle.amount_due, 0) then
    raise exception 'Payment amount is below the billing cycle amount due';
  end if;

  v_invoice_id := coalesce(v_tx.invoice_id, v_cycle.invoice_id);
  if v_invoice_id is null then
    v_invoice_number := 'INV-CYC-' || upper(substr(replace(v_tx.id::text, '-', ''), 1, 16));
    insert into public.invoices (
      invoice_number, school_id, portal_user_id, amount, original_amount, amount_paid,
      amount_remaining, currency, status, due_date, items, notes, stream,
      billing_cycle_id, payment_transaction_id, metadata, created_at, updated_at
    ) values (
      v_invoice_number, coalesce(v_cycle.owner_school_id, v_cycle.school_id), v_cycle.owner_user_id,
      v_cycle.amount_due, v_cycle.amount_due, v_cycle.amount_due, 0, upper(v_cycle.currency), 'paid',
      v_cycle.due_date, coalesce(v_cycle.items, '[]'::jsonb),
      'Billing cycle payment: ' || v_cycle.term_label,
      case when v_cycle.owner_type = 'school' then 'school' else 'individual' end,
      v_cycle.id, v_tx.id,
      jsonb_build_object('source', 'billing_cycle_payment', 'billing_cycle_id', v_cycle.id, 'actor_id', p_actor_id),
      now(), now()
    ) returning id into v_invoice_id;
  else
    perform 1 from public.invoices where id = v_invoice_id for update;
    if not found then raise exception 'Linked invoice not found'; end if;
    update public.invoices set
      billing_cycle_id = v_cycle.id,
      status = 'paid',
      original_amount = coalesce(original_amount, amount, v_cycle.amount_due),
      amount_paid = coalesce(original_amount, amount, v_cycle.amount_due),
      amount_remaining = 0,
      payment_transaction_id = v_tx.id,
      updated_at = now()
    where id = v_invoice_id;
  end if;

  update public.payment_transactions set invoice_id = v_invoice_id, updated_at = now() where id = v_tx.id;
  update public.billing_cycles set invoice_id = v_invoice_id, status = 'paid', updated_at = now() where id = v_cycle.id;
  if v_cycle.sticky_notice_id is not null then
    update public.billing_notices set is_resolved = true, resolved_at = now(), updated_at = now()
      where id = v_cycle.sticky_notice_id;
  end if;
  return jsonb_build_object(
    'billing_cycle_id', v_cycle.id,
    'invoice_id', v_invoice_id,
    'transaction_id', v_tx.id,
    'status', 'paid'
  );
end;
$$;

comment on function public.settle_billing_cycle_payment_atomic(uuid, uuid, uuid) is
  'Atomically settles one billing cycle from one completed payment and reuses its linked invoice on retry.';
