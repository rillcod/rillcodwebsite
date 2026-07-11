-- Short-lived HMAC-based submission throttling. Raw network addresses must not
-- be persisted in consent response JSON or in the cleanup audit payload.
BEGIN;

CREATE TABLE IF NOT EXISTS public.consent_submission_throttle (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      uuid        NOT NULL
    REFERENCES public.consent_forms(id) ON DELETE CASCADE,
  ip_hmac      text        NOT NULL
    CHECK (ip_hmac ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CONSTRAINT consent_submission_throttle_expiry_check
    CHECK (expires_at > submitted_at)
);

CREATE INDEX IF NOT EXISTS idx_consent_submission_throttle_lookup
  ON public.consent_submission_throttle (
    form_id,
    ip_hmac,
    submitted_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_consent_submission_throttle_expiry
  ON public.consent_submission_throttle (expires_at);

COMMENT ON TABLE public.consent_submission_throttle IS
  'Service-role-only, short-lived consent rate-limit events. ip_hmac is a lowercase HMAC-SHA256 hex digest, never a raw IP address.';

ALTER TABLE public.consent_submission_throttle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.consent_submission_throttle
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.consent_submission_throttle TO service_role;

CREATE TEMP TABLE _consent_privacy_repairs (
  lead_id uuid PRIMARY KEY,
  cleaned_response_data jsonb NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.remove_jsonb_key_recursive(
  p_value jsonb,
  p_key text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_result jsonb;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(
        jsonb_object_agg(
          entry.key,
          pg_temp.remove_jsonb_key_recursive(entry.value, p_key)
        ),
        '{}'::jsonb
      )
        INTO v_result
      FROM jsonb_each(p_value) entry
      WHERE entry.key <> p_key;

      RETURN v_result;

    WHEN 'array' THEN
      SELECT COALESCE(
        jsonb_agg(
          pg_temp.remove_jsonb_key_recursive(entry.value, p_key)
          ORDER BY entry.ordinal
        ),
        '[]'::jsonb
      )
        INTO v_result
      FROM jsonb_array_elements(p_value)
        WITH ORDINALITY AS entry(value, ordinal);

      RETURN v_result;

    ELSE
      RETURN p_value;
  END CASE;
END
$$;

INSERT INTO _consent_privacy_repairs (lead_id, cleaned_response_data)
SELECT
  lead.id,
  pg_temp.remove_jsonb_key_recursive(lead.response_data, '_ip')
FROM public.form_leads lead
WHERE pg_temp.remove_jsonb_key_recursive(
        lead.response_data,
        '_ip'
      ) IS DISTINCT FROM lead.response_data;

WITH repaired AS (
  UPDATE public.form_leads lead
  SET response_data = repair.cleaned_response_data
  FROM _consent_privacy_repairs repair
  WHERE lead.id = repair.lead_id
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'legacy_consent_raw_ip_removed',
  'form_leads',
  repair.lead_id,
  'form_lead',
  repair.lead_id::text,
  jsonb_build_object(
    'contained_legacy_ip', true,
    'raw_value_archived', false
  ),
  jsonb_build_object(
    'all_ip_keys_removed', true
  ),
  now()
FROM _consent_privacy_repairs repair
JOIN repaired ON repaired.id = repair.lead_id;

CREATE OR REPLACE FUNCTION public.enforce_canonical_consent_response_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.response_data ? 'child_matches' OR NEW.response_data ? '_ip' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'response_data.child_matches and response_data._ip are retired; use canonical relational stores';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.response_data ? 'submission_snapshot'
     AND NEW.response_data->'submission_snapshot'
         IS DISTINCT FROM OLD.response_data->'submission_snapshot' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'response_data.submission_snapshot is immutable';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_canonical_consent_response_data
  ON public.form_leads;
CREATE TRIGGER trg_enforce_canonical_consent_response_data
  BEFORE INSERT OR UPDATE OF response_data
  ON public.form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_consent_response_data();

COMMIT;
