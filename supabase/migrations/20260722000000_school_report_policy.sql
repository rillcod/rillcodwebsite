INSERT INTO public.system_settings (
  setting_key, setting_value, description, category, is_public
)
VALUES (
  'school_report_policy',
  '{}',
  'Authoritative configuration for school performance reports, PDFs and report AI.',
  'reports',
  false
)
ON CONFLICT (setting_key) DO NOTHING;
