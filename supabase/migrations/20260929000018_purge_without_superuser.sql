-- Make admin_purge_curriculum_releases actually work on Supabase.
--
-- 20260929000016 opened the purge with:
--
--   perform set_config('session_replication_role', 'replica', true);
--
-- to silence the teaching-plan triggers while it deletes. Setting that parameter requires
-- superuser, which Supabase does not grant to `postgres` or `service_role`, so the function raised
-- on its very first statement:
--
--   permission denied to set parameter "session_replication_role"
--
-- Verified against production on 2026-07-31 — the RPC failed for every input. force-delete-draft.ts
-- only falls back when the RPC is *missing* (it matches "does not exist" / PGRST202); a permission
-- error is treated as fatal, so "force delete this curriculum" failed too. That is why a curriculum
-- whose only edition was already retired could not be removed by any route in the app.
--
-- The line is not needed any more. 016 rebound the child foreign keys onto ON DELETE CASCADE, so
-- the database now unwinds the tree itself — confirmed by deleting the last retired release, which
-- left zero orphan plans, lessons, assignments, exams, cbt_exams or flashcards behind. The explicit
-- pre-clears below stay: they are harmless with CASCADE in place and still correct without it.
--
-- Attempted, not required: if a future deploy DOES run as a role that may set it, the trigger
-- suppression is still taken. Otherwise the purge simply proceeds without it.

create or replace function public.admin_purge_curriculum_releases(p_release_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_release_ids, '{}');
  v_plan_ids uuid[];
  v_deleted int := 0;
begin
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;

  select coalesce(array_agg(id), '{}') into v_plan_ids
  from public.lesson_plans
  where curriculum_release_id = any(v_ids);

  -- Best effort only. Requires superuser, which Supabase does not grant; the CASCADE foreign keys
  -- from 20260929000016 make it unnecessary. Never let it abort the purge.
  begin
    perform set_config('session_replication_role', 'replica', true);
  exception when others then
    null;
  end;

  delete from public.academic_curriculum_delivery_schedules where release_id = any(v_ids);
  delete from public.academic_offering_curriculum_directions where release_id = any(v_ids);
  delete from public.academic_curriculum_adoptions where release_id = any(v_ids);
  delete from public.curriculum_week_tracking where curriculum_release_id = any(v_ids);

  if cardinality(v_plan_ids) > 0 then
    delete from public.assignments where lesson_plan_id = any(v_plan_ids);
    delete from public.exams where lesson_plan_id = any(v_plan_ids);
    delete from public.cbt_exams where lesson_plan_id = any(v_plan_ids);
    delete from public.flashcard_decks where lesson_plan_id = any(v_plan_ids);
    delete from public.lessons where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_materials where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_plans where id = any(v_plan_ids);
  end if;

  delete from public.assignments where curriculum_release_id = any(v_ids);
  delete from public.cbt_exams where curriculum_release_id = any(v_ids);
  delete from public.exams where curriculum_release_id = any(v_ids);
  delete from public.flashcard_decks where curriculum_release_id = any(v_ids);
  delete from public.lesson_materials where curriculum_release_id = any(v_ids);
  delete from public.academic_curriculum_quality_runs where release_id = any(v_ids);

  delete from public.academic_curriculum_releases where id = any(v_ids);
  get diagnostics v_deleted = row_count;

  -- Put it back if we managed to change it, so the setting cannot leak into later work on this
  -- connection. `true` already scopes it to the transaction; this is belt and braces.
  begin
    perform set_config('session_replication_role', 'origin', true);
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

-- Re-created above, so re-apply the lockdown from 20260929000017. `revoke ... from public` alone
-- does NOT cover Supabase's direct grants to anon/authenticated — name them explicitly.
revoke all on function public.admin_purge_curriculum_releases(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_purge_curriculum_releases(uuid[]) to service_role;
