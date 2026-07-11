-- Canonical consent-to-child provenance. Parent ownership remains exclusively
-- represented by parent_student_links.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.form_leads') IS NULL
     OR to_regclass('public.portal_users') IS NULL
     OR to_regclass('public.students') IS NULL THEN
    RAISE EXCEPTION
      'form_lead_child_links prerequisites are missing (form_leads, portal_users, or students)';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.form_lead_child_links (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                uuid        NOT NULL
    REFERENCES public.form_leads(id) ON DELETE CASCADE,
  child_index            integer     NOT NULL CHECK (child_index >= 0),
  student_portal_user_id uuid        NOT NULL
    REFERENCES public.portal_users(id) ON DELETE CASCADE,
  status                 text        NOT NULL DEFAULT 'approved'
    CHECK (status IN ('candidate', 'approved', 'onboarded', 'unlinked', 'reverted')),
  source                 text        NOT NULL
    CHECK (btrim(source) <> ''),
  linked_at              timestamptz,
  linked_by              uuid
    REFERENCES public.portal_users(id) ON DELETE SET NULL,
  metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_form_lead_child_links_lead_index
    UNIQUE (lead_id, child_index),
  CONSTRAINT uq_form_lead_child_links_lead_student
    UNIQUE (lead_id, student_portal_user_id),
  CONSTRAINT form_lead_child_links_linked_metadata_check
    CHECK (
      (status IN ('approved', 'onboarded') AND linked_at IS NOT NULL)
      OR status IN ('candidate', 'unlinked', 'reverted')
    )
);

CREATE INDEX IF NOT EXISTS idx_form_lead_child_links_student
  ON public.form_lead_child_links (student_portal_user_id);

CREATE INDEX IF NOT EXISTS idx_form_lead_child_links_lead_status
  ON public.form_lead_child_links (lead_id, status);

COMMENT ON TABLE public.form_lead_child_links IS
  'Canonical consent-lead child provenance. This table does not grant parent ownership; parent_student_links is authoritative for ownership.';

COMMENT ON COLUMN public.form_lead_child_links.child_index IS
  'Zero-based child slot from the submitted consent record; slot zero is the primary-child cache source.';

COMMENT ON COLUMN public.form_lead_child_links.student_portal_user_id IS
  'portal_users.id for a student-role account, validated by trigger.';

CREATE OR REPLACE FUNCTION public.validate_form_lead_child_link_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_role text;
BEGIN
  SELECT role
    INTO v_student_role
  FROM public.portal_users
  WHERE id = NEW.student_portal_user_id;

  IF v_student_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'form_lead_child_links.student_portal_user_id %s must reference a student-role portal user',
        NEW.student_portal_user_id
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students
    WHERE user_id = NEW.student_portal_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'form_lead_child_links.student_portal_user_id %s has no students row',
        NEW.student_portal_user_id
      );
  END IF;

  IF NEW.status IN ('approved', 'onboarded') AND NEW.linked_at IS NULL THEN
    NEW.linked_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_validate_form_lead_child_link_roles
  ON public.form_lead_child_links;
CREATE TRIGGER trg_validate_form_lead_child_link_roles
  BEFORE INSERT OR UPDATE
  ON public.form_lead_child_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_form_lead_child_link_roles();

CREATE OR REPLACE FUNCTION public.sync_form_lead_primary_child_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_primary_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT student_portal_user_id
      INTO v_primary_id
    FROM public.form_lead_child_links
    WHERE lead_id = OLD.lead_id
      AND child_index = 0
      AND status IN ('approved', 'onboarded');

    UPDATE public.form_leads
    SET matched_student_id = v_primary_id
    WHERE id = OLD.lead_id
      AND matched_student_id IS DISTINCT FROM v_primary_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND (TG_OP = 'INSERT' OR NEW.lead_id IS DISTINCT FROM OLD.lead_id) THEN
    SELECT student_portal_user_id
      INTO v_primary_id
    FROM public.form_lead_child_links
    WHERE lead_id = NEW.lead_id
      AND child_index = 0
      AND status IN ('approved', 'onboarded');

    UPDATE public.form_leads
    SET matched_student_id = v_primary_id
    WHERE id = NEW.lead_id
      AND matched_student_id IS DISTINCT FROM v_primary_id;
  END IF;

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_form_lead_primary_child_cache
  ON public.form_lead_child_links;
CREATE TRIGGER trg_sync_form_lead_primary_child_cache
  AFTER INSERT OR UPDATE OR DELETE
  ON public.form_lead_child_links
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_form_lead_primary_child_cache();

ALTER TABLE public.form_lead_child_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "form_lead_child_links_staff_select"
  ON public.form_lead_child_links;
CREATE POLICY "form_lead_child_links_staff_select"
  ON public.form_lead_child_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users staff
      JOIN public.form_leads lead
        ON lead.id = form_lead_child_links.lead_id
      JOIN public.consent_forms form
        ON form.id = lead.form_id
      WHERE staff.id = auth.uid()
        AND staff.role IN ('admin', 'teacher', 'school')
        AND (
          staff.role = 'admin'
          OR form.school_id = staff.school_id
          OR lead.school_id = staff.school_id
          OR (
            staff.role = 'teacher'
            AND EXISTS (
              SELECT 1
              FROM public.teacher_schools assignment
              WHERE assignment.teacher_id = staff.id
                AND assignment.school_id = COALESCE(form.school_id, lead.school_id)
            )
          )
        )
    )
  );

REVOKE ALL ON TABLE public.form_lead_child_links
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.form_lead_child_links TO authenticated;
GRANT ALL ON TABLE public.form_lead_child_links TO service_role;

COMMIT;
