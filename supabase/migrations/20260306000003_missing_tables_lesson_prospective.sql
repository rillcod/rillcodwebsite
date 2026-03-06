-- =============================================
-- Missing tables:
--   lesson_plans     (used by /dashboard/lessons/[id] and /edit)
--   lesson_materials (used by /dashboard/lessons/[id] and /edit)
--   prospective_students (used by /dashboard/approvals)
-- Also: add content_layout column to lessons
-- =============================================

-- ─── 1. lesson_plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  objectives          TEXT,
  activities          TEXT,
  assessment_methods  TEXT,
  staff_notes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT lesson_plans_lesson_id_unique UNIQUE (lesson_id)
);

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_plans" ON public.lesson_plans;
CREATE POLICY "staff_read_plans" ON public.lesson_plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

DROP POLICY IF EXISTS "staff_write_plans" ON public.lesson_plans;
CREATE POLICY "staff_write_plans" ON public.lesson_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- ─── 2. lesson_materials ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lesson_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_type   TEXT,  -- 'pdf', 'video', 'link', 'image', 'document'
  is_public   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_public_materials" ON public.lesson_materials;
CREATE POLICY "read_public_materials" ON public.lesson_materials
  FOR SELECT USING (
    is_public = TRUE
    OR EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

DROP POLICY IF EXISTS "staff_write_materials" ON public.lesson_materials;
CREATE POLICY "staff_write_materials" ON public.lesson_materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- ─── 3. content_layout column on lessons ────────────────────────
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS content_layout JSONB DEFAULT '[]'::jsonb;

-- ─── 4. prospective_students ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospective_students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  age                 INTEGER,
  gender              TEXT,
  grade               TEXT,
  school_name         TEXT,
  school_id           UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  parent_name         TEXT,
  parent_email        TEXT,
  parent_phone        TEXT,
  course_interest     TEXT,
  preferred_schedule  TEXT,
  hear_about_us       TEXT,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.prospective_students ENABLE ROW LEVEL SECURITY;

-- Public can register as prospective students
CREATE POLICY "Public can insert prospective students" ON public.prospective_students
  FOR INSERT WITH CHECK (true);

-- Staff can manage
CREATE POLICY "Staff can manage prospective students" ON public.prospective_students
  FOR ALL USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role = 'teacher'
  ));

-- ─── 5. students.created_by column ──────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.portal_users(id);

-- Teachers can view students they created or from their assigned schools
DROP POLICY IF EXISTS "Teachers can view their own registered students" ON public.students;
CREATE POLICY "Teachers can view their own registered students" ON public.students
  FOR SELECT TO authenticated USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.teacher_schools
      WHERE teacher_schools.teacher_id = auth.uid()
        AND teacher_schools.school_id = students.school_id
    )
    OR public.is_admin()
  );

-- ─── 6. Grants ──────────────────────────────────────────────────
GRANT ALL ON TABLE public.lesson_plans TO authenticated, service_role;
GRANT ALL ON TABLE public.lesson_materials TO authenticated, service_role;
GRANT ALL ON TABLE public.prospective_students TO authenticated, service_role;
