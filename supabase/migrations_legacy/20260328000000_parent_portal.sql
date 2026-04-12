-- ============================================================
-- Migration: Parent Portal
-- Date: 2026-03-28
-- Description:
--   Adds RLS policies so parents can read their children's data.
--   Parents are linked to students via students.parent_email = parent's email.
--   Also adds invoice_id column to payment_transactions if not present.
-- ============================================================

-- ── Helper function: get current user's email ────────────────
-- Used in RLS policies to link parent email to students.parent_email
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT email FROM public.portal_users WHERE id = auth.uid();
$$;

-- ── Helper function: check if current user is a parent ───────
CREATE OR REPLACE FUNCTION public.is_parent()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE id = auth.uid() AND role = 'parent'
  );
$$;

-- ── Helper function: get student IDs belonging to this parent ─
CREATE OR REPLACE FUNCTION public.get_parent_student_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.portal_users pu ON pu.id = auth.uid()
  WHERE s.parent_email = pu.email
    AND pu.role = 'parent';
$$;

-- ── Helper function: get portal_user IDs of parent's children ─
CREATE OR REPLACE FUNCTION public.get_parent_child_user_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.user_id
  FROM public.students s
  JOIN public.portal_users pu ON pu.id = auth.uid()
  WHERE s.parent_email = pu.email
    AND pu.role = 'parent'
    AND s.user_id IS NOT NULL;
$$;

-- ── Add invoice_id to payment_transactions if missing ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_transactions'
      AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD COLUMN invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Ensure enrollment_type includes 'in_person' on students ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'students_enrollment_type_check'
      AND table_name = 'students'
  ) THEN
    ALTER TABLE public.students DROP CONSTRAINT students_enrollment_type_check;
  END IF;
END $$;
ALTER TABLE public.students
  ADD CONSTRAINT students_enrollment_type_check
  CHECK (enrollment_type = ANY (ARRAY['school','bootcamp','online','in_person']));

-- ============================================================
-- RLS POLICIES FOR PARENT ROLE
-- ============================================================

-- ── 1. portal_users — parents can read their own profile ─────
DROP POLICY IF EXISTS "parent_read_own_profile" ON public.portal_users;
CREATE POLICY "parent_read_own_profile"
  ON public.portal_users FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    AND role = 'parent'
  );

-- ── 2. students — parents can read their children ────────────
DROP POLICY IF EXISTS "parent_read_children" ON public.students;
CREATE POLICY "parent_read_children"
  ON public.students FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND id IN (SELECT public.get_parent_student_ids())
  );

-- ── 3. student_progress_reports — published only ─────────────
DROP POLICY IF EXISTS "parent_read_child_reports" ON public.student_progress_reports;
CREATE POLICY "parent_read_child_reports"
  ON public.student_progress_reports FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND is_published = true
    AND student_id IN (SELECT public.get_parent_student_ids())
  );

-- ── 4. certificates — read children's certificates ───────────
DROP POLICY IF EXISTS "parent_read_child_certificates" ON public.certificates;
CREATE POLICY "parent_read_child_certificates"
  ON public.certificates FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND portal_user_id IN (SELECT public.get_parent_child_user_ids())
  );

-- ── 5. invoices — read children's invoices ───────────────────
DROP POLICY IF EXISTS "parent_read_child_invoices" ON public.invoices;
CREATE POLICY "parent_read_child_invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND portal_user_id IN (SELECT public.get_parent_child_user_ids())
  );

-- ── 6. payments — read children's payments ───────────────────
DROP POLICY IF EXISTS "parent_read_child_payments" ON public.payments;
CREATE POLICY "parent_read_child_payments"
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND student_id IN (SELECT public.get_parent_student_ids())
  );

-- ── 7. attendance — read children's attendance ───────────────
DROP POLICY IF EXISTS "parent_read_child_attendance" ON public.attendance;
CREATE POLICY "parent_read_child_attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND student_id IN (SELECT public.get_parent_student_ids())
  );

-- ── 8. assignment_submissions — read children's submissions ──
DROP POLICY IF EXISTS "parent_read_child_submissions" ON public.assignment_submissions;
CREATE POLICY "parent_read_child_submissions"
  ON public.assignment_submissions FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND portal_user_id IN (SELECT public.get_parent_child_user_ids())
  );

-- ── 9. cbt_sessions — read children's exam sessions ──────────
-- NOTE: cbt_sessions uses "user_id" (not portal_user_id)
DROP POLICY IF EXISTS "parent_read_child_cbt_sessions" ON public.cbt_sessions;
CREATE POLICY "parent_read_child_cbt_sessions"
  ON public.cbt_sessions FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND user_id IN (SELECT public.get_parent_child_user_ids())
  );

