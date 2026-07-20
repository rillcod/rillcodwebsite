-- Central, admin-controlled governance for customer follow-up, retention, and marketing.
-- Cron services only trigger work; this row decides whether each automation may run.
INSERT INTO public.system_settings (
  setting_key,
  setting_value,
  description,
  category,
  is_public,
  updated_at
) VALUES (
  'office_automation_controls',
  '{"customer_followup_enabled":true,"retention_streaks_enabled":true,"marketing_enabled":true,"lead_nurture_enabled":true,"form_followup_enabled":true,"newsletter_auto_publish_enabled":true}',
  'Authoritative controls for customer follow-up, retention, and marketing automation',
  'operations',
  false,
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
