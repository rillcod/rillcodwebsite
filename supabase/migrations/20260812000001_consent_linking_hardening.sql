-- Harden consent-to-student linking without guessing how conflicting legacy
-- records should be resolved. The preflight checks intentionally abort instead
-- of deleting or rewriting any existing links.

BEGIN;

LOCK TABLE public.parent_student_links IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.form_leads IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  conflict_count bigint;
  conflict_sample text;
BEGIN
  SELECT count(*)
  INTO conflict_count
  FROM (
    SELECT student_id
    FROM public.parent_student_links
    GROUP BY student_id
    HAVING count(DISTINCT parent_id) > 1
  ) conflicts;

  IF conflict_count > 0 THEN
    SELECT string_agg(student_id::text, ', ' ORDER BY student_id)
    INTO conflict_sample
    FROM (
      SELECT student_id
      FROM public.parent_student_links
      GROUP BY student_id
      HAVING count(DISTINCT parent_id) > 1
      ORDER BY student_id
      LIMIT 10
    ) conflicts;

    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format(
        'Cannot enforce one parent link per student: %s student(s) are linked to multiple parents. Resolve these student_id values first (up to 10 shown): %s',
        conflict_count,
        conflict_sample
      );
  END IF;
END
$$;

-- Keep the existing UNIQUE (parent_id, student_id) constraint: callers can
-- continue using that pair as an idempotent conflict target. This additional
-- index prevents a different parent from being linked to the same student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_student_links_student_id
  ON public.parent_student_links (student_id);

COMMENT ON INDEX public.uq_parent_student_links_student_id IS
  'Allows at most one parent_student_links row per student; the existing parent_id/student_id unique constraint remains for same-pair idempotency.';

DO $$
DECLARE
  conflict_count bigint;
  conflict_sample text;
BEGIN
  SELECT count(*)
  INTO conflict_count
  FROM (
    SELECT form_id, matched_student_id
    FROM public.form_leads
    WHERE matched_student_id IS NOT NULL
      AND match_status = 'approved'
    GROUP BY form_id, matched_student_id
    HAVING count(*) > 1
  ) conflicts;

  IF conflict_count > 0 THEN
    SELECT string_agg(form_id::text || ':' || matched_student_id::text, ', ' ORDER BY form_id, matched_student_id)
    INTO conflict_sample
    FROM (
      SELECT form_id, matched_student_id
      FROM public.form_leads
      WHERE matched_student_id IS NOT NULL
        AND match_status = 'approved'
      GROUP BY form_id, matched_student_id
      HAVING count(*) > 1
      ORDER BY form_id, matched_student_id
      LIMIT 10
    ) conflicts;

    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format(
        'Cannot enforce one approved consent lead per form and matched student: %s form/student pair(s) have multiple approved form_leads rows. Resolve these form_id:matched_student_id pairs first (up to 10 shown): %s',
        conflict_count,
        conflict_sample
      );
  END IF;
END
$$;

-- match_status already permits "approved". Other statuses and unmatched leads
-- remain unconstrained so staff can review or reject multiple candidates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_leads_approved_matched_student
  ON public.form_leads (form_id, matched_student_id)
  WHERE matched_student_id IS NOT NULL
    AND match_status = 'approved';

COMMENT ON INDEX public.uq_form_leads_approved_matched_student IS
  'Allows at most one approved lead per consent form and matched student.';

-- Public submissions are handled by a service-role API, which bypasses RLS.
-- Anonymous/direct client inserts therefore need no permissive table policy.
DROP POLICY IF EXISTS "form_leads_public_insert" ON public.form_leads;

-- The role-only is_staff()/is_admin() helpers do not carry school context.
-- Mirror the existing SELECT policy so non-admin staff can mutate only leads
-- belonging to their school, while admins retain global access.
DROP POLICY IF EXISTS "form_leads_staff_update" ON public.form_leads;
CREATE POLICY "form_leads_staff_update" ON public.form_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users p
      JOIN public.consent_forms cf ON cf.id = form_leads.form_id
      WHERE p.id = auth.uid()
        AND p.role IN ('teacher', 'admin', 'school')
        AND (
          p.role = 'admin'
          OR cf.school_id = p.school_id
          OR form_leads.school_id = p.school_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.portal_users p
      JOIN public.consent_forms cf ON cf.id = form_leads.form_id
      WHERE p.id = auth.uid()
        AND p.role IN ('teacher', 'admin', 'school')
        AND (
          p.role = 'admin'
          OR cf.school_id = p.school_id
          OR form_leads.school_id = p.school_id
        )
    )
  );

COMMENT ON POLICY "form_leads_staff_update" ON public.form_leads IS
  'Authenticated staff may update leads in their school; admins may update all leads.';

DROP POLICY IF EXISTS "form_leads_staff_delete" ON public.form_leads;
CREATE POLICY "form_leads_staff_delete" ON public.form_leads
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users p
      JOIN public.consent_forms cf ON cf.id = form_leads.form_id
      WHERE p.id = auth.uid()
        AND p.role IN ('teacher', 'admin', 'school')
        AND (
          p.role = 'admin'
          OR cf.school_id = p.school_id
          OR form_leads.school_id = p.school_id
        )
    )
  );

COMMENT ON POLICY "form_leads_staff_delete" ON public.form_leads IS
  'Authenticated staff may delete leads in their school; admins may delete all leads.';

COMMIT;
