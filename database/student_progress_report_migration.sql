-- ============================================================
-- RILLCOD ACADEMY — STUDENT PROGRESS REPORT MIGRATION
-- Matches the branded "Student Progress Report" format
-- Run in Supabase SQL Editor
-- Date: 2026-03-05
-- ============================================================

-- ─── 1. student_progress_reports table ─────────────────────
-- One report per student per course/term, filled in by teacher
CREATE TABLE IF NOT EXISTS public.student_progress_reports (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id            uuid    NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  teacher_id            uuid    REFERENCES public.portal_users(id) ON DELETE SET NULL,
  school_id             uuid    REFERENCES public.schools(id) ON DELETE SET NULL,
  course_id             uuid    REFERENCES public.courses(id) ON DELETE SET NULL,

  -- Student Info fields (override / displayed on report)
  student_name          text,
  school_name           text,
  section_class         text,        -- e.g. "BASIC 7 Gold"
  course_name           text,        -- e.g. "Python Programming"

  -- Report meta
  report_date           date    DEFAULT CURRENT_DATE,
  report_term           text    DEFAULT 'Termly',   -- 'Termly', 'Mid-Term', 'Annual'
  report_period         text,        -- e.g. "2025/2026 First Term"
  instructor_name       text,        -- Displayed name on report

  -- Course Progress
  current_module        text,        -- e.g. "Control Statement"
  next_module           text,        -- e.g. "Loops and automation"
  learning_milestones   text[],      -- Array of milestone strings
  course_duration       text,        -- e.g. "12 weeks" or "Termly"

  -- Performance Scores (0-100)
  theory_score          numeric(5,2) DEFAULT 0,
  practical_score       numeric(5,2) DEFAULT 0,
  attendance_score      numeric(5,2) DEFAULT 0,
  overall_score         numeric(5,2) GENERATED ALWAYS AS (
    ROUND((theory_score * 0.4 + practical_score * 0.4 + attendance_score * 0.2), 2)
  ) STORED,

  -- Assessment Summary (text values like "Very Good", "Not Specified", score)
  participation_grade   text,        -- "Excellent", "Very Good", "Good", "Fair", "Poor"
  projects_grade        text,
  homework_grade        text,
  assignments_grade     text,
  overall_grade         text,        -- Computed letter grade stored for display

  -- Instructor Evaluation (Qualitative)
  key_strengths         text,
  areas_for_growth      text,
  instructor_assessment text,        -- Overall narrative

  -- Certificate of Completion
  has_certificate       boolean DEFAULT false,
  certificate_text      text,        -- Custom certificate body text
  course_completed      text,        -- Course they completed, e.g. "Scratch 3.0 Visual Programming"
  proficiency_level     text,        -- "beginner", "intermediate", "advanced"

  -- QR / Verification
  verification_code     text UNIQUE DEFAULT SUBSTRING(gen_random_uuid()::text, 1, 8),
  is_published          boolean DEFAULT false,  -- Teacher publishes → student can see

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.student_progress_reports ENABLE ROW LEVEL SECURITY;

-- Teachers can manage reports for their students
DROP POLICY IF EXISTS "Teachers manage progress reports" ON public.student_progress_reports;
CREATE POLICY "Teachers manage progress reports" ON public.student_progress_reports
  FOR ALL USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
  );

-- Schools can view reports for their students
DROP POLICY IF EXISTS "Schools view own student reports" ON public.student_progress_reports;
CREATE POLICY "Schools view own student reports" ON public.student_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND (pu.role = 'school' AND pu.school_id = student_progress_reports.school_id)
    )
  );

-- Students view their own published reports
DROP POLICY IF EXISTS "Students view own published reports" ON public.student_progress_reports;
CREATE POLICY "Students view own published reports" ON public.student_progress_reports
  FOR SELECT USING (
    student_id = auth.uid() AND is_published = true
  );

-- ─── 2. report_settings table ───────────────────────────────
-- School/teacher branding and default settings
CREATE TABLE IF NOT EXISTS public.report_settings (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id         uuid    REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id        uuid    REFERENCES public.portal_users(id) ON DELETE CASCADE,

  -- Branding
  org_name          text    DEFAULT 'Rillcod Technologies',
  org_tagline       text    DEFAULT 'Excellence in Educational Technology',
  org_address       text    DEFAULT '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City',
  org_phone         text    DEFAULT '08116600091',
  org_email         text    DEFAULT 'rillcod@gmail.com',
  org_website       text    DEFAULT 'www.rillcod.com',
  logo_url          text,

  -- Default report fields
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

-- ─── 3. Seed default report settings for Rillcod ─────────────
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

-- ─── 4. Add missing fields to portal_users if needed ─────────
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS section_class text,    -- e.g. "BASIC 7 Gold"
  ADD COLUMN IF NOT EXISTS current_module text,
  ADD COLUMN IF NOT EXISTS date_of_birth  date;

-- ─── 5. Add section_class to students table if needed ─────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS section text;           -- Section/Class identifier

-- ─── 6. Update trigger for updated_at ─────────────────────────
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

SELECT 'Migration complete: student_progress_reports and report_settings tables created.' AS result;
