-- Migration: Create invoice_automation_logs table
-- This table records every run of the invoice-reminders cron job for audit
-- and admin visibility via GET /api/billing/automation/logs.

CREATE TABLE IF NOT EXISTS public.invoice_automation_logs (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by     text         NOT NULL CHECK (triggered_by IN ('cron', 'manual')),
  invoices_scanned integer      NOT NULL DEFAULT 0,
  reminders_sent   integer      NOT NULL DEFAULT 0,
  overdue_marked   integer      NOT NULL DEFAULT 0,
  errors           integer      NOT NULL DEFAULT 0,
  details          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Only ever grows (no updates/deletes) — optimise for append + descending reads
CREATE INDEX IF NOT EXISTS idx_invoice_automation_logs_created_at
  ON public.invoice_automation_logs (created_at DESC);

-- RLS: only the service-role key (admin client) may read/write.
-- No direct user-facing RLS policy is needed because the API route enforces
-- admin-role authentication before proxying the read.
ALTER TABLE public.invoice_automation_logs ENABLE ROW LEVEL SECURITY;

-- Deny all by default (service role bypasses RLS, so the cron insert still works)
-- No explicit policy needed — deny-by-default + service role is the correct pattern.

-- Grant usage to authenticated role is intentionally omitted:
-- all access goes through the Next.js API route using the service role key.
