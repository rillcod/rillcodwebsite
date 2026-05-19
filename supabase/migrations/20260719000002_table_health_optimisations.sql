-- ─────────────────────────────────────────────────────────────────────────────
-- Table health: indexes, missing RLS policies, and view-support gaps
-- Covers all tables underlying finance_ledger and student_performance_summary.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── lesson_progress ───────────────────────────────────────────────────────────
-- Had ZERO indexes and only self-select policies. Teachers/admins could not read
-- progress for reporting; the view join on portal_user_id did a full seq-scan.

CREATE INDEX IF NOT EXISTS idx_lesson_progress_portal_user
  ON public.lesson_progress (portal_user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_status
  ON public.lesson_progress (status);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson
  ON public.lesson_progress (lesson_id);

-- Allow staff (admin, teacher, school) to read all progress rows so that
-- student_performance_summary and reporting APIs work correctly.
DROP POLICY IF EXISTS "Staff can view all lesson progress" ON public.lesson_progress;
CREATE POLICY "Staff can view all lesson progress"
  ON public.lesson_progress
  FOR SELECT
  USING (public.is_staff());

-- Allow staff to insert/update progress on behalf of students (e.g. admin resets).
DROP POLICY IF EXISTS "Staff can manage lesson progress" ON public.lesson_progress;
CREATE POLICY "Staff can manage lesson progress"
  ON public.lesson_progress
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());


-- ── payment_transactions ──────────────────────────────────────────────────────
-- Had only a student-own SELECT policy and no indexes. Finance reconciliation
-- API bypasses RLS via service_role, but teachers/school roles lacked visibility
-- for school-scoped financial dashboards. Indexes speed up the ledger view JOINs.

CREATE INDEX IF NOT EXISTS idx_payment_transactions_school_id
  ON public.payment_transactions (school_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_portal_user_id
  ON public.payment_transactions (portal_user_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON public.payment_transactions (payment_status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id
  ON public.payment_transactions (invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at
  ON public.payment_transactions (created_at DESC);

-- School-scoped staff can view their own school's transactions.
DROP POLICY IF EXISTS "Staff can view school transactions" ON public.payment_transactions;
CREATE POLICY "Staff can view school transactions"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR school_id = public.get_my_school_id()
  );


-- ── receipts ──────────────────────────────────────────────────────────────────
-- Missing indexes on the FK columns used in both the view JOIN and RLS filters.

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id
  ON public.receipts (transaction_id);

CREATE INDEX IF NOT EXISTS idx_receipts_school_id
  ON public.receipts (school_id);

CREATE INDEX IF NOT EXISTS idx_receipts_student_id
  ON public.receipts (student_id);


-- ── invoices ──────────────────────────────────────────────────────────────────
-- Missing index on school_id used in the RLS USING clause.

CREATE INDEX IF NOT EXISTS idx_invoices_school_id
  ON public.invoices (school_id);

CREATE INDEX IF NOT EXISTS idx_invoices_portal_user_id
  ON public.invoices (portal_user_id);


-- ── enrollments ───────────────────────────────────────────────────────────────
-- school role was missing a SELECT policy; teachers can see all school enrolments
-- but the school account role had no explicit grant.

DROP POLICY IF EXISTS "School can view own enrollments" ON public.enrollments;
CREATE POLICY "School can view own enrollments"
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff()
    OR user_id = auth.uid()
  );


-- ── cbt_sessions ─────────────────────────────────────────────────────────────
-- 'school' role was not explicitly covered by the staff-view policy; add a
-- compound index to support the view's status IN filter.

CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user_status
  ON public.cbt_sessions (user_id, status);


-- ── assignment_submissions ────────────────────────────────────────────────────
-- Add a compound index for the view's (portal_user_id, status = 'graded') join.

CREATE INDEX IF NOT EXISTS idx_submissions_portal_user_status
  ON public.assignment_submissions (portal_user_id, status);