-- ── 10. payment_accounts — parents can read bank accounts ────
DROP POLICY IF EXISTS "parent_read_payment_accounts" ON public.payment_accounts;
CREATE POLICY "parent_read_payment_accounts"
  ON public.payment_accounts FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND is_active = true
  );

-- ── 11. payment_transactions — parents can insert + read own ─
DROP POLICY IF EXISTS "parent_insert_payment_transactions" ON public.payment_transactions;
CREATE POLICY "parent_insert_payment_transactions"
  ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_parent()
    AND portal_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "parent_read_own_payment_transactions" ON public.payment_transactions;
CREATE POLICY "parent_read_own_payment_transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND portal_user_id = auth.uid()
  );

-- ── 12. notifications — parents can read their own ───────────
DROP POLICY IF EXISTS "parent_read_own_notifications" ON public.notifications;
CREATE POLICY "parent_read_own_notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "parent_update_own_notifications" ON public.notifications;
CREATE POLICY "parent_update_own_notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    public.is_parent()
    AND user_id = auth.uid()
  );

-- ── 13. class_sessions — parents can read (for attendance) ───
DROP POLICY IF EXISTS "parent_read_class_sessions" ON public.class_sessions;
CREATE POLICY "parent_read_class_sessions"
  ON public.class_sessions FOR SELECT TO authenticated
  USING (public.is_parent());

-- ── 14. classes — parents can read (for attendance context) ──
DROP POLICY IF EXISTS "parent_read_classes" ON public.classes;
CREATE POLICY "parent_read_classes"
  ON public.classes FOR SELECT TO authenticated
  USING (public.is_parent());

-- ── 15. assignments — parents can read (for grades context) ──
DROP POLICY IF EXISTS "parent_read_assignments" ON public.assignments;
CREATE POLICY "parent_read_assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (public.is_parent());

-- ── 16. cbt_exams — parents can read (for grades context) ────
DROP POLICY IF EXISTS "parent_read_cbt_exams" ON public.cbt_exams;
CREATE POLICY "parent_read_cbt_exams"
  ON public.cbt_exams FOR SELECT TO authenticated
  USING (public.is_parent());

-- ── 17. courses — parents can read (for certificate context) ─
DROP POLICY IF EXISTS "parent_read_courses" ON public.courses;
CREATE POLICY "parent_read_courses"
  ON public.courses FOR SELECT TO authenticated
  USING (public.is_parent());

-- ============================================================
-- AUTO-NOTIFICATION TRIGGER: notify parent on invoice payment
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_parent_on_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parent_id UUID;
  v_invoice_number TEXT;
