-- Two writers, one JSONB column, no merge: every login statistic was lost.
--
-- login/page.tsx wrote last_login_at / last_login_platform / *_login_count when
-- a user signed in. DashboardAccessGuard then spread the profile snapshot it had
-- loaded BEFORE that write and put the whole object back, erasing the login keys.
-- The guard always runs after login, so the loss was total: 0 of 1024 accounts
-- carried a single login key, while last_active_at / app_session_count (written
-- by the guard, i.e. the last writer) were present on all six accounts that had
-- ever signed in. 195 login events since 17 Jul, none of them recorded.
--
-- Reordering the callers cannot fix this — two browser tabs race the same way.
-- The merge has to happen in the database, against the row as it is at that
-- instant, under a row lock.

create or replace function public.merge_my_metadata(
  patch jsonb default '{}'::jsonb,
  increment_keys text[] default '{}'::text[],
  stamp_login boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_current jsonb;
  v_next jsonb;
  k text;
begin
  if v_id is null then
    raise exception 'merge_my_metadata: no authenticated user';
  end if;

  -- FOR UPDATE serialises concurrent merges on this row, so two tabs signing in
  -- together increment a counter twice instead of both storing "1".
  select coalesce(metadata, '{}'::jsonb)
    into v_current
    from public.portal_users
   where id = v_id
     for update;

  if not found then
    raise exception 'merge_my_metadata: no profile for %', v_id;
  end if;

  v_next := v_current || coalesce(patch, '{}'::jsonb);

  -- Counters are derived from the STORED value, never from the patch, so a
  -- client holding a stale snapshot cannot roll a count backwards.
  foreach k in array coalesce(increment_keys, '{}'::text[]) loop
    v_next := jsonb_set(
      v_next,
      array[k],
      to_jsonb(coalesce((v_current ->> k)::numeric, 0) + 1),
      true
    );
  end loop;

  update public.portal_users
     set metadata   = v_next,
         last_login = case when stamp_login then now() else last_login end,
         updated_at = now()
   where id = v_id;

  return v_next;
end;
$$;

revoke all on function public.merge_my_metadata(jsonb, text[], boolean) from public;
grant execute on function public.merge_my_metadata(jsonb, text[], boolean) to authenticated;

comment on function public.merge_my_metadata(jsonb, text[], boolean) is
  'Atomically merges a patch into the calling user''s portal_users.metadata under a row lock, incrementing named counters from the stored value and optionally stamping last_login. Replaces client-side read-modify-write, which lost every login statistic to the dashboard guard''s later write of the same column.';
