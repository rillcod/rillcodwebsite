-- Platform configuration is an admin-owned control plane. Provider secrets must
-- never be readable through the authenticated PostgREST client, and updates must
-- reject stale browser state instead of silently overwriting another admin.
-- Cron and workflow rows stay in this table; only the service role may write them.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_settings', r.policyname);
  END LOOP;
END $$;

CREATE POLICY app_settings_authenticated_read_safe
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND key NOT IN ('openrouter_api_key', 'gemini_api_key')
);

REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_settings FROM authenticated;
GRANT SELECT ON TABLE public.app_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.update_platform_configuration(
  p_actor_id uuid,
  p_changes jsonb
)
RETURNS TABLE(setting_key text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change jsonb;
  v_key text;
  v_value text;
  v_expected timestamptz;
  v_current timestamptz;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.portal_users
    WHERE id = p_actor_id
      AND role = 'admin'
      AND is_active = true
      AND COALESCE(is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active administrator required';
  END IF;

  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At least one setting change is required';
  END IF;

  FOR v_change IN
    SELECT value
    FROM jsonb_array_elements(p_changes)
    ORDER BY value->>'key'
  LOOP
    v_key := v_change->>'key';
    v_value := COALESCE(v_change->>'value', '');
    BEGIN
      v_expected := NULLIF(btrim(COALESCE(v_change->>'expected_updated_at', '')), '')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid setting version for ' || COALESCE(v_key, 'unknown setting');
    END;

    IF v_key NOT IN (
      'openrouter_api_key', 'gemini_api_key', 'pollinations_enabled',
      'ai_free_models', 'brand_primary_color', 'platform_logo_url',
      'lms_teacher_isolation', 'lms_auto_portals', 'lms_gamification_enabled',
      'lms_auto_certificates', 'lms_course_locking', 'show_report_indicator',
      'allow_paste_claim_students', 'lms_messaging_policy',
      'lms_attendance_threshold', 'data_cleanup_policy'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported platform setting: ' || COALESCE(v_key, '(missing)');
    END IF;

    SELECT a.updated_at INTO v_current
    FROM public.app_settings a
    WHERE a.key = v_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_expected IS NULL
         OR date_trunc('milliseconds', v_expected) IS DISTINCT FROM date_trunc('milliseconds', v_current)
      THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Platform configuration changed in another session. Reload and try again.';
      END IF;
      UPDATE public.app_settings
      SET value = v_value, updated_at = v_now
      WHERE key = v_key;
    ELSE
      IF v_expected IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Platform configuration changed in another session. Reload and try again.';
      END IF;
      INSERT INTO public.app_settings(key, value, updated_at)
      VALUES (v_key, v_value, v_now);
    END IF;

    setting_key := v_key;
    updated_at := v_now;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_configuration(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_platform_configuration(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.update_platform_configuration(uuid, jsonb) IS
  'Atomically updates validated app-wide configuration and rejects stale admin browser state.';
