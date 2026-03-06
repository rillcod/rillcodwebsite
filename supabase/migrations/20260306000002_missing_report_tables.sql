-- =============================================
-- Missing tables: student_progress_reports + report_settings
-- Used by /dashboard/reports/builder and /dashboard/results
-- Defined in complete_schema.sql but not yet applied to remote DB.
-- =============================================

-- ─── 1. student_progress_reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_progress_reports (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id            uuid    NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  teacher_id            uuid    REFERENCES public.portal_users(id) ON DELETE SET NULL,
  school_id             uuid    REFERENCES public.schools(id) ON DELETE SET NULL,
  course_id             uuid    REFERENCES public.courses(id) ON DELETE SET NULL,

  -- Student Info fields (snapshot displayed on report)
  student_name          text,
  photo_url             text,
  school_name           text,
  section_class         text,        -- e.g. "BASIC 7 Gold"
  course_name           text,        -- e.g. "Python Programming"

  -- Report meta
  report_date           date    DEFAULT CURRENT_DATE,
  report_term           text    DEFAULT 'Termly',
  report_period         text,
  instructor_name       text,

  -- Course Progress
  current_module        text,
  next_module           text,
  learning_milestones   text[],
  course_duration       text,
  course_completed      text,

  -- Performance Scores (0-100)
  theory_score          numeric(5,2) DEFAULT 0,
  practical_score       numeric(5,2) DEFAULT 0,
  attendance_score      numeric(5,2) DEFAULT 0,
  overall_score         numeric(5,2) GENERATED ALWAYS AS (
    ROUND((theory_score * 0.4 + practical_score * 0.4 + attendance_score * 0.2), 2)
  ) STORED,

  -- Assessment Summary
  participation_grade   text,
  projects_grade        text,
  homework_grade        text,
  assignments_grade     text,
  overall_grade         text,

  -- Instructor Evaluation
  key_strengths         text,
  areas_for_growth      text,
  instructor_assessment text,
  proficiency_level     text,

  -- Certificate
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

-- ─── 2. report_settings ─────────────────────────────────────────
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

-- ─── 3. Seed default Rillcod org settings ───────────────────────
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

-- ─── 4. Extra portal_users columns used by report builder ───────
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS section_class text,
  ADD COLUMN IF NOT EXISTS current_module text,
  ADD COLUMN IF NOT EXISTS date_of_birth  date;

-- ─── 5. Extra students column ───────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS section text;

-- ─── 6. updated_at triggers ─────────────────────────────────────
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

-- ─── 7. Grants ──────────────────────────────────────────────────
GRANT ALL ON TABLE public.student_progress_reports TO authenticated, service_role;
GRANT ALL ON TABLE public.report_settings TO authenticated, service_role;
