-- =================================================================
-- MIGRATION: Consolidate complete_schema.sql into portal schema
-- Adds missing tables and columns from complete_schema.sql 
-- without breaking existing portal_users / RLS setup
-- =================================================================

-- ---------------------------------------------------------------
-- 1. USER PROFILES (extended profile data, new in complete_schema)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE UNIQUE,
  bio TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Nigeria',
  postal_code TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 2. EXTEND portal_users with extra columns if not present
-- ---------------------------------------------------------------
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- ---------------------------------------------------------------
-- 3. EXTEND students table with complete_schema columns
-- ---------------------------------------------------------------
ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS current_class TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Nigeria';
ALTER TABLE students ADD COLUMN IF NOT EXISTS medical_conditions TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_programming_experience TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS goals TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES portal_users(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ---------------------------------------------------------------
-- 4. STUDENT ENROLLMENTS (maps to existing enrollments table)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT CHECK (status IN ('active', 'completed', 'dropped', 'suspended')) DEFAULT 'active',
  completion_date DATE,
  grade TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, program_id)
);

-- ---------------------------------------------------------------
-- 5. EXTEND classes table
-- ---------------------------------------------------------------
ALTER TABLE classes ADD COLUMN IF NOT EXISTS schedule TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS current_students INTEGER DEFAULT 0;

-- ---------------------------------------------------------------
-- 6. EXTEND class_sessions with complete_schema columns
-- ---------------------------------------------------------------
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_url TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled';

-- ---------------------------------------------------------------
-- 7. EXTEND attendance to reference students table
-- ---------------------------------------------------------------
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES portal_users(id);

-- ---------------------------------------------------------------
-- 8. EXTEND messages with read_at timestamp
-- ---------------------------------------------------------------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- ---------------------------------------------------------------
-- 9. EXTEND notifications with read_at and action_url
-- ---------------------------------------------------------------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;

-- ---------------------------------------------------------------
-- 10. EXTEND payments to support student_id (legacy style)
-- ---------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id TEXT;

-- ---------------------------------------------------------------
-- 11. TRIGGERS for new tables
-- ---------------------------------------------------------------
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_enrollments_updated_at
  BEFORE UPDATE ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------
-- 12. INDEXES for new tables
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_program ON student_enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_status ON student_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_students_approved_by ON students(approved_by);
CREATE INDEX IF NOT EXISTS idx_students_parent_email ON students(parent_email);

-- ---------------------------------------------------------------
-- 13. RLS for new tables
-- ---------------------------------------------------------------
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all profiles" ON user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Teachers can view student enrollments" ON student_enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Admins can manage student enrollments" ON student_enrollments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------
-- 14. RLS POLICY: teachers can manage assignments & classes
-- ---------------------------------------------------------------
CREATE POLICY "Teachers can manage assignments" ON assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Teachers can manage classes" ON classes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
 );

CREATE POLICY "Teachers can manage sessions" ON class_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Teachers can record attendance" ON attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Teachers can grade submissions" ON assignment_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

CREATE POLICY "Teachers can view all students" ON students
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- ---------------------------------------------------------------
-- 15. DEFAULT SEED DATA (insert only if programs table is empty)
-- ---------------------------------------------------------------
INSERT INTO programs (name, description, duration_weeks, difficulty_level, price, max_students)
VALUES
  ('ICT Fundamentals',     'Basic computer skills and digital literacy',     8,  'beginner',     50000,  20),
  ('Scratch Programming',  'Visual programming for beginners',                10, 'beginner',     75000,  15),
  ('HTML/CSS Programming', 'Web development fundamentals',                    12, 'beginner',     100000, 15),
  ('Python Programming',   'Advanced programming concepts',                   16, 'intermediate', 150000, 12),
  ('Web Design',           'Creative web design skills',                      14, 'intermediate', 120000, 12),
  ('Robotics Programming', 'Robotics and automation programming',             18, 'advanced',     200000, 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_public)
VALUES
  ('academy_name',               'Rillcod Academy',     'Name of the academy',                             TRUE),
  ('academy_email',              'info@rillcod.com',    'Primary contact email',                           TRUE),
  ('academy_phone',              '+234 123 456 7890',   'Primary contact phone',                           TRUE),
  ('academy_address',            'Lagos, Nigeria',      'Academy address',                                 TRUE),
  ('max_students_per_class',     '20',                  'Maximum students allowed per class',              FALSE),
  ('auto_approve_students',      'false',               'Automatically approve student registrations',     FALSE),
  ('require_teacher_approval',   'true',               'Require admin approval for teachers',              FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- Grant permissions for all
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
