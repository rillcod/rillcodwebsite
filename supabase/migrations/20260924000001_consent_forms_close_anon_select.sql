-- Public consent forms must be read via /api/public/consent-forms (service role + slim DTO)
-- or the SSR forms page (also service role). Anon table SELECT previously exposed
-- school_id, view_count, and other internal columns via consent_forms_public_select.

DROP POLICY IF EXISTS "consent_forms_public_select" ON public.consent_forms;

REVOKE ALL ON TABLE public.consent_forms FROM anon;

GRANT SELECT ON TABLE public.consent_forms TO authenticated;
GRANT ALL ON TABLE public.consent_forms TO service_role;
