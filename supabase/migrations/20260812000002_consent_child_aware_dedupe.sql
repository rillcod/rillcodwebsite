-- A parent may submit the same form separately for different children. Prevent
-- duplicate submissions by contact + child, rather than contact alone.
BEGIN;

LOCK TABLE public.form_leads IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_count bigint;
BEGIN
  SELECT count(*)
  INTO duplicate_count
  FROM (
    SELECT form_id, contact_key, child_key
    FROM (
      SELECT
        form_id,
        COALESCE(
          NULLIF(lower(btrim(COALESCE(email, response_data->>'parent_email', ''))), ''),
          NULLIF(regexp_replace(COALESCE(response_data->>'parent_whatsapp', ''), '\D', '', 'g'), '')
        ) AS contact_key,
        lower(regexp_replace(btrim(COALESCE(response_data->>'child_name', '')), '\s+', ' ', 'g')) AS child_key
      FROM public.form_leads
    ) normalized
    GROUP BY form_id, contact_key, child_key
    HAVING contact_key IS NOT NULL
       AND child_key <> ''
       AND count(*) > 1
  ) conflicts;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format(
        'Cannot enable child-aware consent deduplication: %s duplicate form/contact/child group(s) require review.',
        duplicate_count
      );
  END IF;
END
$$;

ALTER TABLE public.form_leads
  DROP CONSTRAINT IF EXISTS form_leads_form_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_leads_form_contact_child
  ON public.form_leads (
    form_id,
    COALESCE(
      NULLIF(lower(btrim(COALESCE(email, response_data->>'parent_email', ''))), ''),
      NULLIF(regexp_replace(COALESCE(response_data->>'parent_whatsapp', ''), '\D', '', 'g'), '')
    ),
    lower(regexp_replace(btrim(COALESCE(response_data->>'child_name', '')), '\s+', ' ', 'g'))
  )
  WHERE COALESCE(
    NULLIF(lower(btrim(COALESCE(email, response_data->>'parent_email', ''))), ''),
    NULLIF(regexp_replace(COALESCE(response_data->>'parent_whatsapp', ''), '\D', '', 'g'), '')
  ) IS NOT NULL
  AND btrim(COALESCE(response_data->>'child_name', '')) <> '';

COMMENT ON INDEX public.uq_form_leads_form_contact_child IS
  'Prevents duplicate submissions for the same form, parent contact, and primary child while allowing siblings to be submitted separately.';

COMMIT;
