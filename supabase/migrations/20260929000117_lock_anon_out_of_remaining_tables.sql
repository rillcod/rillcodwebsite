-- Take the visitor key off every remaining public table.
--
-- 20260929000115 locked money and people. 00113 locked app_settings. 00116
-- left payment_accounts as a narrow SELECT. The baseline still handed GRANT ALL
-- to anon on the rest, so one USING (true) policy on any of those tables was a
-- public dump. The second lock belongs on the grant, the same way as 00115.
--
-- What the visitor key actually needs was audited against the source again:
--
--   * schools           — StudentRegistration.tsx reads approved schools
--                         on the public /student-registration page.
--   * payment_accounts  — the same page, plus the summer-school popup, read
--                         Rillcod's own receiving accounts (00116).
--
-- Everything else a logged-out visitor hits is a server route holding
-- SUPABASE_SERVICE_ROLE_KEY (consent forms, parent claim, sitemap, signup).
-- Login is unaffected: auth lives in the auth schema, and merge_my_metadata
-- runs as authenticated after a session exists.
--
-- Default privileges are revoked too, so a later CREATE TABLE does not
-- quietly hand anon GRANT ALL again.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
    GROUP BY table_schema, table_name
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', r.table_schema, r.table_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Best effort: stop CREATE TABLE from re-granting anon. The migrator cannot
-- always change another role's default privileges (supabase_admin returned
-- 42501). Existing table grants above are the lock that matters.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not change postgres default privileges for anon; existing table grants were still revoked.';
END $$;

-- Re-grant the two public catalogue reads 00115 / 00116 already documented.
GRANT SELECT ON TABLE public.schools TO anon;
GRANT SELECT ON TABLE public.payment_accounts TO anon;

COMMIT;
