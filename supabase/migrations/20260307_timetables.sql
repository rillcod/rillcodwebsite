-- ──────────────────────────────────────────────────────────────────────────────
-- Timetable system for Rillcod Academy
-- Supports: multi-school, Primary/Secondary sections, per-teacher scheduling
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID REFERENCES schools(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,                         -- e.g. "2025 First Term — Primary"
  section      TEXT,                                  -- 'Primary' | 'Secondary' | 'Unified'
  academic_year TEXT,                                 -- e.g. '2025/2026'
  term         TEXT,                                  -- e.g. 'First Term'
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES portal_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id   UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  day_of_week    TEXT NOT NULL,    -- 'Monday' … 'Friday'
  start_time     TEXT NOT NULL,    -- stored as 'HH:MM' string for simplicity
  end_time       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  teacher_id     UUID REFERENCES portal_users(id) ON DELETE SET NULL,
  teacher_name   TEXT,             -- denormalized fallback
  course_id      UUID REFERENCES courses(id) ON DELETE SET NULL,
  room           TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timetable_slots_timetable ON timetable_slots(timetable_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher   ON timetable_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetables_school         ON timetables(school_id);

-- Row Level Security
ALTER TABLE timetables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "admin_all_timetables"       ON timetables      FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_timetable_slots"  ON timetable_slots FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'));

-- Schools: read their own timetables
CREATE POLICY "school_read_timetables"     ON timetables      FOR SELECT TO authenticated USING (school_id IN (SELECT school_id FROM portal_users WHERE id = auth.uid() AND role = 'school'));
CREATE POLICY "school_read_slots"          ON timetable_slots FOR SELECT TO authenticated USING (timetable_id IN (SELECT t.id FROM timetables t JOIN portal_users p ON p.school_id = t.school_id WHERE p.id = auth.uid() AND p.role = 'school'));

-- Teachers: read slots where they are assigned
CREATE POLICY "teacher_read_slots"         ON timetable_slots FOR SELECT TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "teacher_read_timetables"    ON timetables      FOR SELECT TO authenticated USING (id IN (SELECT timetable_id FROM timetable_slots WHERE teacher_id = auth.uid()));

-- Students: read timetables for their enrolled school
CREATE POLICY "student_read_timetables"    ON timetables      FOR SELECT TO authenticated USING (school_id IN (SELECT school_id FROM portal_users WHERE id = auth.uid() AND role = 'student'));
CREATE POLICY "student_read_slots"         ON timetable_slots FOR SELECT TO authenticated USING (timetable_id IN (SELECT t.id FROM timetables t JOIN portal_users p ON p.school_id = t.school_id WHERE p.id = auth.uid() AND p.role = 'student'));
