-- Durable cron health, execution history, and notification dead-letter recovery.
CREATE TABLE IF NOT EXISTS public.cron_job_health (
  job_name text PRIMARY KEY,
  expected_interval_minutes integer NOT NULL CHECK (expected_interval_minutes > 0),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  next_expected_at timestamptz,
  last_status_code integer,
  last_duration_ms integer,
  last_error text,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_alerted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cron_run_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  success boolean NOT NULL,
  status_code integer,
  error text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cron_run_history_job_created_idx
  ON public.cron_run_history(job_name, created_at DESC);

INSERT INTO public.cron_job_health (job_name, expected_interval_minutes) VALUES
  ('billing-reminders', 1440),
  ('invoice-reminders', 1440),
  ('lead-nurture', 1440),
  ('live-session-reminders', 15),
  ('onboarding-sweep', 15),
  ('payment-reminders', 1440),
  ('process-certificates', 60),
  ('process-notifications', 1),
  ('receipt-sweep', 60),
  ('streak-reminder', 15),
  ('term-scheduler', 10080),
  ('weekly-summary', 10080)
ON CONFLICT (job_name) DO UPDATE SET
  expected_interval_minutes = EXCLUDED.expected_interval_minutes,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.notification_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'notification_queue',
  job_type text NOT NULL,
  original_job_id text,
  user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retrying', 'resolved', 'ignored')),
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_dead_letters_status_created_idx
  ON public.notification_dead_letters(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notification_dead_letters_original_job_unique
  ON public.notification_dead_letters(source, original_job_id)
  WHERE original_job_id IS NOT NULL AND status IN ('pending', 'retrying');

ALTER TABLE public.cron_job_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_run_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_job_health_admin_select ON public.cron_job_health;
CREATE POLICY cron_job_health_admin_select ON public.cron_job_health
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS cron_run_history_admin_select ON public.cron_run_history;
CREATE POLICY cron_run_history_admin_select ON public.cron_run_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS notification_dead_letters_admin_select ON public.notification_dead_letters;
CREATE POLICY notification_dead_letters_admin_select ON public.notification_dead_letters
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS notification_dead_letters_admin_update ON public.notification_dead_letters;
CREATE POLICY notification_dead_letters_admin_update ON public.notification_dead_letters
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_users p WHERE p.id = auth.uid() AND p.role = 'admin'));

GRANT SELECT ON public.cron_job_health TO authenticated;
GRANT SELECT ON public.cron_run_history TO authenticated;
GRANT SELECT, UPDATE ON public.notification_dead_letters TO authenticated;

COMMENT ON TABLE public.cron_job_health IS 'Latest health state for each externally triggered application cron.';
COMMENT ON TABLE public.cron_run_history IS 'Append-only application cron execution history.';
COMMENT ON TABLE public.notification_dead_letters IS 'Durable failures requiring admin retry or resolution.';
