-- Versioned, tested, approved communication template registry.
CREATE TABLE IF NOT EXISTS public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE CHECK (template_key ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'operations',
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app', 'sms')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  required_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_version_id uuid,
  created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.communication_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.communication_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  subject text,
  body text NOT NULL,
  change_note text,
  test_status text NOT NULL DEFAULT 'untested' CHECK (test_status IN ('untested', 'passed', 'failed')),
  test_notes text,
  tested_at timestamptz,
  created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

DO $$ BEGIN
  ALTER TABLE public.communication_templates
    ADD CONSTRAINT communication_templates_current_version_id_fkey
    FOREIGN KEY (current_version_id) REFERENCES public.communication_template_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS communication_templates_status_channel_idx
  ON public.communication_templates(status, channel, category);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_templates_staff_select ON public.communication_templates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role IN ('admin', 'teacher', 'school')));
CREATE POLICY communication_template_versions_staff_select ON public.communication_template_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role IN ('admin', 'teacher', 'school')));
CREATE POLICY communication_templates_admin_manage ON public.communication_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY communication_template_versions_admin_manage ON public.communication_template_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));

GRANT SELECT ON public.communication_templates, public.communication_template_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.communication_templates, public.communication_template_versions TO authenticated;

WITH inserted AS (
  INSERT INTO public.communication_templates (template_key, name, description, category, channel, status, required_variables, approved_at)
  VALUES
    ('case_receipt', 'Customer case receipt', 'Acknowledges a new service request with its reference.', 'customer_service', 'in_app', 'approved', '["customer_name","case_reference"]', now()),
    ('staff_case_followup', 'Staff case follow-up', 'Reminds the assigned owner about an open or overdue case.', 'operations', 'in_app', 'approved', '["case_reference","subject"]', now()),
    ('finance_balance_reminder', 'Finance balance reminder', 'Professional installment balance reminder.', 'finance', 'email', 'approved', '["customer_name","student_name","balance","payment_link"]', now())
  ON CONFLICT (template_key) DO NOTHING
  RETURNING id, template_key
), versions AS (
  INSERT INTO public.communication_template_versions (template_id, version_number, subject, body, change_note, test_status, test_notes, tested_at)
  SELECT id, 1,
    CASE template_key
      WHEN 'case_receipt' THEN 'We received your request {{case_reference}}'
      WHEN 'staff_case_followup' THEN 'Follow-up required for {{case_reference}}'
      ELSE 'Payment reminder for {{student_name}}'
    END,
    CASE template_key
      WHEN 'case_receipt' THEN 'Hello {{customer_name}}, your request has been recorded as {{case_reference}}. Our team will keep you updated.'
      WHEN 'staff_case_followup' THEN '{{case_reference}} requires attention: {{subject}}. Open the service case and record the next action.'
      ELSE 'Hello {{customer_name}}, {{balance}} remains due for {{student_name}}. You can pay securely here: {{payment_link}}.'
    END,
    'Initial governed template', 'passed', 'Seed template variables and rendering validated.', now()
  FROM inserted
  RETURNING id, template_id
)
UPDATE public.communication_templates t
SET current_version_id = v.id, updated_at = now()
FROM versions v
WHERE t.id = v.template_id AND t.current_version_id IS NULL;

COMMENT ON TABLE public.communication_templates IS 'Approved communication identities and current versions.';
COMMENT ON TABLE public.communication_template_versions IS 'Immutable template revisions with test evidence.';
