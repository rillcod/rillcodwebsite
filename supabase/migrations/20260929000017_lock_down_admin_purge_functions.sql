-- Close a hole: the curriculum purge helpers were callable with the public anon key.
--
-- 20260929000015 and 20260929000016 guarded these with `revoke all ... from public`. That is not
-- enough on Supabase. `PUBLIC` is the implicit catch-all role; Supabase additionally holds
-- ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions directly to `anon` and
-- `authenticated`. Revoking from PUBLIC leaves those direct grants untouched.
--
-- Verified against the live database on 2026-07-31 with NEXT_PUBLIC_SUPABASE_ANON_KEY — the key
-- that ships in the browser bundle and sits in wrangler.toml:
--
--   anon -> admin_purge_curriculum_releases({})  =>  {"ok": true, "deleted": 0}   -- EXECUTED
--   anon -> admin_inspect_teaching_orphans()     =>  full orphan report           -- EXECUTED
--
-- These are SECURITY DEFINER, so they run as the owner and bypass RLS entirely. Anyone holding
-- the anon key could therefore have deleted every curriculum release and, by cascade, its lesson
-- plans, assignments, exams, flashcards, lesson materials, progress reports and term grades —
-- unauthenticated, with a single HTTP call.
--
-- Only the server ever calls these: the curricula routes build a service-role client
-- (createAdminClient) and check `role = 'admin'` before invoking the purge. So no browser role
-- needs EXECUTE at all, and revoking it breaks nothing.

revoke all on function public.admin_purge_curriculum_releases(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_inspect_teaching_orphans() from public, anon, authenticated;
revoke all on function public.admin_purge_teaching_orphans() from public, anon, authenticated;

grant execute on function public.admin_purge_curriculum_releases(uuid[]) to service_role;
grant execute on function public.admin_inspect_teaching_orphans() to service_role;
grant execute on function public.admin_purge_teaching_orphans() to service_role;

-- NOTE for the next server-only function added here: `revoke ... from public` alone will NOT
-- protect it. Name `anon` and `authenticated` explicitly, exactly as above. Altering the schema's
-- default privileges would cover it automatically but would also silently strip EXECUTE from
-- future RPCs that legitimately need a signed-in caller, so it is deliberately not done here.
