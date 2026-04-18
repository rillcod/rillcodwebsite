-- =============================================================================
-- HARMONISED CONSOLIDATED INCREMENTS (single source after baseline)
-- =============================================================================
-- Replaces the following shard migrations (now in ../migrations_legacy/):
--   20260317000000_registration_history.sql
--   20260317000001_newsletters.sql
--   20260317000002_lab_projects.sql
--   20260317000003_schema_refinements.sql
--   20260320000000_new_features.sql
--   20260327000000_add_in_person_enrollment_type.sql
--   20260328000000_parent_portal.sql
--   20260329_parent_feedback.sql
--   20260330_app_settings.sql
--   20260330_report_publish_notification.sql
--   20260404_project_groups.sql
--   20260404_whatsapp_groups.sql
--   20260406_course_locking.sql
--   20260406_files_storage_provider_r2.sql
--   20260407_weighted_grading.sql
--
-- Baseline (unchanged): migrations/00000000000000_complete_schema.sql
--
-- REMOTE SYNC: If your hosted DB already applied the OLD shard filenames,
-- run: npx supabase db pull   OR   npx supabase migration repair --status reverted <versions>
-- then push this repo. See migrations_legacy/README_SYNC.txt
--
-- Idempotency: uses IF NOT EXISTS / DROP IF EXISTS where originals did;
-- for a clean local reset: npm run supabase:start && npm run db:reset
-- =============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260317000000_registration_history.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Create registration_batches table
CREATE TABLE IF NOT EXISTS "public"."registration_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" REFERENCES auth.users(id),
    "school_id" "uuid",
    "school_name" "text",
    "program_id" "uuid",
    "class_id" "uuid",
    "class_name" "text",
    "student_count" integer DEFAULT 0,
    CONSTRAINT "registration_batches_pkey" PRIMARY KEY ("id")
);

-- Create registration_results table
CREATE TABLE IF NOT EXISTS "public"."registration_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "class_name" "text",
    "status" "text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "registration_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registration_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."registration_batches"("id") ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE "public"."registration_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."registration_results" ENABLE ROW LEVEL SECURITY;

-- Policies for registration_batches
CREATE POLICY "Users can view their own batches or admin can view all" 
ON "public"."registration_batches" FOR SELECT
USING (auth.uid() = created_by OR current_user_role() = 'admin');

CREATE POLICY "Admins and teachers can insert batches" 
ON "public"."registration_batches" FOR INSERT
WITH CHECK (current_user_role() IN ('admin', 'teacher'));

-- Policies for registration_results
CREATE POLICY "Users can view results for batches they can see" 
ON "public"."registration_results" FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.registration_batches 
    WHERE id = batch_id 
    AND (created_by = auth.uid() OR current_user_role() = 'admin')
));

CREATE POLICY "Admins and teachers can insert results" 
ON "public"."registration_results" FOR INSERT
WITH CHECK (current_user_role() IN ('admin', 'teacher'));


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260317000001_newsletters.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Newsletters table
CREATE TABLE IF NOT EXISTS newsletters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Markdown/HTML content
    image_url TEXT,
    author_id UUID REFERENCES portal_users(id),
    status TEXT DEFAULT 'draft', -- draft, published
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- Newsletter delivery tracking (for View-Once popups)
CREATE TABLE IF NOT EXISTS newsletter_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    is_viewed BOOLEAN DEFAULT false,
    delivered_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(newsletter_id, user_id)
);

-- RLS
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_delivery ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins can manage newsletters" ON newsletters
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can manage delivery" ON newsletter_delivery
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );

-- Users can view published newsletters they are recipients of
CREATE POLICY "Users can view their newsletters" ON newsletters
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM newsletter_delivery 
            WHERE newsletter_id = newsletters.id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view/update their delivery status" ON newsletter_delivery
    FOR ALL TO authenticated USING (user_id = auth.uid());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260317000002_lab_projects.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Create a table for saving lab/playground projects
