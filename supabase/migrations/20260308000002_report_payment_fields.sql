-- =============================================
-- Add payment / school-section fields to student_progress_reports
-- These were used in the builder but were never persisted (missing columns).
-- =============================================

ALTER TABLE public.student_progress_reports
  ADD COLUMN IF NOT EXISTS school_section      text,
  ADD COLUMN IF NOT EXISTS fee_label           text,
  ADD COLUMN IF NOT EXISTS fee_amount          text,
  ADD COLUMN IF NOT EXISTS fee_status          text,
  ADD COLUMN IF NOT EXISTS show_payment_notice boolean NOT NULL DEFAULT false;
