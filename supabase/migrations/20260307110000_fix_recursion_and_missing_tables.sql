-- =============================================
-- FIX: Infinite Recursion in Timetable Policies
-- AND: Missing Report, Lesson, and Prospective tables
-- =============================================

-- ─── 1. Fix Timetable Recursion ──────────────────────────────────
-- Drop the problematic policies
DROP POLICY IF EXISTS "teacher_read_timetables" ON public.timetables;
DROP POLICY IF EXISTS "school_read_slots" ON public.timetable_slots;
DROP POLICY IF EXISTS "student_read_slots" ON public.timetable_slots;

-- Re-create teacher_read_timetables WITHOUT querying timetable_slots
-- Teachers see timetables for the school they are assigned to
CREATE POLICY "teacher_read_timetables" ON public.timetables
  FOR SELECT TO authenticated 
  USING (
    school_id IN (SELECT school_id FROM public.portal_users WHERE id = auth.uid() AND role = 'teacher')
  );

-- Re-create slot policies to be safer (though the recursion was caused by the one above)
CREATE POLICY "school_read_slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.timetables t
      JOIN public.portal_users p ON p.school_id = t.school_id
      WHERE t.id = timetable_slots.timetable_id 
        AND p.id = auth.uid() 
        AND p.role = 'school'
    )
  );

CREATE POLICY "student_read_slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.timetables t
      JOIN public.portal_users p ON p.school_id = t.school_id
      WHERE t.id = timetable_slots.timetable_id 
        AND p.id = auth.uid() 
        AND p.role = 'student'
    )
  );

-- ─── 2. Missing Report Tables (from 20260306000002) ──────────────

CREATE TABLE IF NOT EXISTS public.student_progress_reports (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id            uuid    NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  teacher_id            uuid    REFERENCES public.portal_users(id) ON DELETE SET NULL,
  school_id             uuid    REFERENCES public.schools(id) ON DELETE SET NULL,
  course_id             uuid    REFERENCES public.courses(id) ON DELETE SET NULL,
  student_name          text,
  photo_url             text,
  school_name           text,
  section_class         text,
  course_name           text,
  report_date           date    DEFAULT CURRENT_DATE,
  report_term           text    DEFAULT 'Termly',
  report_period         text,
  instructor_name       text,
  current_module        text,
  next_module           text,
  learning_milestones   text[],
  course_duration       text,
  course_completed      text,
  theory_score          numeric(5,2) DEFAULT 0,
  practical_score       numeric(5,2) DEFAULT 0,
  attendance_score      numeric(5,2) DEFAULT 0,
  overall_score         numeric(5,2) GENERATED ALWAYS AS (
    ROUND((theory_score * 0.4 + practical_score * 0.4 + attendance_score * 0.2), 2)
  ) STORED,
  participation_grade   text,
  projects_grade        text,
  homework_grade        text,
  assignments_grade     text,
  overall_grade         text,
  key_strengths         text,
  areas_for_growth      text,
  instructor_assessment text,
  proficiency_level     text,
  has_certificate       boolean DEFAULT false,
  certificate_text      text,
  verification_code     text UNIQUE DEFAULT SUBSTRING(gen_random_uuid()::text, 1, 8),
  is_published          boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spr_student_id ON public.student_progress_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_spr_teacher_id ON public.student_progress_reports(teacher_id);
CREATE INDEX IF NOT EXISTS idx_spr_school_id  ON public.student_progress_reports(school_id);

ALTER TABLE public.student_progress_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage progress reports" ON public.student_progress_reports;
CREATE POLICY "Teachers manage progress reports" ON public.student_progress_reports
  FOR ALL USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Schools view own student reports" ON public.student_progress_reports;
CREATE POLICY "Schools view own student reports" ON public.student_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'school'
        AND pu.school_id = student_progress_reports.school_id
    )
  );

DROP POLICY IF EXISTS "Students view own published reports" ON public.student_progress_reports;
CREATE POLICY "Students view own published reports" ON public.student_progress_reports
  FOR SELECT USING (
    student_id = auth.uid() AND is_published = true
  );

CREATE TABLE IF NOT EXISTS public.report_settings (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id         uuid    REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id        uuid    REFERENCES public.portal_users(id) ON DELETE CASCADE,
  org_name          text    DEFAULT 'Rillcod Technologies',
  org_tagline       text    DEFAULT 'Excellence in Educational Technology',
  org_address       text    DEFAULT '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City',
  org_phone         text    DEFAULT '08116600091',
  org_email         text    DEFAULT 'rillcod@gmail.com',
  org_website       text    DEFAULT 'www.rillcod.com',
  logo_url          text,
  default_term      text    DEFAULT 'Termly',
  default_instructor text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own report settings" ON public.report_settings;
CREATE POLICY "Teachers manage own report settings" ON public.report_settings
  FOR ALL USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "All authenticated can read report settings" ON public.report_settings;
CREATE POLICY "All authenticated can read report settings" ON public.report_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.report_settings (org_name, org_tagline, org_address, org_phone, org_email, org_website)
VALUES (
  'Rillcod Technologies',
  'Excellence in Educational Technology',
  '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City',
  '08116600091',
  'rillcod@gmail.com',
  'www.rillcod.com'
)
ON CONFLICT DO NOTHING;

ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS section_class text,
  ADD COLUMN IF NOT EXISTS current_module text,
  ADD COLUMN IF NOT EXISTS date_of_birth  date;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS section text;

-- ─── 3. Missing Lesson & Prospective (from 20260306000003) ──────

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
  );

CREATE TABLE IF NOT EXISTS public.lesson_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_type   TEXT,
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
  );

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS content_layout JSONB DEFAULT '[]'::jsonb;

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

DROP POLICY IF EXISTS "Public can insert prospective students" ON public.prospective_students;
CREATE POLICY "Public can insert prospective students" ON public.prospective_students
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage prospective students" ON public.prospective_students;
CREATE POLICY "Staff can manage prospective students" ON public.prospective_students
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.portal_users(id);

DROP POLICY IF EXISTS "Teachers can view their own registered students" ON public.students;
CREATE POLICY "Teachers can view their own registered students" ON public.students
  FOR SELECT TO authenticated USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.teacher_schools
      WHERE teacher_schools.teacher_id = auth.uid()
        AND teacher_schools.school_id = students.school_id
    )
    OR EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role = 'admin')
  );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_progress_reports_updated_at ON public.student_progress_reports;
CREATE TRIGGER set_student_progress_reports_updated_at
  BEFORE UPDATE ON public.student_progress_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_report_settings_updated_at ON public.report_settings;
CREATE TRIGGER set_report_settings_updated_at
  BEFORE UPDATE ON public.report_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.student_progress_reports TO authenticated, service_role;
GRANT ALL ON TABLE public.report_settings TO authenticated, service_role;
GRANT ALL ON TABLE public.lesson_plans TO authenticated, service_role;
GRANT ALL ON TABLE public.lesson_materials TO authenticated, service_role;
GRANT ALL ON TABLE public.prospective_students TO authenticated, service_role;
