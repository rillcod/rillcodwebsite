-- ============================================================
-- Migration 009: Fix schema constraints and architecture gaps
-- STEM company model: partner schools + bootcamp + online
-- ============================================================

-- ── 1. Unique constraint for assignment_submissions upsert ───
-- The submitAssignment service upserts using onConflict: 'assignment_id,portal_user_id'
-- This requires a unique constraint on those columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_submissions_assignment_portal_user'
  ) THEN
    ALTER TABLE assignment_submissions
      ADD CONSTRAINT uq_submissions_assignment_portal_user
      UNIQUE (assignment_id, portal_user_id);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
END $$;

-- ── 2. students: add school_id FK to schools table ──────────
-- Links partner-school students to their actual school record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'school_id'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE students
      ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
  END IF;
END $$;

-- ── 3. Backfill school_id from school_name text match ───────
DO $$
BEGIN
  UPDATE students s
  SET school_id = sc.id
  FROM schools sc
  WHERE lower(trim(s.school_name)) = lower(trim(sc.name))
    AND s.school_id IS NULL
    AND s.school_name IS NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Backfill school_id skipped: %', SQLERRM;
END $$;

-- ── 4. schools: ensure status column exists ──────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('active', 'pending', 'suspended', 'inactive'))
    DEFAULT 'active';

-- ── 5. schools: add enrollment_types supported column ────────
-- Tracks which enrollment types the school supports
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS enrollment_types text[]
    DEFAULT ARRAY['school']::text[];

-- ── 6. portal_users: add school_id link (for partner school users) ──
-- Allows portal users from partner schools to be linked to their school
ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_users_school_id
  ON portal_users(school_id);

-- ── 7. Enrollment type index on portal_users ────────────────
-- Students may have an enrollment_type to distinguish their track
ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS enrollment_type text
    CHECK (enrollment_type IN ('school', 'bootcamp', 'online'))
    DEFAULT NULL;

-- ── 8. announcements: ensure created_at exists ──────────────
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ── 9. RLS: ensure schools table has open read policy ───────
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "schools_select_all" ON schools FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "schools_write_admin" ON schools FOR ALL
    USING (EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 10. Notifications table (if not exists) ─────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES portal_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text CHECK (type IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
  is_read boolean DEFAULT false,
  link text, -- optional: href for navigation
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notifications_own" ON notifications FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admins can insert notifications for any user
DO $$ BEGIN
  CREATE POLICY "notifications_admin_insert" ON notifications FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;
