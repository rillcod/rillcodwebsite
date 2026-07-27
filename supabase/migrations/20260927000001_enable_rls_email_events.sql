-- ============================================================================
-- Close the two tables that were left without row level security.
-- ============================================================================
-- `email_events` was reachable by the `anon` role (the key that ships in the
-- browser bundle) with full SELECT/INSERT/UPDATE/DELETE and no RLS, so anyone
-- could read recipient addresses and delivery status, or forge/delete rows.
--
-- `dismissed_duplicate_pairs` also had RLS off, but held no anon/authenticated
-- grants, so it was not actually reachable. It is closed here for consistency.
--
-- SAFETY: verified before writing this migration. Every caller of both tables
-- resolves to the service-role client, and service_role BYPASSES RLS entirely,
-- so no application code path changes behaviour:
--     src/app/api/inbox/track/[token]/route.ts                [service role]
--     src/app/api/progress-reports/[id]/email-events/route.ts [service role]
--     src/app/api/classes/heal/route.ts                       [service role]
--
-- NOTE: verified against THIS repository only. If the separate Android app
-- (rillcod1) queries `email_events` with the anon key, it will start receiving
-- empty results after this migration.
-- ============================================================================

ALTER TABLE "public"."email_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dismissed_duplicate_pairs" ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies are created. With RLS enabled and no policy present,
-- Postgres denies by default for anon/authenticated, while service_role still
-- bypasses RLS. That is exactly the intended access model for both tables.
--
-- If a client-side surface ever needs to read these, add a scoped policy --
-- do not disable RLS again.

-- Defence in depth: `anon` has no reason to hold privileges on email_events.
-- RLS alone already blocks it; this removes the grant so the table is closed at
-- two independent layers. Revert with:
--   GRANT ALL ON TABLE "public"."email_events" TO "anon";
REVOKE ALL ON TABLE "public"."email_events" FROM "anon";

-- ============================================================================
-- VERIFY
-- ============================================================================
-- Expect relrowsecurity = true for both:
--   SELECT relname, relrowsecurity FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND relname IN ('email_events','dismissed_duplicate_pairs');
--
-- Expect zero rows (no anon privileges left on email_events):
--   SELECT a.privilege_type FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace,
--     LATERAL aclexplode(c.relacl) a
--    WHERE n.nspname = 'public' AND c.relname = 'email_events'
--      AND pg_get_userbyid(a.grantee) = 'anon';
-- ============================================================================
