-- Close public certificates dump: anon previously had SELECT USING (true) + GRANT ALL.
-- Public verify now goes through /api/public/verify-certificate (service role, code-scoped).

DROP POLICY IF EXISTS "Public can verify via code" ON public.certificates;

REVOKE ALL ON TABLE public.certificates FROM anon;

-- Authenticated users keep existing owner/parent/staff policies; service_role retains full access.
GRANT SELECT ON TABLE public.certificates TO authenticated;
GRANT ALL ON TABLE public.certificates TO service_role;
