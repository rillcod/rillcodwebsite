-- Keep school adoption records academic-session sensitive automatically.

CREATE OR REPLACE FUNCTION public.sync_academic_curriculum_adoption_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release public.academic_curriculum_releases%ROWTYPE;
BEGIN
  SELECT * INTO v_release
  FROM public.academic_curriculum_releases
  WHERE id = NEW.release_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Official curriculum edition not found';
  END IF;
  IF v_release.course_id IS DISTINCT FROM NEW.course_id THEN
    RAISE EXCEPTION 'Official curriculum edition belongs to a different course';
  END IF;
  NEW.academic_session := v_release.academic_session;
  SELECT at.id INTO NEW.effective_academic_term_id
  FROM public.academic_terms at
  WHERE at.academic_year = v_release.academic_session
    AND at.term_number = v_release.effective_term_number
  ORDER BY at.is_current DESC, at.created_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_academic_curriculum_adoption_context
  ON public.academic_curriculum_adoptions;
CREATE TRIGGER trg_sync_academic_curriculum_adoption_context
BEFORE INSERT OR UPDATE OF release_id, course_id
ON public.academic_curriculum_adoptions
FOR EACH ROW EXECUTE FUNCTION public.sync_academic_curriculum_adoption_context();

GRANT EXECUTE ON FUNCTION public.sync_academic_curriculum_adoption_context() TO service_role;
