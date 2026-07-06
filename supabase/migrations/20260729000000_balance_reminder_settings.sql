-- ─────────────────────────────────────────────────────────────────────────────
-- balance_reminder_settings
-- Admin-controllable regulator for the summer-school balance reminder cron: master
-- on/off, cadence, and the per-parent cap — editable from the dashboard instead of
-- env vars. Single row (id = 1). Service-role only (cron + admin API).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.balance_reminder_settings (
  id             smallint    PRIMARY KEY DEFAULT 1,
  enabled        boolean     NOT NULL DEFAULT true,
  every_days     integer     NOT NULL DEFAULT 5,
  max_reminders  integer     NOT NULL DEFAULT 4,
  channel_email  boolean     NOT NULL DEFAULT true,
  channel_whatsapp boolean   NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balance_reminder_settings_single_row CHECK (id = 1)
);

INSERT INTO public.balance_reminder_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.balance_reminder_settings ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (cron + admin API) reads/writes.
