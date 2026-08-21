-- Publish a school report as one database transaction. This removes the gap
-- where the revision could be frozen but the live report pointer failed (or
-- vice versa), and makes the optimistic lock authoritative at write time.

CREATE OR REPLACE FUNCTION public.publish_school_report_revision_atomic(
  p_report_id uuid,
  p_expected_lock_version integer,
  p_actor_user_id uuid,
  p_title text,
  p_snapshot jsonb,
  p_narrative jsonb,
  p_design jsonb,
  p_data_sources jsonb,
  p_change_reason text,
  p_pdf_hash text,
  p_force_override jsonb,
  p_verification_code text
)
RETURNS SETOF public.school_report_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.school_performance_reports%ROWTYPE;
  v_working public.school_report_revisions%ROWTYPE;
  v_published public.school_report_revisions%ROWTYPE;
  v_next_revision integer;
  v_published_at timestamptz := now();
  v_created_working boolean := false;
BEGIN
  SELECT *
    INTO v_report
    FROM public.school_performance_reports
   WHERE id = p_report_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_report.status <> 'draft' OR v_report.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'REPORT_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT *
    INTO v_working
    FROM public.school_report_revisions
   WHERE report_id = p_report_id
     AND status = 'working'
   ORDER BY revision_number DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(MAX(revision_number), 0) + 1
      INTO v_next_revision
      FROM public.school_report_revisions
     WHERE report_id = p_report_id;

    INSERT INTO public.school_report_revisions (
      report_id,
      revision_number,
      status,
      snapshot,
      narrative,
      design,
      data_sources,
      created_by,
      change_reason
    ) VALUES (
      p_report_id,
      v_next_revision,
      'working',
      p_snapshot,
      p_narrative,
      p_design,
      p_data_sources,
      p_actor_user_id,
      'Working draft revision'
    )
    RETURNING * INTO v_working;
    v_created_working := true;
  END IF;

  UPDATE public.school_report_revisions
     SET status = 'published',
         snapshot = p_snapshot,
         narrative = p_narrative,
         design = p_design,
         data_sources = p_data_sources,
         published_by = p_actor_user_id,
         published_at = v_published_at,
         change_reason = COALESCE(NULLIF(BTRIM(p_change_reason), ''), 'Published to school'),
         pdf_hash = p_pdf_hash,
         force_publish_override = p_force_override,
         updated_at = v_published_at
   WHERE id = v_working.id
     AND status = 'working'
  RETURNING * INTO v_published;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_CONFLICT' USING ERRCODE = '40001';
  END IF;

  UPDATE public.school_performance_reports
     SET title = p_title,
         snapshot = p_snapshot,
         narrative = p_narrative,
         design = p_design,
         status = 'published',
         published_at = v_published_at,
         published_by = p_actor_user_id,
         published_revision_number = v_published.revision_number,
         working_revision_number = NULL,
         verification_code = COALESCE(v_report.verification_code, p_verification_code),
         lock_version = v_report.lock_version + 1,
         updated_at = v_published_at
   WHERE id = p_report_id
     AND lock_version = p_expected_lock_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF v_created_working THEN
    INSERT INTO public.school_report_events (
      report_id,
      revision_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      p_report_id,
      v_published.id,
      'revision_created',
      p_actor_user_id,
      jsonb_build_object('revision_number', v_published.revision_number)
    );
  END IF;

  INSERT INTO public.school_report_events (
    report_id,
    revision_id,
    event_type,
    actor_id,
    payload
  ) VALUES (
    p_report_id,
    v_published.id,
    CASE WHEN p_force_override IS NULL THEN 'published' ELSE 'force_published' END,
    p_actor_user_id,
    jsonb_build_object(
      'revision_number', v_published.revision_number,
      'pdf_hash', p_pdf_hash
    ) || CASE
      WHEN p_force_override IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object(
        'override_reason', p_force_override ->> 'reason',
        'missing', COALESCE(p_force_override -> 'missing', '[]'::jsonb)
      )
    END
  );

  RETURN NEXT v_published;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_school_report_revision_atomic(
  uuid, integer, uuid, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_school_report_revision_atomic(
  uuid, integer, uuid, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, text
) TO service_role;

-- Published content is immutable at the database boundary. A publication may
-- move to withdrawn, but its frozen payload and hash cannot be rewritten.
CREATE OR REPLACE FUNCTION public.guard_school_report_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'WITHDRAWN_REPORT_REVISION_IS_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'withdrawn') THEN
    RAISE EXCEPTION 'PUBLISHED_REPORT_REVISION_IS_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IN ('published', 'withdrawn') AND (
    NEW.report_id IS DISTINCT FROM OLD.report_id OR
    NEW.revision_number IS DISTINCT FROM OLD.revision_number OR
    NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
    NEW.narrative IS DISTINCT FROM OLD.narrative OR
    NEW.design IS DISTINCT FROM OLD.design OR
    NEW.data_sources IS DISTINCT FROM OLD.data_sources OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.published_by IS DISTINCT FROM OLD.published_by OR
    NEW.published_at IS DISTINCT FROM OLD.published_at OR
    NEW.pdf_hash IS DISTINCT FROM OLD.pdf_hash OR
    NEW.force_publish_override IS DISTINCT FROM OLD.force_publish_override OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PUBLISHED_REPORT_CONTENT_IS_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_report_revision_immutability_guard
  ON public.school_report_revisions;
CREATE TRIGGER school_report_revision_immutability_guard
BEFORE UPDATE ON public.school_report_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_school_report_revision_immutability();