CREATE TABLE IF NOT EXISTS lab_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    language TEXT NOT NULL, -- 'javascript', 'python', 'html', 'scratch', 'robotics'
    code TEXT,
    blocks_xml TEXT, -- For Blockly state
    preview_url TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lab_projects
ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;

COMMENT ON COLUMN lab_projects.lesson_id IS 'Associates this project with a specific lesson';
COMMENT ON COLUMN lab_projects.assignment_id IS 'Associates this project with a specific assignment';

-- Helper for lab management
CREATE OR REPLACE FUNCTION is_admin_or_teacher() RETURNS boolean AS $$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher') FROM public.portal_users WHERE id = auth.uid());
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS
ALTER TABLE lab_projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own projects" ON lab_projects
    FOR SELECT USING (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can create their own projects" ON lab_projects
    FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can update their own projects" ON lab_projects
    FOR UPDATE USING (auth.uid() = user_id OR is_admin_or_teacher());

CREATE POLICY "Users can delete their own projects" ON lab_projects
    FOR DELETE USING (auth.uid() = user_id OR is_admin_or_teacher());

-- If someone makes a project public, others can see it
CREATE POLICY "Public projects are viewable by all" ON lab_projects
    FOR SELECT USING (is_public = true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260317000003_schema_refinements.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration Refinement for Announcements and Newsletters
-- 20260317000003_schema_refinements.sql

-- 1. Update announcements target_audience constraint to include 'schools'
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_target_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_target_audience_check 
    CHECK (target_audience = ANY (ARRAY['all', 'students', 'teachers', 'admins', 'schools']));

-- 2. Add school_id to announcements for better scoping
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 3. Add school_id to newsletters for better scoping
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 4. Update announcements RLS Policies
DROP POLICY IF EXISTS "All users can view announcements" ON announcements;
DROP POLICY IF EXISTS "Public can view announcements" ON announcements;

-- Everyone can see active announcements that are either global (admin author) or from their school
CREATE POLICY "Users can view relevant announcements" ON announcements
FOR SELECT TO authenticated
USING (
    is_active = true 
    AND (
        -- Global announcements from admin
        EXISTS (SELECT 1 FROM portal_users WHERE id = announcements.author_id AND role = 'admin')
        OR
        -- School-specific announcements
        EXISTS (
            SELECT 1 FROM portal_users u 
            WHERE u.id = auth.uid() 
            AND (
                -- Same school as author
                EXISTS (SELECT 1 FROM portal_users author WHERE author.id = announcements.author_id AND author.school_id = u.school_id)
                OR
                -- Attached directly to the same school
                announcements.school_id = u.school_id
            )
        )
    )
);

-- 5. Update Newsletters RLS Policies to allow School Partners
DROP POLICY IF EXISTS "Admins can manage newsletters" ON newsletters;

CREATE POLICY "Staff can manage newsletters" ON newsletters
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM portal_users 
        WHERE id = auth.uid() 
        AND (
            role = 'admin' 
            OR (role = 'school' AND (id = newsletters.author_id OR school_id = newsletters.school_id))
        )
    )
);

-- 6. Update lab_projects to use is_staff helper
DROP POLICY IF EXISTS "Users can view their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON lab_projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON lab_projects;

CREATE POLICY "Access projects" ON lab_projects
    FOR ALL TO authenticated USING (
        auth.uid() = user_id 
        OR EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
    );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260320000000_new_features.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- Migration: New features — CBT metadata/school_id, engage_posts, vault_items
-- Created: 2026-03-20
-- ============================================================

-- 1. Add metadata and school_id columns to cbt_exams
--    metadata: stores section_weights and any future exam-level config (JSONB)
--    school_id: allows scoping exams to a specific school
ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS metadata      JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS school_id     UUID     REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cbt_exams_school ON public.cbt_exams USING btree (school_id);

