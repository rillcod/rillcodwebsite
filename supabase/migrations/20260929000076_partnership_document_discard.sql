-- Discard partnership documents in the database, not only in the app.
--
-- A proposal is a quote, not a contract. An unsigned or withdrawn MoU is not a
-- live signature. RLS on this table was SELECT-only, so a delete that did not
-- travel as the service role looked finished in the desk and the row was still
-- there. The signed-document guard is UPDATE-only and stays that way.
--
-- This adds:
--   1. an admin DELETE policy matching the desk rule
--   2. SECURITY DEFINER functions the API calls, which bypass RLS the same
--      way issuing already does

drop trigger if exists guard_partnership_agreement_no_delete on public.partnership_agreements;

grant delete on public.partnership_agreements to authenticated;
grant delete on public.partnership_agreements to service_role;

drop policy if exists partnership_agreements_admin_delete on public.partnership_agreements;
create policy partnership_agreements_admin_delete
  on public.partnership_agreements
  for delete
  using (
    exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role = 'admin'
         and coalesce(u.is_deleted, false) = false
    )
    and (
      document_kind = 'proposal'
      or status is distinct from 'signed'
    )
  );

create or replace function public.discard_partnership_agreement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.partnership_agreements%rowtype;
begin
  select * into r from public.partnership_agreements where id = p_id;
  if not found then
    raise exception 'That document does not exist.' using errcode = 'P0002';
  end if;

  -- A signed MoU is the legal record. Void it first; this then deletes the leftover.
  -- Proposals and unsigned MoUs go in any state, as many times as they are issued.
  if r.document_kind = 'mou' and r.status = 'signed' then
    raise exception
      '% is a signed MoU. Withdraw it first so the school''s link stops working, then you can delete it.',
      coalesce(r.reference, 'This MoU')
      using errcode = 'check_violation';
  end if;

  delete from public.partnership_agreements where id = p_id;

  return jsonb_build_object(
    'deleted', true,
    'id', r.id,
    'reference', r.reference,
    'document_kind', r.document_kind,
    'status', r.status,
    'school_id', r.school_id
  );
end;
$$;

create or replace function public.discard_withdrawn_partnership_agreements(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  refs text[];
  n integer;
begin
  select coalesce(array_agg(reference order by created_at), '{}')
    into refs
    from public.partnership_agreements
   where school_id = p_school_id
     and status = 'void';

  delete from public.partnership_agreements
   where school_id = p_school_id
     and status = 'void';

  get diagnostics n = row_count;

  return jsonb_build_object(
    'deleted', n,
    'references', to_jsonb(refs)
  );
end;
$$;

comment on function public.discard_partnership_agreement(uuid) is
  'Remove a proposal in any state, or an unsigned / withdrawn MoU. A signed MoU must be voided first.';

comment on function public.discard_withdrawn_partnership_agreements(uuid) is
  'Remove every withdrawn (void) partnership document for one school.';

comment on table public.partnership_agreements is
  'Proposals and MoUs issued to partner schools. A proposal is a quote and may be discarded in any state. A signed MoU is the legal record — void it before deleting. terms_snapshot and document_html stay frozen while the row exists.';

revoke all on function public.discard_partnership_agreement(uuid) from public;
revoke all on function public.discard_withdrawn_partnership_agreements(uuid) from public;
grant execute on function public.discard_partnership_agreement(uuid) to service_role;
grant execute on function public.discard_partnership_agreement(uuid) to authenticated;
grant execute on function public.discard_withdrawn_partnership_agreements(uuid) to service_role;
grant execute on function public.discard_withdrawn_partnership_agreements(uuid) to authenticated;
