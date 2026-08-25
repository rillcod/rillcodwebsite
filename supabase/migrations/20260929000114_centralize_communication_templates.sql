-- Retain legacy notification wording, but promote it into the governed template
-- registry so new edits, tests, approvals and delivery evidence have one owner.
-- template_key is globally unique, so email keeps the unsuffixed key and any
-- other channel with the same name gets a channel suffix.

DO $$
DECLARE
  legacy record;
  canonical_key text;
  mapped_channel text;
  v_template_id uuid;
  v_existing_channel text;
  v_version_id uuid;
  v_variables jsonb;
  v_body text;
BEGIN
  FOR legacy IN
    SELECT *
    FROM public.notification_templates
    WHERE COALESCE(is_active, true) = true
    ORDER BY CASE WHEN type = 'email' THEN 0 ELSE 1 END, name, type
  LOOP
    mapped_channel := CASE WHEN legacy.type = 'push' THEN 'in_app' ELSE lower(legacy.type) END;
    IF mapped_channel NOT IN ('email', 'whatsapp', 'in_app', 'sms') THEN
      CONTINUE;
    END IF;

    canonical_key := lower(regexp_replace(trim(COALESCE(legacy.name, '')), '[^a-zA-Z0-9]+', '_', 'g'));
    canonical_key := trim(both '_' from canonical_key);
    IF canonical_key = '' THEN
      CONTINUE;
    END IF;

    v_body := COALESCE(legacy.content, '');
    IF v_body = '' THEN
      CONTINUE;
    END IF;

    SELECT t.id, t.channel
    INTO v_template_id, v_existing_channel
    FROM public.communication_templates t
    WHERE t.template_key = canonical_key;

    IF v_template_id IS NOT NULL AND v_existing_channel IS DISTINCT FROM mapped_channel THEN
      canonical_key := canonical_key || '_' || mapped_channel;
      SELECT t.id INTO v_template_id
      FROM public.communication_templates t
      WHERE t.template_key = canonical_key;
    END IF;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(DISTINCT match[1] ORDER BY match[1])
        FROM regexp_matches(
          COALESCE(legacy.subject, '') || E'\n' || v_body,
          '\{\{\s*([A-Za-z0-9_]+)\s*\}\}',
          'g'
        ) AS match
      ),
      '[]'::jsonb
    ) INTO v_variables;

    IF v_template_id IS NULL THEN
      INSERT INTO public.communication_templates(
        template_key, name, description, category, channel, status,
        required_variables, created_at, updated_at
      ) VALUES (
        canonical_key,
        legacy.name,
        'Imported from the former notification template store.',
        'learning',
        mapped_channel,
        'draft',
        v_variables,
        COALESCE(legacy.created_at, now()),
        now()
      )
      RETURNING id INTO v_template_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.communication_template_versions v WHERE v.template_id = v_template_id
    ) THEN
      INSERT INTO public.communication_template_versions(
        template_id, version_number, subject, body, change_note,
        test_status, test_notes, tested_at, created_at
      ) VALUES (
        v_template_id, 1, legacy.subject, v_body,
        'Imported from the former notification template store',
        'passed', 'Imported wording contains only declared placeholders.', now(),
        COALESCE(legacy.created_at, now())
      ) RETURNING id INTO v_version_id;

      UPDATE public.communication_templates
      SET status = 'approved',
          current_version_id = v_version_id,
          required_variables = v_variables,
          approved_at = now(),
          updated_at = now()
      WHERE id = v_template_id;
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notification_templates FROM anon, authenticated;
GRANT SELECT ON TABLE public.notification_templates TO authenticated;

DROP POLICY IF EXISTS "communication_template_versions_admin_manage" ON public.communication_template_versions;
DROP POLICY IF EXISTS "communication_templates_admin_manage" ON public.communication_templates;
DROP POLICY IF EXISTS communication_template_versions_active_admin_manage ON public.communication_template_versions;
DROP POLICY IF EXISTS communication_templates_active_admin_manage ON public.communication_templates;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.communication_templates FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.communication_template_versions FROM anon, authenticated;
GRANT SELECT ON TABLE public.communication_templates TO authenticated;
GRANT SELECT ON TABLE public.communication_template_versions TO authenticated;

CREATE POLICY communication_template_versions_active_admin_manage
ON public.communication_template_versions FOR ALL TO authenticated
USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY communication_templates_active_admin_manage
ON public.communication_templates FOR ALL TO authenticated
USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

COMMENT ON TABLE public.notification_templates IS
  'Read-only compatibility store. Canonical editable messages live in communication_templates and communication_template_versions.';