-- 2. Add section column to cbt_questions (stored inside existing metadata JSONB)
--    No schema change needed — section is stored in metadata->>'section'
--    This comment documents the convention.

-- 3. Create engage_posts table — community code/discussion posts
CREATE TABLE IF NOT EXISTS public.engage_posts (
  id           UUID        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  code_snippet TEXT        DEFAULT NULL,
  language     TEXT        DEFAULT NULL,
  likes        INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.engage_posts OWNER TO postgres;

-- RLS
ALTER TABLE public.engage_posts ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read posts
CREATE POLICY "engage_posts_select" ON public.engage_posts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only owner can insert their own posts
CREATE POLICY "engage_posts_insert" ON public.engage_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only owner can update their own posts (e.g. likes optimistic update is done via service role or RPC; for simplicity allow all authenticated for likes)
CREATE POLICY "engage_posts_update" ON public.engage_posts
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Only owner can delete
CREATE POLICY "engage_posts_delete" ON public.engage_posts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_engage_posts_user    ON public.engage_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_engage_posts_created ON public.engage_posts USING btree (created_at DESC);

-- 4. Create vault_items table — personal code snippet vault
CREATE TABLE IF NOT EXISTS public.vault_items (
  id          UUID        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  language    TEXT        NOT NULL DEFAULT 'javascript',
  code        TEXT        NOT NULL,
  description TEXT        DEFAULT NULL,
  tags        TEXT[]      DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vault_items OWNER TO postgres;

-- RLS
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

-- Only owner can access their own vault items
CREATE POLICY "vault_items_owner" ON public.vault_items
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vault_items_user    ON public.vault_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_created ON public.vault_items USING btree (created_at DESC);

-- 5. Add lesson_id to assignments (links an assignment to a specific lesson)
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id ON public.assignments USING btree (lesson_id);

-- 6. Expression index on certificates.metadata->>'school_id' to speed up
--    filtered queries (was causing ~1200ms SLOW_REQUEST on GET /api/certificates)
CREATE INDEX IF NOT EXISTS idx_certificates_metadata_school_id
  ON public.certificates ((metadata->>'school_id'));

CREATE INDEX IF NOT EXISTS idx_certificates_created_at
  ON public.certificates USING btree (created_at DESC);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260327000000_add_in_person_enrollment_type.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Add 'in_person' to the enrollment_type CHECK constraints on both
-- students and portal_users tables.
--
-- The existing constraint only allowed: school | bootcamp | online
-- In-person centre registrations were failing with a CHECK violation
-- because the code defaults to 'in_person' and the fees table includes it.

-- students table
ALTER TABLE "public"."students"
  DROP CONSTRAINT IF EXISTS "students_enrollment_type_check";

ALTER TABLE "public"."students"
  ADD CONSTRAINT "students_enrollment_type_check"
  CHECK (enrollment_type = ANY (ARRAY['school'::text, 'bootcamp'::text, 'online'::text, 'in_person'::text]));

-- portal_users table
ALTER TABLE "public"."portal_users"
  DROP CONSTRAINT IF EXISTS "portal_users_enrollment_type_check";

ALTER TABLE "public"."portal_users"
  ADD CONSTRAINT "portal_users_enrollment_type_check"
  CHECK (enrollment_type = ANY (ARRAY['school'::text, 'bootcamp'::text, 'online'::text, 'in_person'::text]));


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260328000000_parent_portal.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260329_parent_feedback.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Parent feedback table
create table if not exists public.parent_feedback (
  id           uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.portal_users(id) on delete cascade,
  category     text not null default 'General Experience',
  rating       smallint check (rating between 1 and 5),
  message      text not null,
  is_anonymous boolean not null default false,
  status       text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes
create index if not exists parent_feedback_portal_user_id_idx on public.parent_feedback(portal_user_id);
create index if not exists parent_feedback_status_idx on public.parent_feedback(status);
create index if not exists parent_feedback_created_at_idx on public.parent_feedback(created_at desc);

-- RLS
alter table public.parent_feedback enable row level security;

-- Parents can insert their own feedback
create policy "Parents can insert own feedback"
  on public.parent_feedback for insert
  to authenticated
  with check (portal_user_id = auth.uid());

-- Parents can view their own feedback
create policy "Parents can view own feedback"
  on public.parent_feedback for select
  to authenticated
  using (portal_user_id = auth.uid());

-- Admin and teacher can view all feedback
create policy "Staff can view all feedback"
  on public.parent_feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

-- Admin and teacher can update status
create policy "Staff can update feedback status"
  on public.parent_feedback for update
  to authenticated
  using (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

-- Auto-update updated_at
create or replace function public.update_parent_feedback_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parent_feedback_updated_at on public.parent_feedback;
create trigger parent_feedback_updated_at
  before update on public.parent_feedback
  for each row execute function public.update_parent_feedback_updated_at();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260330_app_settings.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- App-wide key/value settings table (used for AI API key, etc.)
create table if not exists app_settings (
  key   text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Only admins can read/write; mobile app reads via service role through supabase client
alter table app_settings enable row level security;

-- All authenticated users can read (needed so AI features work for students/teachers)
create policy "Authenticated read app_settings"
  on app_settings for select
  using (auth.uid() is not null);

-- Admins and teachers can insert/update/delete
create policy "Staff write app_settings"
  on app_settings for all
  using (
    exists (
      select 1 from portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

-- Placeholder row so the AI screen doesn't show "not configured" after migration
-- Replace the empty string with your actual OpenRouter API key via the Settings screen
insert into app_settings (key, value)
values ('openrouter_api_key', '')
on conflict (key) do nothing;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260330_report_publish_notification.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Migration: Notify parent when a student progress report is published
-- Fires on UPDATE to student_progress_reports when is_published flips to TRUE
-- Looks up the parent via students.parent_email → portal_users.id
-- Inserts an in-app notification for the parent

CREATE OR REPLACE FUNCTION notify_parent_on_report_publish()
RETURNS TRIGGER AS $$
DECLARE
  v_student_name  TEXT;
  v_parent_id     UUID;
  v_action_url    TEXT;
BEGIN
  -- Only act when is_published goes from false/null → true
  IF (NEW.is_published IS TRUE) AND (OLD.is_published IS NOT TRUE) THEN

    -- Resolve student name from portal_users (student_id = portal_users.id)
    SELECT full_name INTO v_student_name
    FROM portal_users
    WHERE id = NEW.student_id
    LIMIT 1;

    -- Find the parent portal_users.id via students.parent_email
    SELECT pu.id INTO v_parent_id
    FROM students s
    JOIN portal_users pu ON pu.email = s.parent_email
    WHERE s.user_id = NEW.student_id
      AND pu.role = 'parent'
    LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
      v_action_url := '/dashboard/parent-results?student=' || NEW.student_id::TEXT;

      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        is_read,
        action_url,
        notification_channel,
        delivery_status,
        created_at,
        updated_at
      ) VALUES (
        v_parent_id,
        'Report Card Published',
        COALESCE(v_student_name, 'Your child') || '''s ' ||
          COALESCE(NEW.report_term, 'term') || ' report card for ' ||
          COALESCE(NEW.course_name, 'a course') || ' has been published.',
        'info',
        false,
        v_action_url,
        'in_app',
        'sent',
        NOW(),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_report_publish_notify ON student_progress_reports;

CREATE TRIGGER trg_report_publish_notify
  AFTER UPDATE ON student_progress_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_parent_on_report_publish();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260404_project_groups.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Project Groups: staff distribute students from the same class into groups,
-- evaluate collectively (group score applied to all) or individually.

CREATE TABLE IF NOT EXISTS project_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  assignment_id   UUID REFERENCES assignments(id) ON DELETE SET NULL,
  class_id        UUID REFERENCES classes(id)     ON DELETE SET NULL,
  class_name      TEXT,
  school_id       UUID REFERENCES schools(id)     ON DELETE SET NULL,
  school_name     TEXT,
  created_by      UUID REFERENCES portal_users(id),
  evaluation_type TEXT NOT NULL DEFAULT 'individual'
                    CHECK (evaluation_type IN ('individual', 'group')),
  -- Shared score when evaluation_type = 'group'
  group_score     NUMERIC(5,2),
  group_feedback  TEXT,
  is_graded       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_group_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES portal_users(id),
  -- Per-member override score (only used when evaluation_type = 'individual')
  individual_score NUMERIC(5,2),
  individual_feedback TEXT,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_groups_assignment ON project_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_class     ON project_groups(class_id);
CREATE INDEX IF NOT EXISTS idx_pg_members_group         ON project_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_pg_members_student       ON project_group_members(student_id);

-- RLS
ALTER TABLE project_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_group_members ENABLE ROW LEVEL SECURITY;

-- Staff can do everything on project_groups
CREATE POLICY "staff_all_project_groups" ON project_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- Students can read their own group(s)
CREATE POLICY "student_read_own_groups" ON project_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_group_members
      WHERE group_id = project_groups.id AND student_id = auth.uid()
    )
  );

-- Staff can manage members
CREATE POLICY "staff_all_group_members" ON project_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- Students can read members of their own group only (not other groups)
CREATE POLICY "student_read_own_group_members" ON project_group_members
  FOR SELECT USING (
    group_id IN (
      SELECT group_id FROM project_group_members WHERE student_id = auth.uid()
    )
  );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260404_whatsapp_groups.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- WhatsApp group links shared across staff at the same school
create table if not exists public.whatsapp_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  link        text not null,
  school_id   uuid references public.schools(id) on delete cascade,
  created_by  uuid references public.portal_users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Staff can read groups belonging to their school
alter table public.whatsapp_groups enable row level security;

create policy "staff can view their school groups"
  on public.whatsapp_groups for select
  using (
    auth.uid() in (
      select id from public.portal_users
      where role in ('admin','teacher','school')
      and (role = 'admin' or school_id = whatsapp_groups.school_id)
    )
  );

create policy "staff can insert groups"
  on public.whatsapp_groups for insert
  with check (
    auth.uid() in (
      select id from public.portal_users where role in ('admin','teacher','school')
    )
  );

create policy "creator or admin can delete"
  on public.whatsapp_groups for delete
  using (
    auth.uid() = created_by
    or auth.uid() in (select id from public.portal_users where role = 'admin')
  );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260406_course_locking.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Course locking: teacher can lock a course so students cannot see or access it
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN courses.is_locked IS
  'When true, the course is hidden from students. Teachers/admins can still see it. '
  'Use this to control which courses students can focus on at any given time.';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260406_files_storage_provider_r2.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Widen storage_provider check to include 'r2' (Cloudflare R2, S3-compatible)
-- The original constraint only allowed 's3' | 'cloudinary'
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_storage_provider_check;
ALTER TABLE files ADD CONSTRAINT files_storage_provider_check
  CHECK (storage_provider = ANY (ARRAY['s3'::"text", 'r2'::"text", 'cloudinary'::"text"]));

-- Normalise any rows inserted with 'r2' before the code was fixed to use 's3'
UPDATE files SET storage_provider = 's3' WHERE storage_provider = 'r2';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SECTION: 20260407_weighted_grading.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Weighted grading: each assignment/project has a "weight" (report contribution in points)
-- and each submission stores a computed weighted_score

-- Add weight to assignments (0 = not counted toward report)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 0;

-- Add weighted_score to assignment_submissions
-- Computed as: round((grade / max_points) * weight) — always a whole number
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS weighted_score INTEGER;


