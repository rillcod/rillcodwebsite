-- Lock the visitor role out of money and people.
--
-- The anon key ships inside the JavaScript every visitor downloads; it is public
-- by design. Two things are meant to stand behind it: a table grant, and a row
-- policy. The baseline granted ALL on ~189 tables to anon, which left the row
-- policies carrying the whole load alone — and 21 of those are USING (true).
-- One badly written policy on a granted table is a public dump, with nothing
-- behind it. This restores the second lock on the tables that hold money and
-- people.
--
-- What the visitor key actually needs was audited against the source before
-- writing this, not assumed:
--
--   * schools  — StudentRegistration.tsx:240 reads id+name of approved schools
--                from the browser on the public /student-registration page.
--                That read must keep working, so SELECT is re-granted below,
--                narrowed to approved rows.
--   * everything else here — nothing. Every public write path (registration,
--                consent forms, parent claim, school application) runs through
--                a server route holding SUPABASE_SERVICE_ROLE_KEY, which
--                bypasses RLS and these grants entirely.
--
-- Login is unaffected: login/page.tsx reads portal_users only after the password
-- check has already succeeded, so that read runs as `authenticated`, never anon.

BEGIN;

-- ── People and money: the visitor role has no business here ─────────────────
-- service_role (server routes) and authenticated (signed-in users, still
-- filtered by their own row policies) are untouched.
REVOKE ALL ON TABLE public.portal_users          FROM anon;
REVOKE ALL ON TABLE public.invoices              FROM anon;
REVOKE ALL ON TABLE public.payments              FROM anon;
REVOKE ALL ON TABLE public.billing_cycles        FROM anon;
REVOKE ALL ON TABLE public.prospective_students  FROM anon;

-- ── prospective_students: the registration enquiry list ─────────────────────
-- Names, phone numbers and email addresses of everyone who ever enquired.
-- "Allow authenticated read/update" were USING (true): any signed-in student or
-- parent could read the entire list and rewrite any row in it. The staff policy
-- below already covers the one browser surface that needs it
-- (/dashboard/approvals, admin+teacher only), so these two are pure exposure.
DROP POLICY IF EXISTS "Allow authenticated read"   ON public.prospective_students;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.prospective_students;

-- Both public INSERT policies go. No browser code inserts a prospect: every
-- intake path (consent forms, parent claim, CRM reconcile) is a server route
-- using the service role. Verified by grepping every 'use client' file that
-- touches this table — dashboard/approvals is the only one, and it reads.
DROP POLICY IF EXISTS "Allow public insert"                   ON public.prospective_students;
DROP POLICY IF EXISTS "Public can insert prospective students" ON public.prospective_students;

-- ── schools ─────────────────────────────────────────────────────────────────
-- Anyone on the internet could create a school row: WITH CHECK (true) on INSERT.
-- The real application path is POST /api/schools, which uses the service role
-- and is rate limited to 5/hour/IP, so nothing legitimate loses anything here.
DROP POLICY IF EXISTS "Public can insert schools" ON public.schools;

-- Two overlapping USING (true) SELECT policies published every school row,
-- including pending and rejected applications. The registration dropdown only
-- ever wants approved ones.
DROP POLICY IF EXISTS "Public can view schools" ON public.schools;
DROP POLICY IF EXISTS "schools_select_all"      ON public.schools;

DROP POLICY IF EXISTS schools_public_read_approved ON public.schools;
CREATE POLICY schools_public_read_approved
  ON public.schools
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- staff_can_view_schools still gives admin/teacher/school the full list, so
-- narrowing the public policy does not blind the dashboard.
REVOKE ALL ON TABLE public.schools FROM anon;
GRANT SELECT ON TABLE public.schools TO anon;

COMMIT;
