-- Finance Center subscription form expects plan_name, start_date, end_date, features, etc.
-- Backfill from legacy subscription_plan / current_period_* columns.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name text,
  ADD COLUMN IF NOT EXISTS plan_type text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_students integer,
  ADD COLUMN IF NOT EXISTS max_teachers integer;

UPDATE public.subscriptions
SET
  plan_name = COALESCE(NULLIF(plan_name, ''), subscription_plan),
  start_date = COALESCE(start_date, current_period_start::date),
  end_date = COALESCE(end_date, current_period_end::date),
  features = COALESCE(features, '{}'::jsonb)
WHERE plan_name IS NULL
   OR start_date IS NULL
   OR end_date IS NULL
   OR features IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_school_status
  ON public.subscriptions (school_id, status)
  WHERE school_id IS NOT NULL;
