-- Complete the shared controls required for end-to-end customer communication governance.
ALTER TABLE public.communication_cases
  ADD COLUMN IF NOT EXISTS customer_key uuid,
  ADD COLUMN IF NOT EXISTS next_action text NOT NULL DEFAULT 'Review and respond to the customer',
  ADD COLUMN IF NOT EXISTS next_action_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS satisfaction_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS satisfaction_score integer CHECK (satisfaction_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.communication_cases DROP CONSTRAINT IF EXISTS communication_cases_status_check;
ALTER TABLE public.communication_cases ADD CONSTRAINT communication_cases_status_check
  CHECK (status IN ('open','reopened','pending_customer','in_progress','resolved','closed'));
ALTER TABLE public.communication_cases DROP CONSTRAINT IF EXISTS communication_cases_sensitivity_check;
ALTER TABLE public.communication_cases ADD CONSTRAINT communication_cases_sensitivity_check
  CHECK (sensitivity IN ('standard','complaint','privacy','safeguarding','fraud'));
UPDATE public.communication_cases
SET next_action_due_at = COALESCE(next_action_due_at, first_response_due_at)
WHERE status IN ('open','reopened','in_progress') AND next_action_due_at IS NULL;

ALTER TABLE public.communication_case_events
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS automated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS external_thread_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE public.communication_case_events DROP CONSTRAINT IF EXISTS communication_case_events_delivery_status_check;
ALTER TABLE public.communication_case_events ADD CONSTRAINT communication_case_events_delivery_status_check
  CHECK (delivery_status IN ('recorded','queued','sent','delivered','read','failed','suppressed'));
CREATE UNIQUE INDEX IF NOT EXISTS communication_case_events_provider_message_unique
  ON public.communication_case_events(provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.communication_customer_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key uuid NOT NULL DEFAULT gen_random_uuid(),
  identity_type text NOT NULL CHECK (identity_type IN ('portal_user','email','phone')),
  identity_value text NOT NULL,
  portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(identity_type, identity_value)
);
CREATE INDEX IF NOT EXISTS communication_customer_identities_customer_idx
  ON public.communication_customer_identities(customer_key);

CREATE TABLE IF NOT EXISTS public.communication_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.communication_cases(id) ON DELETE SET NULL,
  case_event_id uuid REFERENCES public.communication_case_events(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','in_app','sms','push')),
  recipient text,
  provider text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed','suppressed')),
  automated boolean NOT NULL DEFAULT true,
  template_key text,
  campaign_key text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS communication_delivery_provider_unique
  ON public.communication_delivery_log(provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS communication_delivery_case_idx
  ON public.communication_delivery_log(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_thread_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.communication_cases(id) ON DELETE CASCADE,
  provider text,
  provider_message_id text,
  internet_message_id text,
  subject_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_thread_provider_message_unique ON public.email_thread_links(provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_thread_internet_message_unique ON public.email_thread_links(internet_message_id)
  WHERE internet_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_thread_case_idx ON public.email_thread_links(case_id, created_at DESC);

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('new','reopened','in_progress','resolved','closed'));
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_minutes integer,
  ADD COLUMN IF NOT EXISTS satisfaction_score integer CHECK (satisfaction_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS outcome text;

CREATE TABLE IF NOT EXISTS public.safeguarding_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL UNIQUE REFERENCES public.communication_cases(id) ON DELETE RESTRICT,
  incident_type text NOT NULL CHECK (incident_type IN ('child_safety','privacy','fraud','complaint')),
  risk_level text NOT NULL DEFAULT 'high' CHECK (risk_level IN ('medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','contained','resolved','closed')),
  owner_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  summary text NOT NULL,
  actions_taken text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT 'marketing' CHECK (purpose IN ('marketing','service','retention')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','running','paused','completed','cancelled')),
  owner_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  scheduled_for timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  viewed_count integer NOT NULL DEFAULT 0,
  response_count integer NOT NULL DEFAULT 0,
  conversion_count integer NOT NULL DEFAULT 0,
  suppressed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketing_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE CASCADE,
  identity_type text NOT NULL CHECK (identity_type IN ('portal_user','email','phone')),
  identity_value text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('all','email','whatsapp','sms','push','in_app')),
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'user_preference',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(identity_type, identity_value, channel)
);
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('targeted','suppressed','sent','delivered','viewed','responded','converted','unsubscribed','failed')),
  channel text NOT NULL,
  reason text,
  source_id text,
  value numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_events_campaign_idx ON public.marketing_events(campaign_id, event_type, created_at DESC);

ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.newsletters DROP CONSTRAINT IF EXISTS newsletters_purpose_check;
ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_purpose_check CHECK (purpose IN ('marketing','service','retention'));
ALTER TABLE public.newsletter_delivery
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS suppressed_reason text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.customer_value_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.communication_cases(id) ON DELETE SET NULL,
  feedback_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  outcome_type text NOT NULL CHECK (outcome_type IN ('resolved','helpful','not_helpful','converted','retained','churned')),
  score integer CHECK (score BETWEEN 1 AND 5),
  comment text,
  source text NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeguarding_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_value_outcomes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role = 'admin' AND is_active = true) $$;

CREATE POLICY office_admin_identities ON public.communication_customer_identities FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_delivery ON public.communication_delivery_log FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_email_threads ON public.email_thread_links FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_incidents ON public.safeguarding_incidents FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_campaigns ON public.marketing_campaigns FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_suppressions ON public.marketing_suppressions FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_marketing_events ON public.marketing_events FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY office_admin_outcomes ON public.customer_value_outcomes FOR ALL TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
CREATE POLICY customer_own_outcomes ON public.customer_value_outcomes FOR INSERT TO authenticated WITH CHECK (portal_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_customer_identities, public.communication_delivery_log, public.email_thread_links, public.safeguarding_incidents, public.marketing_campaigns, public.marketing_suppressions, public.marketing_events TO authenticated;
GRANT SELECT, INSERT ON public.customer_value_outcomes TO authenticated;

COMMENT ON TABLE public.communication_delivery_log IS 'Canonical provider delivery and failure state across every outbound channel.';
COMMENT ON TABLE public.communication_customer_identities IS 'Verified aliases joining one customer across app, email, and phone channels.';
COMMENT ON TABLE public.safeguarding_incidents IS 'Restricted human-owned workflow for safeguarding, privacy, fraud, and serious complaints.';
COMMENT ON TABLE public.marketing_events IS 'Attribution and suppression evidence for consent-led campaigns.';
