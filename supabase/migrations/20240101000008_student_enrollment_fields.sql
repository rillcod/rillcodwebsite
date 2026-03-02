-- Migration 008: Add enrollment type and student email to students table
-- Supports: partner school, summer bootcamp, and online school registrations

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'enrollment_type'
  ) THEN
    ALTER TABLE public.students
      ADD COLUMN enrollment_type text
        CHECK (enrollment_type IN ('school', 'bootcamp', 'online'))
        DEFAULT 'school';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'student_email'
  ) THEN
    ALTER TABLE public.students ADD COLUMN student_email text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'heard_about_us'
  ) THEN
    ALTER TABLE public.students ADD COLUMN heard_about_us text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'parent_relationship'
  ) THEN
    ALTER TABLE public.students ADD COLUMN parent_relationship text;
  END IF;
END $$;

-- Index enrollment_type for admin filtering
CREATE INDEX IF NOT EXISTS idx_students_enrollment_type
  ON public.students(enrollment_type);
