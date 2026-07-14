-- Keep academic_terms.is_current aligned with live calendar session (year + term).
-- Stops selectors that still show "Current" from a stale is_current row.

CREATE OR REPLACE FUNCTION public.sync_academic_terms_is_current(
  p_now date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live uuid := public.live_academic_term_id(p_now);
BEGIN
  IF v_live IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.academic_terms
  SET is_current = (id = v_live),
      updated_at = now()
  WHERE is_current IS DISTINCT FROM (id = v_live);

  RETURN v_live;
END;
$$;

COMMENT ON FUNCTION public.sync_academic_terms_is_current(date) IS
  'Sets academic_terms.is_current to the live year+term session only.';

GRANT EXECUTE ON FUNCTION public.sync_academic_terms_is_current(date)
  TO authenticated, service_role;

-- Apply immediately so dashboard selectors stop marking a stale term as Current.
SELECT public.sync_academic_terms_is_current(CURRENT_DATE);