BEGIN
  -- Only fire when status changes TO 'paid'
  IF OLD.status = NEW.status OR NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;

  v_invoice_number := NEW.invoice_number;

  -- Find the parent linked to the child who owns this invoice
  SELECT pu.id INTO v_parent_id
  FROM public.portal_users pu
  JOIN public.students s ON s.parent_email = pu.email
  WHERE s.user_id = NEW.portal_user_id
    AND pu.role = 'parent'
  LIMIT 1;

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read, created_at)
    VALUES (
      v_parent_id,
      'Payment Confirmed & Receipt Issued',
      'Invoice #' || v_invoice_number || ' has been paid. Your receipt has been automatically generated and is available in your portal.',
      'payment',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parent_invoice_paid ON public.invoices;
CREATE TRIGGER trg_notify_parent_invoice_paid
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_parent_on_invoice_paid();

-- ============================================================
-- GRANT EXECUTE on helper functions to authenticated users
-- ============================================================
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_student_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_child_user_ids() TO authenticated;

-- ============================================================
-- ADMIN / TEACHER: PARENT MANAGEMENT POLICIES
-- ============================================================

-- ── admin/teacher can SELECT all parent portal_users ─────────
-- Uses is_admin_or_teacher() (SECURITY DEFINER) to avoid infinite
-- recursion that occurs when a portal_users policy queries portal_users.
DROP POLICY IF EXISTS "staff_read_parent_accounts" ON public.portal_users;
CREATE POLICY "staff_read_parent_accounts"
  ON public.portal_users FOR SELECT TO authenticated
  USING (
    role = 'parent'
    AND public.is_admin_or_teacher()
  );

-- ── admin can INSERT parent portal_users ─────────────────────
DROP POLICY IF EXISTS "admin_insert_parent_accounts" ON public.portal_users;
CREATE POLICY "admin_insert_parent_accounts"
  ON public.portal_users FOR INSERT TO authenticated
  WITH CHECK (
    role = 'parent'
    AND public.is_admin()
  );

-- ── admin can UPDATE parent portal_users ─────────────────────
DROP POLICY IF EXISTS "admin_update_parent_accounts" ON public.portal_users;
CREATE POLICY "admin_update_parent_accounts"
  ON public.portal_users FOR UPDATE TO authenticated
  USING (
    role = 'parent'
    AND public.is_admin()
  );

-- ── admin can DELETE parent portal_users ─────────────────────
DROP POLICY IF EXISTS "admin_delete_parent_accounts" ON public.portal_users;
CREATE POLICY "admin_delete_parent_accounts"
  ON public.portal_users FOR DELETE TO authenticated
  USING (
    role = 'parent'
    AND public.is_admin()
  );

-- ── admin/teacher can UPDATE students parent fields ──────────
-- (parent_email, parent_name, parent_phone, parent_relationship)
-- Uses is_admin_or_teacher() SECURITY DEFINER to avoid recursion.
DROP POLICY IF EXISTS "staff_update_student_parent_fields" ON public.students;
CREATE POLICY "staff_update_student_parent_fields"
  ON public.students FOR UPDATE TO authenticated
  USING (public.is_admin_or_teacher())
  WITH CHECK (public.is_admin_or_teacher());

-- ── admin/teacher/school can SELECT all students (for parent linking) ─
-- Uses is_staff() SECURITY DEFINER (covers admin, teacher, school).
DROP POLICY IF EXISTS "staff_read_all_students_for_parent_link" ON public.students;
CREATE POLICY "staff_read_all_students_for_parent_link"
  ON public.students FOR SELECT TO authenticated
  USING (public.is_staff());

-- ============================================================
-- FUNCTION: create_parent_and_link
-- Creates a parent portal_users row + links to a student.
-- Called by admin/teacher from the API.
-- The Supabase Auth account must be created separately via
-- the Admin API before or after calling this function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_parent_and_link(
  p_email       TEXT,
  p_full_name   TEXT,
  p_phone       TEXT,
  p_student_id  UUID,
  p_relationship TEXT DEFAULT 'Guardian',
  p_auth_user_id UUID DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role TEXT;
  v_parent_id   UUID;
  v_student     RECORD;
BEGIN
  -- Only admin/teacher may call this
  SELECT role INTO v_caller_role
  FROM public.portal_users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only admin or teacher can create parent accounts';
  END IF;

  -- Get student info
  SELECT * INTO v_student FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Upsert parent in portal_users (avoid duplicate emails)
  INSERT INTO public.portal_users (id, email, full_name, role, phone, is_active, created_at, updated_at)
  VALUES (
    COALESCE(p_auth_user_id, gen_random_uuid()),
    p_email,
    p_full_name,
    'parent',
    p_phone,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    phone      = EXCLUDED.phone,
    updated_at = NOW()
  RETURNING id INTO v_parent_id;

  -- Link parent to student
  UPDATE public.students SET
    parent_email        = p_email,
    parent_name         = p_full_name,
    parent_phone        = p_phone,
    parent_relationship = p_relationship,
    updated_at          = NOW()
  WHERE id = p_student_id;

  RETURN json_build_object(
    'parent_id',  v_parent_id,
    'student_id', p_student_id,
    'email',      p_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_parent_and_link TO authenticated;

-- ============================================================
-- FUNCTION: unlink_parent_from_student
-- Clears parent fields on a student record.
-- ============================================================
CREATE OR REPLACE FUNCTION public.unlink_parent_from_student(p_student_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.portal_users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only admin or teacher can unlink parents';
  END IF;

  UPDATE public.students SET
    parent_email        = NULL,
    parent_name         = NULL,
    parent_phone        = NULL,
    parent_relationship = NULL,
    updated_at          = NOW()
  WHERE id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_parent_from_student TO authenticated;

-- ============================================================
-- TEACHER: allow updating parent portal_users (phone/name/is_active)
-- Admins already covered by admin_update_parent_accounts above.
-- Teachers need UPDATE access too so /api/parents/manage PATCH works.
-- ============================================================
DROP POLICY IF EXISTS "teacher_update_parent_accounts" ON public.portal_users;
CREATE POLICY "teacher_update_parent_accounts"
  ON public.portal_users FOR UPDATE TO authenticated
  USING (
    role = 'parent'
    AND public.is_admin_or_teacher()
  );

-- ── students.parent_email must be unique per student for clean linking ────────
-- No unique constraint needed: one student → one parent (enforced by app).
-- Multiple students CAN share the same parent email (siblings) — that is fine.

-- ── Allow parents to see their own portal_users row (for profile page) ───────
-- This supplements the existing parent_read_own_profile policy and covers
-- the case where the policy is role-checked.
-- (Already exists as "parent_read_own_profile" — no change needed.)

-- ── Ensure notifications table has required columns ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN type TEXT DEFAULT 'info';
  END IF;
END $$;
