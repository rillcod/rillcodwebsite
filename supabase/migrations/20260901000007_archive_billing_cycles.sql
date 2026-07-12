ALTER TABLE public.billing_cycles ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_billing_cycles_active ON public.billing_cycles(status,due_date) WHERE archived_at IS NULL;
