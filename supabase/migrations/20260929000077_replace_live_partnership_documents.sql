-- Issuing a new quote must not leave the last one live beside it.
--
-- The composer already said "Send (replaces the live copy)" and then inserted
-- another row. A proposal is not a contract — the previous draft, send, or
-- withdrawn leftover of the same kind on this school is discarded, keeping
-- the new one. A signed MoU is never touched.

create or replace function public.replace_live_partnership_documents(
  p_school_id uuid,
  p_kind text,
  p_keep_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_kind not in ('proposal', 'mou') then
    raise exception 'kind must be proposal or mou';
  end if;

  delete from public.partnership_agreements
   where school_id = p_school_id
     and document_kind = p_kind
     and id is distinct from p_keep_id
     and status in ('draft', 'sent', 'void', 'declined');

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.replace_live_partnership_documents(uuid, text, uuid) is
  'Discard previous live or leftover documents of this kind for the school, keeping p_keep_id. Never deletes a signed MoU.';

revoke all on function public.replace_live_partnership_documents(uuid, text, uuid) from public;
grant execute on function public.replace_live_partnership_documents(uuid, text, uuid) to service_role;
grant execute on function public.replace_live_partnership_documents(uuid, text, uuid) to authenticated;
