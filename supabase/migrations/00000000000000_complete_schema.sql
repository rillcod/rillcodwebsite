-- ============================================================
-- RILLCOD ACADEMY — COMPLETE CONSOLIDATED SCHEMA MIGRATION
-- All individual migrations merged into one idempotent file.
-- Generated: Fri, Mar  6, 2026  6:00:10 AM
-- Applied to: akaorqukdoawacvxsdij
-- ============================================================

-- ============================================================
-- MIGRATION: 20240101000000_init.sql
-- ============================================================

-- Rillcod Academy Complete Portal System Schema
-- Includes legacy tables for approval workflow + new portal tables
-- All user roles (admin, teacher, student) are in portal_users
-- Legacy tables: schools, students (for registration approval workflow)

-- =============================
-- LEGACY TABLES (FOR APPROVAL WORKFLOW)
-- =============================

-- Schools (partner schools that can register students)
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  student_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  school_type TEXT,
  lga TEXT,
  program_interest TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students (legacy table for registration approval workflow)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER,
  email TEXT,
  phone TEXT,
  school TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  grade TEXT,
  gender TEXT,
  parent_name TEXT,
  course_interest TEXT,
  preferred_schedule TEXT,
  hear_about_us TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- PORTAL USERS (UNIFIED USER TABLE)
-- =============================

-- Portal Users (all user types: admin, teacher, student)
CREATE TABLE IF NOT EXISTS portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'teacher', 'student')) NOT NULL,
  phone TEXT,
  school_name TEXT, -- Store school name as text instead of foreign key
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  profile_image_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- PROGRAM & COURSE MANAGEMENT
-- =============================

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  duration_weeks INTEGER,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  price DECIMAL(10,2),
  max_students INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  duration_hours INTEGER,
  order_index INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type TEXT CHECK (file_type IN ('pdf', 'video', 'image', 'document', 'link')),
  file_size INTEGER,
  order_index INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- ENROLLMENTS (PORTAL USERS TO PROGRAMS)
-- =============================

CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE, -- student or teacher
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('student', 'teacher')) NOT NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT CHECK (status IN ('active', 'completed', 'dropped', 'suspended')) DEFAULT 'active',
  completion_date DATE,
  grade TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, program_id, role)
);

-- =============================
-- ASSIGNMENTS & SUBMISSIONS
-- =============================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  due_date TIMESTAMPTZ,
  max_points INTEGER DEFAULT 100,
  assignment_type TEXT CHECK (assignment_type IN ('homework', 'project', 'quiz', 'exam', 'presentation')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE, -- student
  submission_text TEXT,
  file_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  graded_by UUID REFERENCES portal_users(id), -- teacher/admin
  grade INTEGER,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('submitted', 'graded', 'late', 'missing')) DEFAULT 'submitted'
);

-- =============================
-- CLASSES & SESSIONS
-- =============================

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES portal_users(id),
  name TEXT NOT NULL,
  description TEXT,
  max_students INTEGER,
  start_date DATE,
  end_date DATE,
  status TEXT CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  topic TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE, -- student
  status TEXT CHECK (status IN ('present', 'absent', 'late', 'excused')) DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- =============================
-- CBT (COMPUTER BASED TEST)
-- =============================

CREATE TABLE IF NOT EXISTS cbt_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  passing_score INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cbt_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES cbt_exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('multiple_choice', 'true_false', 'essay', 'fill_blank')) DEFAULT 'multiple_choice',
  options JSONB,
  correct_answer TEXT,
  points INTEGER DEFAULT 1,
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cbt_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES cbt_exams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE, -- student
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  score INTEGER,
  status TEXT CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
  answers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- COMMUNICATION
-- =============================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES portal_users(id),
  target_audience TEXT CHECK (target_audience IN ('all', 'students', 'teachers', 'admins')) DEFAULT 'all',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- PAYMENTS
-- =============================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE, -- student
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'online')) DEFAULT 'cash',
  payment_status TEXT CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
  transaction_reference TEXT,
  payment_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- SYSTEM SETTINGS & AUDIT
-- =============================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  category TEXT DEFAULT 'general',
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES portal_users(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- REPORTS & ANALYTICS
-- =============================

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT CHECK (template_type IN ('student_progress', 'financial', 'attendance', 'performance')) DEFAULT 'student_progress',
  query_template TEXT,
  parameters JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES report_templates(id),
  generated_by UUID REFERENCES portal_users(id),
  report_name TEXT NOT NULL,
  report_data JSONB,
  file_url TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================
-- INDEXES FOR PERFORMANCE
-- =============================

-- Legacy tables indexes
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- Portal Users indexes
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_users_role ON portal_users(role);
CREATE INDEX IF NOT EXISTS idx_portal_users_active ON portal_users(is_active);

-- Programs indexes
CREATE INDEX IF NOT EXISTS idx_programs_active ON programs(is_active);
CREATE INDEX IF NOT EXISTS idx_programs_difficulty ON programs(difficulty_level);

-- Courses indexes
CREATE INDEX IF NOT EXISTS idx_courses_program ON courses(program_id);
CREATE INDEX IF NOT EXISTS idx_courses_active ON courses(is_active);

-- Enrollments indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_program ON enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);

-- Assignments indexes
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);

-- Submissions indexes
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON assignment_submissions(status);

-- Classes indexes
CREATE INDEX IF NOT EXISTS idx_classes_program ON classes(program_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_class ON class_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(session_date);

-- Attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);

-- CBT indexes
CREATE INDEX IF NOT EXISTS idx_cbt_exams_program ON cbt_exams(program_id);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_active ON cbt_exams(is_active);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_exam ON cbt_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam ON cbt_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user ON cbt_sessions(user_id);

-- Communication indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(target_audience);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_program ON payments(program_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON system_settings(category);

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- =============================
-- TRIGGERS FOR UPDATED_AT
-- =============================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables
DROP TRIGGER IF EXISTS update_schools_updated_at ON schools;
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_portal_users_updated_at ON portal_users;
CREATE TRIGGER update_portal_users_updated_at BEFORE UPDATE ON portal_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_programs_updated_at ON programs;
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_materials_updated_at ON course_materials;
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON course_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_enrollments_updated_at ON enrollments;
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_assignments_updated_at ON assignments;
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_submissions_updated_at ON assignment_submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_classes_updated_at ON classes;
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_sessions_updated_at ON class_sessions;
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON class_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_attendance_updated_at ON attendance;
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_cbt_exams_updated_at ON cbt_exams;
CREATE TRIGGER update_cbt_exams_updated_at BEFORE UPDATE ON cbt_exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_cbt_questions_updated_at ON cbt_questions;
CREATE TRIGGER update_cbt_questions_updated_at BEFORE UPDATE ON cbt_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_cbt_sessions_updated_at ON cbt_sessions;
CREATE TRIGGER update_cbt_sessions_updated_at BEFORE UPDATE ON cbt_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_settings_updated_at ON system_settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_report_templates_updated_at ON report_templates;
CREATE TRIGGER update_report_templates_updated_at BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- RLS POLICIES
-- =============================

-- Enable RLS on all tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbt_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbt_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

-- =============================
-- RLS POLICIES FOR LEGACY TABLES
-- =============================

-- Schools policies
DROP POLICY IF EXISTS "Public can view schools" ON schools;
CREATE POLICY "Public can view schools" ON schools FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert schools" ON schools;
CREATE POLICY "Public can insert schools" ON schools FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can manage schools" ON schools;
CREATE POLICY "Admins can manage schools" ON schools FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Students policies (legacy table)
DROP POLICY IF EXISTS "Public can insert students" ON students;
CREATE POLICY "Public can insert students" ON students FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public can view students" ON students;
CREATE POLICY "Public can view students" ON students FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage students" ON students;
CREATE POLICY "Admins can manage students" ON students FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- =============================
-- RLS POLICIES FOR PORTAL TABLES
-- =============================

-- Portal Users policies
DROP POLICY IF EXISTS "Users can view their own profile" ON portal_users;
CREATE POLICY "Users can view their own profile" ON portal_users FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "Users can update their own profile" ON portal_users;
CREATE POLICY "Users can update their own profile" ON portal_users FOR UPDATE USING (id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage all users" ON portal_users;
CREATE POLICY "Admins can manage all users" ON portal_users FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Programs policies
DROP POLICY IF EXISTS "Public can view programs" ON programs;
CREATE POLICY "Public can view programs" ON programs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage programs" ON programs;
CREATE POLICY "Admins can manage programs" ON programs FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Courses policies
DROP POLICY IF EXISTS "Public can view courses" ON courses;
CREATE POLICY "Public can view courses" ON courses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage courses" ON courses;
CREATE POLICY "Admins can manage courses" ON courses FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Course Materials policies
DROP POLICY IF EXISTS "Public can view materials" ON course_materials;
CREATE POLICY "Public can view materials" ON course_materials FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage materials" ON course_materials;
CREATE POLICY "Admins can manage materials" ON course_materials FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Enrollments policies
DROP POLICY IF EXISTS "Users can view their enrollments" ON enrollments;
CREATE POLICY "Users can view their enrollments" ON enrollments FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage enrollments" ON enrollments;
CREATE POLICY "Admins can manage enrollments" ON enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Assignments policies
DROP POLICY IF EXISTS "Public can view assignments" ON assignments;
CREATE POLICY "Public can view assignments" ON assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage assignments" ON assignments;
CREATE POLICY "Admins can manage assignments" ON assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Assignment Submissions policies
DROP POLICY IF EXISTS "Students can view their submissions" ON assignment_submissions;
CREATE POLICY "Students can view their submissions" ON assignment_submissions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Students can submit assignments" ON assignment_submissions;
CREATE POLICY "Students can submit assignments" ON assignment_submissions FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage submissions" ON assignment_submissions;
CREATE POLICY "Admins can manage submissions" ON assignment_submissions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Classes policies
DROP POLICY IF EXISTS "Public can view classes" ON classes;
CREATE POLICY "Public can view classes" ON classes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage classes" ON classes;
CREATE POLICY "Admins can manage classes" ON classes FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Class Sessions policies
DROP POLICY IF EXISTS "Public can view sessions" ON class_sessions;
CREATE POLICY "Public can view sessions" ON class_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage sessions" ON class_sessions;
CREATE POLICY "Admins can manage sessions" ON class_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Attendance policies
DROP POLICY IF EXISTS "Students can view their attendance" ON attendance;
CREATE POLICY "Students can view their attendance" ON attendance FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage attendance" ON attendance;
CREATE POLICY "Admins can manage attendance" ON attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- CBT policies
DROP POLICY IF EXISTS "Public can view CBT exams" ON cbt_exams;
CREATE POLICY "Public can view CBT exams" ON cbt_exams FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage CBT" ON cbt_exams;
CREATE POLICY "Admins can manage CBT" ON cbt_exams FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Public can view CBT questions" ON cbt_questions;
CREATE POLICY "Public can view CBT questions" ON cbt_questions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage CBT questions" ON cbt_questions;
CREATE POLICY "Admins can manage CBT questions" ON cbt_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Students can view their CBT sessions" ON cbt_sessions;
CREATE POLICY "Students can view their CBT sessions" ON cbt_sessions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Students can take CBT" ON cbt_sessions;
CREATE POLICY "Students can take CBT" ON cbt_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage CBT sessions" ON cbt_sessions;
CREATE POLICY "Admins can manage CBT sessions" ON cbt_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Communication policies
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update their notifications" ON notifications;
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;
CREATE POLICY "Admins can manage notifications" ON notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Users can view their messages" ON messages;
CREATE POLICY "Users can view their messages" ON messages FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage messages" ON messages;
CREATE POLICY "Admins can manage messages" ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Public can view announcements" ON announcements;
CREATE POLICY "Public can view announcements" ON announcements FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins can manage announcements" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Payments policies
DROP POLICY IF EXISTS "Users can view their payments" ON payments;
CREATE POLICY "Users can view their payments" ON payments FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage payments" ON payments;
CREATE POLICY "Admins can manage payments" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- System Settings policies
DROP POLICY IF EXISTS "Public can view public settings" ON system_settings;
CREATE POLICY "Public can view public settings" ON system_settings FOR SELECT USING (is_public = true);
DROP POLICY IF EXISTS "Admins can manage settings" ON system_settings;
CREATE POLICY "Admins can manage settings" ON system_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Audit Logs policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Reports policies
DROP POLICY IF EXISTS "Admins can manage reports" ON report_templates;
CREATE POLICY "Admins can manage reports" ON report_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Admins can manage generated reports" ON generated_reports;
CREATE POLICY "Admins can manage generated reports" ON generated_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- =============================
-- GRANT PERMISSIONS
-- =============================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================
-- MIGRATION: 20240101000001_sample_data.sql
-- ============================================================

-- Rillcod Academy Sample Data
-- This script populates the database with initial sample data
-- It includes checks to prevent duplicate data insertion

BEGIN;

-- Add missing student_id column safely
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE SET NULL;

-- =============================
-- SAMPLE SCHOOLS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schools LIMIT 1) THEN
        INSERT INTO schools (id, name, address, city, state, contact_person, phone, email, student_count, school_type, lga, program_interest) VALUES
        ('550e8400-e29b-41d4-a716-446655440001', 'Lagos State Model College', '123 Victoria Island', 'Lagos', 'Lagos', 'Dr. Adebayo Johnson', '+2348012345678', 'info@lagosmodel.edu.ng', 1200, 'Public', 'Victoria Island', ARRAY['Web Development', 'Python Programming']),
        ('550e8400-e29b-41d4-a716-446655440002', 'Federal Government College', '456 Ikeja GRA', 'Lagos', 'Lagos', 'Mrs. Sarah Williams', '+2348012345680', 'info@fgcikeja.edu.ng', 800, 'Public', 'Ikeja', ARRAY['Mobile App Development', 'Data Science']);
    END IF;
END $$;

-- =============================
-- SAMPLE STUDENTS (LEGACY TABLE)
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM students LIMIT 1) THEN
        INSERT INTO students (id, name, age, email, phone, school, grade, gender, parent_name, course_interest, preferred_schedule, hear_about_us, status) VALUES
        ('770e8400-e29b-41d4-a716-446655440001', 'Grace Taylor', 15, 'student1@school.com', '+2348012346001', 'Lagos State Model College', 'SS2', 'female', 'Mr. Taylor', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440002', 'Henry Anderson', 16, 'student2@school.com', '+2348012346002', 'Federal Government College', 'SS3', 'male', 'Mrs. Anderson', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440003', 'Isabella Martinez', 15, 'student3@school.com', '+2348012346003', 'Lagos State Model College', 'SS2', 'female', 'Mr. Martinez', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440004', 'James Thomas', 16, 'student4@school.com', '+2348012346004', 'Federal Government College', 'SS3', 'male', 'Mrs. Thomas', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440005', 'Kelly White', 15, 'student5@school.com', '+2348012346005', 'Lagos State Model College', 'SS2', 'female', 'Mr. White', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440006', 'Liam Garcia', 16, 'student6@school.com', '+2348012346006', 'Federal Government College', 'SS3', 'male', 'Mrs. Garcia', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440007', 'Mia Rodriguez', 15, 'student7@school.com', '+2348012346007', 'Lagos State Model College', 'SS2', 'female', 'Mr. Rodriguez', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440008', 'Noah Lee', 16, 'student8@school.com', '+2348012346008', 'Federal Government College', 'SS3', 'male', 'Mrs. Lee', 'Python Programming', 'After School', 'Friend Recommendation', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440009', 'Olivia Clark', 15, 'student9@school.com', '+2348012346009', 'Lagos State Model College', 'SS2', 'female', 'Mr. Clark', 'Web Development', 'Weekends', 'Social Media', 'approved'),
        ('770e8400-e29b-41d4-a716-446655440010', 'Peter Harris', 16, 'student10@school.com', '+2348012346010', 'Federal Government College', 'SS3', 'male', 'Mrs. Harris', 'Python Programming', 'After School', 'Friend Recommendation', 'approved');
    END IF;
END $$;

-- Insert student and admin portal_users
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM portal_users WHERE id = '550e8400-e29b-41d4-a716-446655440101') THEN
        INSERT INTO portal_users (id, email, full_name, role, is_active, student_id) VALUES
        ('550e8400-e29b-41d4-a716-446655440101', 'admin@rillcod.com', 'System Admin', 'admin', true, NULL),
        ('550e8400-e29b-41d4-a716-446655440300', 'student1@school.com', 'Grace Taylor', 'student', true, '770e8400-e29b-41d4-a716-446655440001'),
        ('550e8400-e29b-41d4-a716-446655440301', 'student2@school.com', 'Henry Anderson', 'student', true, '770e8400-e29b-41d4-a716-446655440002'),
        ('550e8400-e29b-41d4-a716-446655440302', 'student3@school.com', 'Isabella Martinez', 'student', true, '770e8400-e29b-41d4-a716-446655440003'),
        ('550e8400-e29b-41d4-a716-446655440303', 'student4@school.com', 'James Thomas', 'student', true, '770e8400-e29b-41d4-a716-446655440004'),
        ('550e8400-e29b-41d4-a716-446655440304', 'student5@school.com', 'Kelly White', 'student', true, '770e8400-e29b-41d4-a716-446655440005'),
        ('550e8400-e29b-41d4-a716-446655440305', 'student6@school.com', 'Liam Garcia', 'student', true, '770e8400-e29b-41d4-a716-446655440006'),
        ('550e8400-e29b-41d4-a716-446655440306', 'student7@school.com', 'Mia Rodriguez', 'student', true, '770e8400-e29b-41d4-a716-446655440007'),
        ('550e8400-e29b-41d4-a716-446655440307', 'student8@school.com', 'Noah Lee', 'student', true, '770e8400-e29b-41d4-a716-446655440008'),
        ('550e8400-e29b-41d4-a716-446655440308', 'student9@school.com', 'Olivia Clark', 'student', true, '770e8400-e29b-41d4-a716-446655440009'),
        ('550e8400-e29b-41d4-a716-446655440309', 'student10@school.com', 'Peter Harris', 'student', true, '770e8400-e29b-41d4-a716-446655440010');
    END IF;
END $$;

-- =============================
-- SAMPLE PROGRAMS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM programs LIMIT 1) THEN
        INSERT INTO programs (id, name, description, duration_weeks, difficulty_level, price, max_students, is_active) VALUES
        ('880e8400-e29b-41d4-a716-446655440001', 'Web Development Fundamentals', 'Learn the basics of web development with HTML, CSS, and JavaScript', 12, 'beginner', 50000.00, 30, true),
        ('880e8400-e29b-41d4-a716-446655440002', 'Python Programming', 'Master Python programming from basics to advanced concepts', 16, 'intermediate', 75000.00, 25, true),
        ('880e8400-e29b-41d4-a716-446655440003', 'Mobile App Development', 'Build native mobile applications using React Native', 14, 'intermediate', 65000.00, 20, true),
        ('880e8400-e29b-41d4-a716-446655440004', 'Data Science', 'Learn data analysis, visualization, and machine learning', 20, 'advanced', 100000.00, 15, true);
    END IF;
END $$;

-- =============================
-- SAMPLE COURSES
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM courses LIMIT 1) THEN
        INSERT INTO courses (id, program_id, title, description, content, duration_hours, order_index, is_active) VALUES
        ('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'HTML Basics', 'Introduction to HTML markup language', 'Learn HTML structure, elements, and semantic markup', 8, 1, true),
        ('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'CSS Styling', 'Cascading Style Sheets fundamentals', 'Master CSS selectors, properties, and layouts', 10, 2, true),
        ('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'JavaScript Fundamentals', 'Introduction to JavaScript programming', 'Learn variables, functions, and DOM manipulation', 12, 3, true),
        ('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'Python Basics', 'Introduction to Python programming', 'Learn Python syntax, data types, and control structures', 10, 1, true),
        ('990e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'Python OOP', 'Object-Oriented Programming in Python', 'Master classes, objects, and inheritance', 12, 2, true);
    END IF;
END $$;

-- =============================
-- SAMPLE ENROLLMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM enrollments LIMIT 1) THEN
        INSERT INTO enrollments (id, user_id, program_id, role, enrollment_date, status) VALUES
        ('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', '880e8400-e29b-41d4-a716-446655440001', 'student', '2024-01-15', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', '880e8400-e29b-41d4-a716-446655440002', 'student', '2024-01-20', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', '880e8400-e29b-41d4-a716-446655440003', 'student', '2024-01-25', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', '880e8400-e29b-41d4-a716-446655440004', 'student', '2024-02-01', 'active'),
        ('aa0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', '880e8400-e29b-41d4-a716-446655440001', 'student', '2024-02-05', 'active');
    END IF;
END $$;

-- =============================
-- SAMPLE ASSIGNMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM assignments LIMIT 1) THEN
        INSERT INTO assignments (id, course_id, title, description, instructions, due_date, max_points, assignment_type, is_active) VALUES
        ('bb0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440001', 'HTML Portfolio', 'Create a personal portfolio using HTML', 'Build a 3-page portfolio with proper HTML structure', '2024-02-15 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440002', 'CSS Layout Challenge', 'Design responsive layouts with CSS', 'Create responsive layouts using Flexbox and Grid', '2024-02-20 23:59:00', 100, 'homework', true),
        ('bb0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440003', 'JavaScript Calculator', 'Build a calculator using JavaScript', 'Implement basic arithmetic operations with a user interface', '2024-02-25 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440004', 'Python Quiz Game', 'Create a quiz game in Python', 'Build a command-line quiz game with score tracking', '2024-03-01 23:59:00', 100, 'project', true),
        ('bb0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440005', 'OOP Project', 'Design a class hierarchy', 'Create a class hierarchy for a library management system', '2024-03-05 23:59:00', 100, 'homework', true);
    END IF;
END $$;

-- =============================
-- SAMPLE ANNOUNCEMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM announcements LIMIT 1) THEN
        INSERT INTO announcements (id, title, content, author_id, target_audience, is_active) VALUES
        ('cc0e8400-e29b-41d4-a716-446655440001', 'Welcome to Rillcod Academy!', 'Welcome all students to the new academic session. We are excited to have you join our programming community.', '550e8400-e29b-41d4-a716-446655440101', 'all', true),
        ('cc0e8400-e29b-41d4-a716-446655440002', 'New Course Available', 'We are pleased to announce our new Data Science course starting next month.', '550e8400-e29b-41d4-a716-446655440101', 'students', true),
        ('cc0e8400-e29b-41d4-a716-446655440003', 'Holiday Schedule', 'The academy will be closed for the upcoming holiday. Classes will resume on Monday.', '550e8400-e29b-41d4-a716-446655440101', 'all', true),
        ('cc0e8400-e29b-41d4-a716-446655440004', 'Teacher Training', 'All teachers are required to attend the training session this Friday.', '550e8400-e29b-41d4-a716-446655440101', 'teachers', true),
        ('cc0e8400-e29b-41d4-a716-446655440005', 'Student Achievement', 'Congratulations to our students who completed their projects successfully!', '550e8400-e29b-41d4-a716-446655440101', 'all', true);
    END IF;
END $$;

-- =============================
-- SAMPLE SYSTEM SETTINGS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1) THEN
        INSERT INTO system_settings (id, setting_key, setting_value, description, category, is_public) VALUES
        ('dd0e8400-e29b-41d4-a716-446655440001', 'site_name', 'Rillcod Academy', 'Name of the academy', 'general', true),
        ('dd0e8400-e29b-41d4-a716-446655440002', 'site_description', 'Leading programming academy in Nigeria', 'Site description', 'general', true),
        ('dd0e8400-e29b-41d4-a716-446655440003', 'contact_email', 'contact@rillcod.com', 'Contact email address', 'contact', true),
        ('dd0e8400-e29b-41d4-a716-446655440004', 'contact_phone', '+2348012345678', 'Contact phone number', 'contact', true),
        ('dd0e8400-e29b-41d4-a716-446655440005', 'maintenance_mode', 'false', 'System maintenance mode', 'system', false);
    END IF;
END $$;

-- =============================
-- SAMPLE CBT EXAMS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cbt_exams LIMIT 1) THEN
        INSERT INTO cbt_exams (id, title, description, program_id, duration_minutes, total_questions, passing_score, is_active, start_date, end_date) VALUES
        ('ee0e8400-e29b-41d4-a716-446655440001', 'Web Development Midterm', 'Midterm examination for Web Development Fundamentals', '880e8400-e29b-41d4-a716-446655440001', 60, 20, 70, true, '2024-02-15 09:00:00', '2024-02-15 17:00:00'),
        ('ee0e8400-e29b-41d4-a716-446655440002', 'Python Final Exam', 'Final examination for Python Programming', '880e8400-e29b-41d4-a716-446655440002', 90, 30, 75, true, '2024-03-15 09:00:00', '2024-03-15 17:00:00'),
        ('ee0e8400-e29b-41d4-a716-446655440003', 'Mobile App Quiz', 'Quiz for Mobile App Development', '880e8400-e29b-41d4-a716-446655440003', 45, 15, 60, true, '2024-02-20 09:00:00', '2024-02-20 17:00:00');
    END IF;
END $$;

-- =============================
-- SAMPLE CBT QUESTIONS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cbt_questions LIMIT 1) THEN
        INSERT INTO cbt_questions (id, exam_id, question_text, question_type, options, correct_answer, points, order_index) VALUES
        ('ff0e8400-e29b-41d4-a716-446655440001', 'ee0e8400-e29b-41d4-a716-446655440001', 'What does HTML stand for?', 'multiple_choice', '["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlink and Text Markup Language"]', 'Hyper Text Markup Language', 5, 1),
        ('ff0e8400-e29b-41d4-a716-446655440002', 'ee0e8400-e29b-41d4-a716-446655440001', 'Which CSS property controls the text size?', 'multiple_choice', '["font-size", "text-size", "size", "font-style"]', 'font-size', 5, 2),
        ('ff0e8400-e29b-41d4-a716-446655440003', 'ee0e8400-e29b-41d4-a716-446655440002', 'What is the correct way to create a function in Python?', 'multiple_choice', '["def function_name():", "function function_name():", "create function_name():", "new function_name():"]', 'def function_name():', 5, 1),
        ('ff0e8400-e29b-41d4-a716-446655440004', 'ee0e8400-e29b-41d4-a716-446655440002', 'Which of the following is a Python data type?', 'multiple_choice', '["list", "array", "vector", "sequence"]', 'list', 5, 2),
        ('ff0e8400-e29b-41d4-a716-446655440005', 'ee0e8400-e29b-41d4-a716-446655440003', 'What is React Native?', 'multiple_choice', '["A framework for building mobile apps", "A database system", "A programming language", "A web server"]', 'A framework for building mobile apps', 5, 1);
    END IF;
END $$;

-- =============================
-- SAMPLE PAYMENTS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM payments LIMIT 1) THEN
        INSERT INTO payments (id, user_id, program_id, amount, payment_method, payment_status, transaction_reference, payment_date, notes) VALUES
        ('110e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', '880e8400-e29b-41d4-a716-446655440001', 50000.00, 'bank_transfer', 'completed', 'TXN001', '2024-01-15 10:30:00', 'Payment for Web Development course'),
        ('110e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', '880e8400-e29b-41d4-a716-446655440002', 75000.00, 'card', 'completed', 'TXN002', '2024-01-20 14:45:00', 'Payment for Python Programming course'),
        ('110e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', '880e8400-e29b-41d4-a716-446655440003', 65000.00, 'bank_transfer', 'completed', 'TXN003', '2024-01-25 09:15:00', 'Payment for Mobile App Development course'),
        ('110e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', '880e8400-e29b-41d4-a716-446655440004', 100000.00, 'card', 'completed', 'TXN004', '2024-02-01 16:20:00', 'Payment for Data Science course'),
        ('110e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', '880e8400-e29b-41d4-a716-446655440001', 50000.00, 'bank_transfer', 'completed', 'TXN005', '2024-02-05 11:30:00', 'Payment for Web Development course');
    END IF;
END $$;

-- =============================
-- SAMPLE NOTIFICATIONS
-- =============================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM notifications LIMIT 1) THEN
        INSERT INTO notifications (id, user_id, title, message, type, is_read) VALUES
        ('120e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440300', 'Welcome!', 'Welcome to Rillcod Academy. Your account has been activated.', 'success', false),
        ('120e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440301', 'Course Enrollment', 'You have been successfully enrolled in Python Programming course.', 'info', false),
        ('120e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440302', 'Payment Confirmed', 'Your payment for Mobile App Development course has been confirmed.', 'success', false),
        ('120e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440303', 'New Assignment', 'A new assignment has been posted for your course.', 'info', false),
        ('120e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440304', 'Course Reminder', 'Your Web Development course starts tomorrow.', 'warning', false);
    END IF;
END $$;

COMMIT;

-- ============================================================
-- MIGRATION: 20240101000002_teachers_table.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  subjects TEXT[] DEFAULT '{}',
  experience_years INTEGER DEFAULT 0,
  education TEXT,
  bio TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES portal_users(id)
);

DROP TRIGGER IF EXISTS update_teachers_updated_at ON teachers;
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view teachers" ON teachers;
CREATE POLICY "Public can view teachers" ON teachers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage teachers" ON teachers;
CREATE POLICY "Admins can manage teachers" ON teachers FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Teachers can update their own profile" ON teachers;
CREATE POLICY "Teachers can update their own profile" ON teachers FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- MIGRATION: 20240101000003_fix_teachers_table.sql
-- ============================================================

ALTER TABLE teachers DROP CONSTRAINT IF EXISTS teachers_id_fkey;
ALTER TABLE teachers ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ============================================================
-- MIGRATION: 20240101000004_consolidate_schema.sql
-- ============================================================

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
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_enrollments_updated_at ON student_enrollments;
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

DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all profiles" ON user_profiles;
CREATE POLICY "Admins can manage all profiles" ON user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Teachers can view student enrollments" ON student_enrollments;
CREATE POLICY "Teachers can view student enrollments" ON student_enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Admins can manage student enrollments" ON student_enrollments;
CREATE POLICY "Admins can manage student enrollments" ON student_enrollments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------
-- 14. RLS POLICY: teachers can manage assignments & classes
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can manage assignments" ON assignments;
CREATE POLICY "Teachers can manage assignments" ON assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Teachers can manage classes" ON classes;
CREATE POLICY "Teachers can manage classes" ON classes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
 );

DROP POLICY IF EXISTS "Teachers can manage sessions" ON class_sessions;
CREATE POLICY "Teachers can manage sessions" ON class_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Teachers can record attendance" ON attendance;
CREATE POLICY "Teachers can record attendance" ON attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Teachers can grade submissions" ON assignment_submissions;
CREATE POLICY "Teachers can grade submissions" ON assignment_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Teachers can view all students" ON students;
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

-- ============================================================
-- MIGRATION: 20240101000005_enrich_schema.sql
-- ============================================================

-- ============================================================
-- Migration 005: Enrich schema with proper relationships
-- Handles existing deployed state gracefully
-- ============================================================

-- ── 1. students: add user_id link to portal_users ────────────
alter table students
  add column if not exists user_id uuid references portal_users(id) on delete set null,
  add column if not exists student_number text,
  add column if not exists grade_level text,
  add column if not exists avatar_url text;

-- Make student_number unique only when populated
create unique index if not exists idx_students_student_number
  on students(student_number) where student_number is not null;

create index if not exists idx_students_user_id on students(user_id);

-- ── 2. Backfill student → portal_user link by name match ─────
do $$
begin
  update students s
  set user_id = pu.id
  from portal_users pu
  where pu.role = 'student'
    and lower(trim(pu.full_name)) = lower(trim(s.full_name))
    and s.user_id is null;
exception when others then
  raise notice 'Backfill skipped: %', sqlerrm;
end $$;

-- ── 3. assignment_submissions: add student_id if missing ──────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='assignment_submissions'
      and column_name='student_id'
      and table_schema='public'
  ) then
    alter table assignment_submissions
      add column student_id uuid references students(id) on delete cascade;
    create index idx_submissions_student_id on assignment_submissions(student_id);
  end if;
end $$;

-- ── 4. assignment_submissions: add portal_user_id ────────────
alter table assignment_submissions
  add column if not exists portal_user_id uuid references portal_users(id) on delete set null,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_submissions_portal_user
  on assignment_submissions(portal_user_id);

-- ── 5. courses: add teacher_id ───────────────────────────────
alter table courses
  add column if not exists teacher_id uuid references portal_users(id) on delete set null;

create index if not exists idx_courses_teacher on courses(teacher_id);

-- ── 6. assignments: add created_by, class_id ─────────────────
alter table assignments
  add column if not exists created_by uuid references portal_users(id) on delete set null,
  add column if not exists class_id uuid references classes(id) on delete set null;

create index if not exists idx_assignments_created_by on assignments(created_by);

-- ── 7. lessons table (create if not exists) ───────────────────
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  lesson_type text check (lesson_type in ('video','interactive','hands-on','workshop','coding','reading')),
  status text check (status in ('draft','active','scheduled','completed')) default 'draft',
  duration_minutes integer,
  session_date timestamptz,
  video_url text,
  content text,
  order_index integer,
  created_by uuid references portal_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table lessons
  add column if not exists created_by uuid references portal_users(id) on delete set null;

create index if not exists idx_lessons_course on lessons(course_id);
create index if not exists idx_lessons_status on lessons(status);
create index if not exists idx_lessons_created_by on lessons(created_by);

-- ── 8. enrollments: add progress ─────────────────────────────
alter table enrollments
  add column if not exists progress_pct integer default 0,
  add column if not exists last_activity_at timestamptz;

-- ── 9. student_progress table ────────────────────────────────
create table if not exists student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  portal_user_id uuid references portal_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  lessons_completed integer default 0,
  total_lessons integer default 0,
  assignments_completed integer default 0,
  total_assignments integer default 0,
  average_grade numeric(5,2),
  started_at timestamptz default now(),
  completed_at timestamptz,
  updated_at timestamptz default now()
);

create index if not exists idx_progress_student on student_progress(student_id);
create index if not exists idx_progress_portal_user on student_progress(portal_user_id);
create index if not exists idx_progress_course on student_progress(course_id);

-- ── 10. grade_reports table ───────────────────────────────────
create table if not exists grade_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  portal_user_id uuid references portal_users(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  total_assignments integer default 0,
  graded_assignments integer default 0,
  average_score numeric(5,2),
  highest_score numeric(5,2),
  lowest_score numeric(5,2),
  letter_grade text,
  generated_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_grade_reports_student on grade_reports(student_id);
create index if not exists idx_grade_reports_portal_user on grade_reports(portal_user_id);

-- ── 11. RLS Policies ─────────────────────────────────────────
-- Lessons: open read, staff write
alter table lessons enable row level security;

do $$ begin
  create policy "lessons_select_all" on lessons for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "lessons_write_staff" on lessons for all
    using (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')))
    with check (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')));
exception when duplicate_object then null; end $$;

-- student_progress: open read
alter table student_progress enable row level security;
do $$ begin
  create policy "progress_select_all" on student_progress for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "progress_write_staff" on student_progress for all
    using (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')))
    with check (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')));
exception when duplicate_object then null; end $$;

-- grade_reports: open read
alter table grade_reports enable row level security;
do $$ begin
  create policy "grade_reports_select" on grade_reports for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "grade_reports_write_staff" on grade_reports for all
    using (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')))
    with check (exists (select 1 from portal_users where id = auth.uid() and role in ('admin','teacher')));
exception when duplicate_object then null; end $$;

-- assignment_submissions: drop any open policy, add proper ones
do $$ begin
  drop policy if exists "Allow all operations for now" on assignment_submissions;
exception when others then null; end $$;

-- RLS for submissions: staff full access, students own only
do $$ begin
  create policy "submissions_staff_all" on assignment_submissions for all
    using (exists (select 1 from portal_users pu where pu.id = auth.uid() and pu.role in ('admin','teacher')))
    with check (exists (select 1 from portal_users pu where pu.id = auth.uid() and pu.role in ('admin','teacher')));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submissions_student_select" on assignment_submissions for select
    using (portal_user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submissions_student_insert" on assignment_submissions for insert
    with check (portal_user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Trigger for updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$ begin
DROP TRIGGER IF EXISTS update_submissions_updated_at ON assignment_submissions;
  create trigger update_submissions_updated_at
    before update on assignment_submissions
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

do $$ begin
DROP TRIGGER IF EXISTS update_progress_updated_at ON student_progress;
  create trigger update_progress_updated_at
    before update on student_progress
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

-- ============================================================
-- MIGRATION: 20240101000006_teacher_schools.sql
-- ============================================================

-- ============================================================
-- Migration 006: Teacher-School assignments
-- A teacher can be assigned to one or more partner schools
-- ============================================================

-- ── teacher_schools junction table ───────────────────────────
create table if not exists teacher_schools (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references portal_users(id) on delete cascade,
  school_id    uuid not null references schools(id) on delete cascade,
  assigned_by  uuid references portal_users(id) on delete set null,
  assigned_at  timestamptz default now(),
  is_primary   boolean default false,   -- one "home" school
  notes        text,
  unique(teacher_id, school_id)
);

create index if not exists idx_teacher_schools_teacher on teacher_schools(teacher_id);
create index if not exists idx_teacher_schools_school  on teacher_schools(school_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table teacher_schools enable row level security;

-- Admins: full access
do $$ begin
  create policy "teacher_schools_admin_all" on teacher_schools for all
    using (exists (select 1 from portal_users where id = auth.uid() and role = 'admin'))
    with check (exists (select 1 from portal_users where id = auth.uid() and role = 'admin'));
exception when duplicate_object then null; end $$;

-- Teachers: can read their own assignments
do $$ begin
  create policy "teacher_schools_teacher_select" on teacher_schools for select
    using (teacher_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ── Add school_id to classes table (optional but useful) ─────
alter table classes
  add column if not exists school_id uuid references schools(id) on delete set null;

create index if not exists idx_classes_school on classes(school_id);

-- ============================================================
-- MIGRATION: 20240101000007_fix_cbt_and_enhancements.sql
-- ============================================================

-- ============================================================
-- Migration 007: Fix CBT session status and schema enhancements
-- ============================================================

-- Fix cbt_sessions status to support passed/failed outcomes
DO $$
BEGIN
  -- Drop old constraint if it exists
  ALTER TABLE public.cbt_sessions DROP CONSTRAINT IF EXISTS cbt_sessions_status_check;
  -- Add new constraint supporting passed/failed as well as legacy values
  ALTER TABLE public.cbt_sessions
    ADD CONSTRAINT cbt_sessions_status_check
    CHECK (status IN ('in_progress', 'completed', 'abandoned', 'passed', 'failed'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cbt_sessions status constraint update skipped: %', SQLERRM;
END $$;

-- Add answers column to cbt_sessions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='cbt_sessions' AND column_name='answers'
  ) THEN
    ALTER TABLE public.cbt_sessions ADD COLUMN answers JSONB;
  END IF;
END $$;

-- Add score column to cbt_sessions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='cbt_sessions' AND column_name='score'
  ) THEN
    ALTER TABLE public.cbt_sessions ADD COLUMN score INTEGER;
  END IF;
END $$;

-- Allow teachers to manage CBT exams (not just admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_exams' AND policyname='Teachers can manage CBT exams'
  ) THEN
    DROP POLICY IF EXISTS "Teachers can manage CBT exams" ON public.cbt_exams;
CREATE POLICY "Teachers can manage CBT exams" ON public.cbt_exams
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Allow teachers to manage CBT questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_questions' AND policyname='Teachers can manage CBT questions'
  ) THEN
    DROP POLICY IF EXISTS "Teachers can manage CBT questions" ON public.cbt_questions;
CREATE POLICY "Teachers can manage CBT questions" ON public.cbt_questions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Allow teachers to view all CBT sessions for exams they manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_sessions' AND policyname='Staff can view all CBT sessions'
  ) THEN
    DROP POLICY IF EXISTS "Staff can view all CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Staff can view all CBT sessions" ON public.cbt_sessions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Ensure attendance RLS allows teachers to manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='attendance' AND policyname='Teachers can manage attendance'
  ) THEN
    DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;
CREATE POLICY "Teachers can manage attendance" ON public.attendance
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Ensure class_sessions RLS allows teachers to manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='class_sessions' AND policyname='Teachers can manage class sessions'
  ) THEN
    DROP POLICY IF EXISTS "Teachers can manage class sessions" ON public.class_sessions;
CREATE POLICY "Teachers can manage class sessions" ON public.class_sessions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Enable RLS on class_sessions if not enabled
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

-- Allow students to view their own class sessions (via class enrollment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='class_sessions' AND policyname='Students can view class sessions'
  ) THEN
    DROP POLICY IF EXISTS "Students can view class sessions" ON public.class_sessions;
CREATE POLICY "Students can view class sessions" ON public.class_sessions
      FOR SELECT
      USING (true); -- public view; attendance itself is access-controlled
  END IF;
END $$;

-- Students can view their own attendance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='attendance' AND policyname='Students can view own attendance'
  ) THEN
    DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
CREATE POLICY "Students can view own attendance" ON public.attendance
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Messages policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Users can send messages'
  ) THEN
    DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
      FOR INSERT WITH CHECK (sender_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Users can view own messages'
  ) THEN
    DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages" ON public.messages
      FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Recipients can update read status'
  ) THEN
    DROP POLICY IF EXISTS "Recipients can update read status" ON public.messages;
CREATE POLICY "Recipients can update read status" ON public.messages
      FOR UPDATE USING (recipient_id = auth.uid());
  END IF;
END $$;

-- Announcements policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='announcements' AND policyname='All users can view announcements'
  ) THEN
    DROP POLICY IF EXISTS "All users can view announcements" ON public.announcements;
CREATE POLICY "All users can view announcements" ON public.announcements
      FOR SELECT USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='announcements' AND policyname='Staff can manage announcements'
  ) THEN
    DROP POLICY IF EXISTS "Staff can manage announcements" ON public.announcements;
CREATE POLICY "Staff can manage announcements" ON public.announcements
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Portal users can update their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='portal_users' AND policyname='Users can update own profile'
  ) THEN
    DROP POLICY IF EXISTS "Users can update own profile" ON public.portal_users;
CREATE POLICY "Users can update own profile" ON public.portal_users
      FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- MIGRATION: 20240101000008_student_enrollment_fields.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20240101000009_fix_schema_and_constraints.sql
-- ============================================================

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
  DROP POLICY IF EXISTS "schools_select_all" ON schools;
CREATE POLICY "schools_select_all" ON schools FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "schools_write_admin" ON schools;
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
  DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admins can insert notifications for any user
DO $$ BEGIN
  DROP POLICY IF EXISTS "notifications_admin_insert" ON notifications;
CREATE POLICY "notifications_admin_insert" ON notifications FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MIGRATION: 20240101000010_discussion_enhancements.sql
-- ============================================================

-- Discussion Forum Enhancements

-- 1. Flagging system for inappropriate content
CREATE TABLE IF NOT EXISTS flagged_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id),
    reporter_id UUID REFERENCES portal_users(id),
    content_type TEXT NOT NULL CHECK (content_type IN ('topic', 'reply')),
    content_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'removed')),
    moderator_id UUID REFERENCES portal_users(id),
    moderator_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flagged_content_type_id ON flagged_content(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_flagged_status ON flagged_content(status);

-- 2. Topic Subscriptions
CREATE TABLE IF NOT EXISTS topic_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES discussion_topics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(topic_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_subs_topic ON topic_subscriptions(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_subs_user ON topic_subscriptions(user_id);

-- 3. Reputation scoring updates (optional but good for Phase 8)
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0;

-- 4. RLS for new tables
ALTER TABLE flagged_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Staff can view all flags" ON flagged_content;
CREATE POLICY "Staff can view all flags" ON flagged_content
        FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can flag content" ON flagged_content;
CREATE POLICY "Users can flag content" ON flagged_content
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own subscriptions" ON topic_subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON topic_subscriptions
        FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON topic_subscriptions;
CREATE POLICY "Users can manage their own subscriptions" ON topic_subscriptions
        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MIGRATION: 20240101000011_gamification_schema.sql
-- ============================================================

-- gamification and certificates schema (Phase 9)

-- 1. Certificates
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id UUID REFERENCES portal_users(id),
    course_id UUID REFERENCES courses(id),
    certificate_number TEXT UNIQUE NOT NULL,
    verification_code TEXT UNIQUE NOT NULL,
    issued_date DATE NOT NULL,
    pdf_url TEXT,
    template_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Badges and Rewards
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    criteria JSONB,
    points_value INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id UUID REFERENCES portal_users(id),
    badge_id UUID REFERENCES badges(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    UNIQUE(portal_user_id, badge_id)
);

-- 3. Points and Leaderboards
CREATE TABLE IF NOT EXISTS user_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id UUID REFERENCES portal_users(id) UNIQUE,
    total_points INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    achievement_level TEXT CHECK (achievement_level IN ('Bronze', 'Silver', 'Gold', 'Platinum')) DEFAULT 'Bronze',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_user_id UUID REFERENCES portal_users(id),
    points INTEGER NOT NULL,
    activity_type TEXT NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id),
    portal_user_id UUID REFERENCES portal_users(id),
    points INTEGER DEFAULT 0,
    rank INTEGER,
    period_start DATE,
    period_end DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS Policies
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own certificates" ON certificates;
CREATE POLICY "Users can view their own certificates" ON certificates FOR SELECT USING (portal_user_id = auth.uid());
    DROP POLICY IF EXISTS "Public can verify via code" ON certificates;
CREATE POLICY "Public can verify via code" ON certificates FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Everyone can view badges" ON badges;
CREATE POLICY "Everyone can view badges" ON badges FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own badges" ON user_badges;
CREATE POLICY "Users can view their own badges" ON user_badges FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own points" ON user_points;
CREATE POLICY "Users can view their own points" ON user_points FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Everyone can view leaderboards" ON leaderboards;
CREATE POLICY "Everyone can view leaderboards" ON leaderboards FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MIGRATION: 20240101000012_analytics_schema.sql
-- ============================================================

-- Analytics and Reporting Schema (Phase 10)

-- 1. Activity Logs for Engagement Tracking
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES portal_users(id),
    school_id UUID REFERENCES schools(id),
    event_type TEXT NOT NULL, -- 'login', 'page_view', 'lesson_view', 'video_play', etc.
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Performance Tracking Views
CREATE OR REPLACE VIEW student_performance_summary AS
SELECT 
    p.id as student_id,
    p.full_name,
    p.school_id,
    COUNT(DISTINCT e.program_id) as enrolled_programs,
    AVG(ea.percentage) as avg_exam_score,
    AVG(asub.grade) as avg_assignment_grade,
    COUNT(DISTINCT lp.lesson_id) filter (where lp.status = 'completed') as lessons_completed
FROM portal_users p
LEFT JOIN enrollments e ON p.id = e.user_id
LEFT JOIN exam_attempts ea ON p.id = ea.portal_user_id AND ea.status = 'graded'
LEFT JOIN assignment_submissions asub ON p.id = asub.user_id AND asub.status = 'graded'
LEFT JOIN lesson_progress lp ON p.id = lp.portal_user_id AND lp.status = 'completed'
WHERE p.role = 'student'
GROUP BY p.id, p.full_name, p.school_id;

-- 3. At-Risk Detection Function
DROP FUNCTION IF EXISTS get_at_risk_students(uuid, integer);
CREATE OR REPLACE FUNCTION get_at_risk_students(p_school_id UUID, p_days_inactive INTEGER DEFAULT 7)
RETURNS TABLE (
    student_id UUID,
    full_name TEXT,
    last_login TIMESTAMPTZ,
    avg_grade NUMERIC,
    risk_level TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        MAX(al.created_at) as last_login,
        (COALESCE(avg_exam_score, 0) + COALESCE(avg_assignment_grade, 0)) / 2 as avg_grade,
        CASE 
            WHEN MAX(al.created_at) < NOW() - (p_days_inactive || ' days')::INTERVAL THEN 'High'
            WHEN (COALESCE(avg_exam_score, 0) + COALESCE(avg_assignment_grade, 0)) / 2 < 50 THEN 'High'
            WHEN MAX(al.created_at) < NOW() - (p_days_inactive/2 || ' days')::INTERVAL THEN 'Medium'
            ELSE 'Low'
        END as risk_level
    FROM portal_users p
    LEFT JOIN activity_logs al ON p.id = al.user_id AND al.event_type = 'login'
    LEFT JOIN student_performance_summary sps ON p.id = sps.student_id
    WHERE p.role = 'student' AND (p_school_id IS NULL OR p.school_id = p_school_id)
    GROUP BY p.id, p.full_name, sps.avg_exam_score, sps.avg_assignment_grade;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper Functions for Course Averages
CREATE OR REPLACE FUNCTION get_course_avg_exam_score(p_course_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT AVG(percentage)
        FROM exam_attempts
        WHERE exam_id IN (SELECT id FROM exams WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_avg_assignment_grade(p_course_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN (
        SELECT AVG(grade)
        FROM assignment_submissions
        WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$ LANGUAGE plpgsql;

-- 6. RLS for Analytics
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admins can view all logs" ON activity_logs;
CREATE POLICY "Admins can view all logs" ON activity_logs FOR SELECT USING (
        EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
    );
    DROP POLICY IF EXISTS "Users can view their own logs" ON activity_logs;
CREATE POLICY "Users can view their own logs" ON activity_logs FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MIGRATION: 20240101000013_complete_remaining_schema.sql
-- ============================================================

-- ============================================================
-- Migration 013: Complete missing schema tables
-- This ensures the database matches the "remote truth" of 51 tables
-- ============================================================

-- 1. Files table for generic storage
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  uploaded_by UUID REFERENCES portal_users(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  storage_provider TEXT CHECK (storage_provider IN ('s3', 'cloudinary')),
  public_url TEXT,
  thumbnail_url TEXT,
  is_virus_scanned BOOLEAN DEFAULT false,
  virus_scan_result TEXT,
  download_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Payment Transactions (supplemental to payments table)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  portal_user_id UUID REFERENCES portal_users(id),
  course_id UUID REFERENCES courses(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  payment_method TEXT CHECK (payment_method IN ('stripe', 'paystack', 'bank_transfer', 'online', 'card', 'cash')),
  payment_status TEXT CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
  transaction_reference TEXT UNIQUE,
  external_transaction_id TEXT,
  payment_gateway_response JSONB,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID REFERENCES portal_users(id),
  course_id UUID REFERENCES courses(id),
  subscription_plan TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  status TEXT CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')) DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  external_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id UUID REFERENCES portal_users(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  assignment_reminders BOOLEAN DEFAULT true,
  grade_notifications BOOLEAN DEFAULT true,
  announcement_notifications BOOLEAN DEFAULT true,
  discussion_replies BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Discussion Topics
CREATE TABLE IF NOT EXISTS discussion_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id),
  created_by UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  upvotes INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Discussion Replies
CREATE TABLE IF NOT EXISTS discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES discussion_topics(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES discussion_replies(id),
  created_by UUID REFERENCES portal_users(id),
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  is_accepted_answer BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Discussion Attachments
CREATE TABLE IF NOT EXISTS discussion_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES discussion_topics(id),
  reply_id UUID REFERENCES discussion_replies(id),
  file_id UUID REFERENCES files(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Content Library
CREATE TABLE IF NOT EXISTS content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  created_by UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT CHECK (content_type IN ('video', 'document', 'quiz', 'presentation', 'interactive')),
  file_id UUID REFERENCES files(id),
  category TEXT,
  tags TEXT[],
  subject TEXT,
  grade_level TEXT,
  license_type TEXT,
  attribution TEXT,
  version INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3,2),
  rating_count INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES portal_users(id),
  approved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Content Ratings
CREATE TABLE IF NOT EXISTS content_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content_library(id),
  portal_user_id UUID REFERENCES portal_users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id, portal_user_id)
);

-- 10. Live Sessions
CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id),
  instructor_id UUID REFERENCES portal_users(id),
  title TEXT NOT NULL,
  description TEXT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  meeting_url TEXT,
  meeting_id TEXT,
  meeting_password TEXT,
  provider TEXT CHECK (provider IN ('zoom', 'google_meet', 'microsoft_teams')),
  recording_url TEXT,
  status TEXT CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Live Session Attendance
CREATE TABLE IF NOT EXISTS live_session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_sessions(id),
  portal_user_id UUID REFERENCES portal_users(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, portal_user_id)
);

-- 12. Lesson Progress
CREATE TABLE IF NOT EXISTS lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  portal_user_id UUID REFERENCES portal_users(id),
  status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  progress_percentage INTEGER DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id, portal_user_id)
);

-- RLS Enablement
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- Basic Policies
-- Files
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view files from their school" ON files;
CREATE POLICY "Users can view files from their school" ON files FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND school_id = files.school_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Payments/Subscriptions
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own transactions" ON payment_transactions;
CREATE POLICY "Users can view their own transactions" ON payment_transactions FOR SELECT USING (portal_user_id = auth.uid());
    DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON subscriptions FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Discussions
DO $$ BEGIN
    DROP POLICY IF EXISTS "Everyone can view discussions" ON discussion_topics;
CREATE POLICY "Everyone can view discussions" ON discussion_topics FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Users can create discussions" ON discussion_topics;
CREATE POLICY "Users can create discussions" ON discussion_topics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    DROP POLICY IF EXISTS "Everyone can view replies" ON discussion_replies;
CREATE POLICY "Everyone can view replies" ON discussion_replies FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Users can create replies" ON discussion_replies;
CREATE POLICY "Users can create replies" ON discussion_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Content Library
DO $$ BEGIN
    DROP POLICY IF EXISTS "Instructors can view content library" ON content_library;
CREATE POLICY "Instructors can view content library" ON content_library FOR SELECT USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Live Sessions
DO $$ BEGIN
    DROP POLICY IF EXISTS "Enrolled students can view live sessions" ON live_sessions;
CREATE POLICY "Enrolled students can view live sessions" ON live_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM enrollments WHERE user_id = auth.uid() AND program_id = (SELECT program_id FROM courses WHERE id = live_sessions.course_id)));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Lesson Progress
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own progress" ON lesson_progress;
CREATE POLICY "Users can view their own progress" ON lesson_progress FOR SELECT USING (portal_user_id = auth.uid());
    DROP POLICY IF EXISTS "Users can update their own progress" ON lesson_progress;
CREATE POLICY "Users can update their own progress" ON lesson_progress FOR ALL USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_discussion_topics_updated_at ON discussion_topics;
CREATE TRIGGER update_discussion_topics_updated_at BEFORE UPDATE ON discussion_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_discussion_replies_updated_at ON discussion_replies;
CREATE TRIGGER update_discussion_replies_updated_at BEFORE UPDATE ON discussion_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_content_library_updated_at ON content_library;
CREATE TRIGGER update_content_library_updated_at BEFORE UPDATE ON content_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON live_sessions;
CREATE TRIGGER update_live_sessions_updated_at BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER update_lesson_progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION: 20240101000014_video_conferencing_phase11.sql
-- ============================================================

-- ============================================================
-- Migration 014: Video conferencing enhancements (Phase 11)
-- Adds advanced live session features: recording, breakout rooms,
-- screen sharing, and live polls/quizzes.
-- ============================================================

-- 1) Extend live_sessions with feature flags
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_breakout_rooms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_screen_sharing BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_polls BOOLEAN DEFAULT false;

-- 2) Breakout rooms
CREATE TABLE IF NOT EXISTS live_session_breakout_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_participants INTEGER,
  created_by UUID REFERENCES portal_users(id),
  status TEXT CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_breakout_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES live_session_breakout_rooms(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Live polls/quizzes
CREATE TABLE IF NOT EXISTS live_session_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  poll_type TEXT CHECK (poll_type IN ('poll', 'quiz')) DEFAULT 'poll',
  status TEXT CHECK (status IN ('draft', 'live', 'closed')) DEFAULT 'draft',
  allow_multiple BOOLEAN DEFAULT false,
  created_by UUID REFERENCES portal_users(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  order_index INTEGER,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_session_poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES live_session_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES live_session_poll_options(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES portal_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_breakout_rooms_session ON live_session_breakout_rooms (session_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_room ON live_session_breakout_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_user ON live_session_breakout_participants (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_polls_session ON live_session_polls (session_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON live_session_poll_options (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON live_session_poll_responses (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user ON live_session_poll_responses (portal_user_id);

-- 5) RLS enablement
ALTER TABLE live_session_breakout_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_breakout_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_session_poll_responses ENABLE ROW LEVEL SECURITY;

-- 6) Policies
-- Staff manage breakout rooms and polls
DO $$ BEGIN
  DROP POLICY IF EXISTS "Staff manage breakout rooms" ON live_session_breakout_rooms;
CREATE POLICY "Staff manage breakout rooms" ON live_session_breakout_rooms
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
  DROP POLICY IF EXISTS "Staff manage polls" ON live_session_polls;
CREATE POLICY "Staff manage polls" ON live_session_polls
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
  DROP POLICY IF EXISTS "Staff manage poll options" ON live_session_poll_options;
CREATE POLICY "Staff manage poll options" ON live_session_poll_options
    FOR ALL USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enrolled students can view rooms/polls for sessions they can access
DO $$ BEGIN
  DROP POLICY IF EXISTS "Enrolled users view breakout rooms" ON live_session_breakout_rooms;
CREATE POLICY "Enrolled users view breakout rooms" ON live_session_breakout_rooms
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments
      WHERE user_id = auth.uid()
        AND program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = live_session_breakout_rooms.session_id))
    ));
  DROP POLICY IF EXISTS "Enrolled users view polls" ON live_session_polls;
CREATE POLICY "Enrolled users view polls" ON live_session_polls
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments
      WHERE user_id = auth.uid()
        AND program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = live_session_polls.session_id))
    ));
  DROP POLICY IF EXISTS "Enrolled users view poll options" ON live_session_poll_options;
CREATE POLICY "Enrolled users view poll options" ON live_session_poll_options
    FOR SELECT USING (EXISTS (
      SELECT 1 FROM enrollments e
      JOIN live_session_polls p ON p.id = live_session_poll_options.poll_id
      WHERE e.user_id = auth.uid()
        AND e.program_id = (SELECT program_id FROM courses WHERE id = (SELECT course_id FROM live_sessions WHERE id = p.session_id))
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Participants can manage their own responses
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users respond to polls" ON live_session_poll_responses;
CREATE POLICY "Users respond to polls" ON live_session_poll_responses
    FOR INSERT WITH CHECK (portal_user_id = auth.uid());
  DROP POLICY IF EXISTS "Users view own poll responses" ON live_session_poll_responses;
CREATE POLICY "Users view own poll responses" ON live_session_poll_responses
    FOR SELECT USING (portal_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 7) updated_at triggers
DO $$ BEGIN
DROP TRIGGER IF EXISTS update_live_session_breakout_rooms_updated_at ON live_session_breakout_rooms;
  CREATE TRIGGER update_live_session_breakout_rooms_updated_at
    BEFORE UPDATE ON live_session_breakout_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_live_session_polls_updated_at ON live_session_polls;
  CREATE TRIGGER update_live_session_polls_updated_at
    BEFORE UPDATE ON live_session_polls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- MIGRATION: 20240101000015_notification_templates.sql
-- ============================================================

-- Migration: Create notification_templates table
-- Required by templates.service.ts for sendEmail/sendSMS template rendering

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('email', 'push', 'sms', 'in_app')) NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, type)
);

-- RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read active templates" ON notification_templates;
CREATE POLICY "Authenticated users can read active templates"
  ON notification_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage templates" ON notification_templates;
CREATE POLICY "Admins can manage templates"
  ON notification_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

GRANT SELECT ON notification_templates TO authenticated;
GRANT ALL ON notification_templates TO service_role;

-- Seed standard templates used by the system
INSERT INTO notification_templates (name, type, subject, content, variables) VALUES
(
  'Assignment Reminder',
  'email',
  'Reminder: Assignment {{assignment_name}} is due soon',
  '<p>Hi {{user_name}},</p><p>This is a reminder that your assignment <strong>{{assignment_name}}</strong> is due on {{due_date}}.</p><p>Please ensure you submit it on time.</p>',
  '{"user_name": "string", "assignment_name": "string", "due_date": "string"}'
),
(
  'Grade Published',
  'email',
  'New Grade Published: {{course_name}}',
  '<p>Hi {{user_name}},</p><p>A new grade has been published for your work in <strong>{{course_name}}</strong>.</p><p>Grade: {{grade}}</p><p>Comment: {{notes}}</p>',
  '{"user_name": "string", "course_name": "string", "grade": "string", "notes": "string"}'
),
(
  'New Announcement',
  'email',
  'New Announcement: {{title}}',
  '<p>A new announcement has been posted:</p><h3>{{title}}</h3><p>{{content}}</p>',
  '{"title": "string", "content": "string"}'
),
(
  'Announcement SMS',
  'sms',
  NULL,
  'LMS Announcement: {{title}}. Check your portal for details.',
  '{"title": "string"}'
)
ON CONFLICT (name, type) DO NOTHING;

-- ============================================================
-- MIGRATION: 20240304000000_security_hardening.sql
-- ============================================================

-- =================================================================
-- MIGRATION: Security hardening and schema enhancements
-- Fixes public access to sensitive data and adds auditing columns
-- =================================================================

-- 1. ADD AUDITING COLUMNS
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES portal_users(id);
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES portal_users(id);
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 2. HARDEN RLS POLICIES (DROP LOOSE POLICIES)
DROP POLICY IF EXISTS "Public can view students" ON students;
DROP POLICY IF EXISTS "Public can view CBT exams" ON cbt_exams;
DROP POLICY IF EXISTS "Public can view CBT questions" ON cbt_questions;
DROP POLICY IF EXISTS "Public can view materials" ON course_materials;
DROP POLICY IF EXISTS "Public can view assignments" ON assignments;

-- 3. APPLY SECURE POLICIES

-- Students visibility: Admins see all, Staff see their assigned school's students
DROP POLICY IF EXISTS "Staff can view students" ON students;
CREATE POLICY "Staff can view students" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users 
      WHERE id = auth.uid() 
      AND (
        role = 'admin' OR 
        role = 'teacher' OR 
        (role = 'school' AND school_id = students.school_id)
      )
    )
  );

-- CBT Exams: Only authenticated users can see active exams
DROP POLICY IF EXISTS "Authenticated users can view active CBT exams" ON cbt_exams;
CREATE POLICY "Authenticated users can view active CBT exams" ON cbt_exams
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (is_active = true OR EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin'))
  );

-- CBT Questions: ONLY staff can view questions directly (students see them via session/API if needed)
DROP POLICY IF EXISTS "Staff can view CBT questions" ON cbt_questions;
CREATE POLICY "Staff can view CBT questions" ON cbt_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- Assignments: Staff manage, students see assigned
DROP POLICY IF EXISTS "Students can view assignments" ON assignments;
CREATE POLICY "Students can view assignments" ON assignments
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Materials: Only authenticated
DROP POLICY IF EXISTS "Authenticated users can view materials" ON course_materials;
CREATE POLICY "Authenticated users can view materials" ON course_materials
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- MIGRATION: 20260305000001_student_progress_reports.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20260305000002_add_photo_url.sql
-- ============================================================

-- Add photo_url to student_progress_reports
ALTER TABLE public.student_progress_reports
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Also add it to portal_users if missing (for student profile)
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS photo_url text;

-- ============================================================
-- MIGRATION: 20260305000003_assignment_questions.sql
-- ============================================================

-- Add questions column to assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='assignments' AND column_name='questions'
  ) THEN
    ALTER TABLE public.assignments ADD COLUMN questions JSONB;
  END IF;
END $$;

-- Update RLS for assignments to be more robust
DROP POLICY IF EXISTS "Admins can manage assignments" ON assignments;
DROP POLICY IF EXISTS "Staff can manage assignments" ON assignments;
CREATE POLICY "Staff can manage assignments" ON assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- ============================================================
-- MIGRATION: 20260305000004_add_created_by_to_students.sql
-- ============================================================

-- Add created_by column to students table
ALTER TABLE IF EXISTS "public"."students" ADD COLUMN IF NOT EXISTS "created_by" UUID REFERENCES "public"."portal_users"("id");

-- ============================================================
-- MIGRATION: 20260305000005_lesson_enhancements.sql
-- ============================================================

-- Lesson Enhancements: Plans and Materials
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  objectives TEXT,
  activities TEXT,
  assessment_methods TEXT,
  staff_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lesson_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT, -- 'pdf', 'video', 'link', 'image', 'document'
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add layout/canvas field to lessons
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS content_layout JSONB DEFAULT '[]'::jsonb;

-- Enable RLS
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;

-- Policies
-- Lesson Plans: Staff only
DO $$ BEGIN
  DROP POLICY IF EXISTS "staff_read_plans" ON public.lesson_plans;
CREATE POLICY "staff_read_plans" ON public.lesson_plans FOR SELECT
    USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "staff_write_plans" ON public.lesson_plans;
CREATE POLICY "staff_write_plans" ON public.lesson_plans FOR ALL
    USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lesson Materials: Everyone can read public ones
DO $$ BEGIN
  DROP POLICY IF EXISTS "read_public_materials" ON public.lesson_materials;
CREATE POLICY "read_public_materials" ON public.lesson_materials FOR SELECT
    USING (is_public = TRUE OR EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "staff_write_materials" ON public.lesson_materials;
CREATE POLICY "staff_write_materials" ON public.lesson_materials FOR ALL
    USING (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')))
    WITH CHECK (EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin','teacher')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- MIGRATION: 20260305000006_student_created_by.sql
-- ============================================================

-- Add created_by to students table
ALTER TABLE IF EXISTS public.students 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.portal_users(id);

-- Update RLS policies to allow teachers to see students they created
DROP POLICY IF EXISTS "Teachers can view their own registered students" ON public.students;
CREATE POLICY "Teachers can view their own registered students" ON public.students
FOR SELECT TO authenticated
USING (
  (auth.uid() = created_by) OR
  EXISTS (
    SELECT 1 FROM teacher_schools
    WHERE teacher_schools.teacher_id = auth.uid()
    AND teacher_schools.school_id = students.school_id
  ) OR
  (SELECT role FROM portal_users WHERE id = auth.uid()) = 'admin'
);

-- ============================================================
-- MIGRATION: 20260305000007_report_builder_tables.sql
-- ============================================================

-- Create student_progress_reports table
CREATE TABLE IF NOT EXISTS public.student_progress_reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id uuid REFERENCES public.portal_users(id) ON DELETE CASCADE,
    teacher_id uuid REFERENCES public.portal_users(id),
    school_id uuid REFERENCES public.schools(id),
    course_id uuid REFERENCES public.courses(id),
    student_name text,
    school_name text,
    section_class text,
    course_name text,
    report_date date DEFAULT CURRENT_DATE,
    report_term text,
    report_period text,
    instructor_name text,
    current_module text,
    next_module text,
    learning_milestones jsonb DEFAULT '[]'::jsonb,
    course_duration text,
    theory_score numeric DEFAULT 0,
    practical_score numeric DEFAULT 0,
    attendance_score numeric DEFAULT 0,
    participation_grade text,
    projects_grade text,
    homework_grade text,
    assignments_grade text,
    overall_grade text,
    overall_score numeric DEFAULT 0,
    key_strengths text,
    areas_for_growth text,
    instructor_assessment text,
    has_certificate boolean DEFAULT false,
    certificate_text text,
    course_completed text,
    proficiency_level text CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced')),
    is_published boolean DEFAULT false,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create report_settings table
CREATE TABLE IF NOT EXISTS public.report_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id uuid REFERENCES public.portal_users(id) UNIQUE,
    school_id uuid REFERENCES public.schools(id),
    org_name text,
    org_tagline text,
    org_address text,
    org_phone text,
    org_email text,
    org_website text,
    logo_url text,
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

-- student_progress_reports Policies (drop first to be idempotent)
DROP POLICY IF EXISTS "Students can view their own published reports" ON public.student_progress_reports;
DROP POLICY IF EXISTS "Staff can manage all reports" ON public.student_progress_reports;

CREATE POLICY "Students can view their own published reports" ON public.student_progress_reports
FOR SELECT TO authenticated
USING (auth.uid() = student_id AND is_published = true);

DROP POLICY IF EXISTS "Staff can manage all reports" ON public.student_progress_reports;
CREATE POLICY "Staff can manage all reports" ON public.student_progress_reports
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM portal_users
        WHERE id = auth.uid() AND (role = 'admin' OR role = 'teacher')
    )
    OR (SELECT role FROM portal_users WHERE id = auth.uid()) = 'admin'
);

-- report_settings Policies (drop first to be idempotent)
DROP POLICY IF EXISTS "Public read for report settings" ON public.report_settings;
DROP POLICY IF EXISTS "Staff can manage their own report settings" ON public.report_settings;

CREATE POLICY "Public read for report settings" ON public.report_settings
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Staff can manage their own report settings" ON public.report_settings;
CREATE POLICY "Staff can manage their own report settings" ON public.report_settings
FOR ALL TO authenticated
USING (
    auth.uid() = teacher_id OR
    (SELECT role FROM portal_users WHERE id = auth.uid()) = 'admin'
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_spr_student ON public.student_progress_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_spr_teacher ON public.student_progress_reports(teacher_id);
CREATE INDEX IF NOT EXISTS idx_spr_school ON public.student_progress_reports(school_id);

-- ============================================================
-- MIGRATION: 20260305000008_fix_portal_users_columns.sql
-- ============================================================

-- Add photo_url to portal_users if it's missing but expected by the app
ALTER TABLE IF EXISTS public.portal_users 
ADD COLUMN IF NOT EXISTS photo_url text;

-- Also ensure student_progress_reports has all columns from results page
ALTER TABLE IF EXISTS public.student_progress_reports
ADD COLUMN IF NOT EXISTS section_class text,
ADD COLUMN IF NOT EXISTS school_name text;

-- (Already added these in previous migration but double checking)

-- ============================================================
-- MIGRATION: 20260305000009_at_risk_rpc.sql
-- ============================================================

-- RPC to get at-risk students
DROP FUNCTION IF EXISTS public.get_at_risk_students(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_at_risk_students(
    p_school_id uuid DEFAULT NULL,
    p_days_inactive integer DEFAULT 7
)
RETURNS TABLE (
    student_id uuid,
    full_name text,
    last_login timestamptz,
    avg_grade numeric,
    risk_level text
) AS $$
BEGIN
    RETURN QUERY
    WITH student_metrics AS (
        SELECT 
            u.id as s_id,
            u.full_name as name,
            u.last_login as last_act,
            COALESCE(AVG(spr.overall_score), 0) as avg_score,
            COALESCE(AVG(spr.attendance_score), 0) as avg_attendance
        FROM 
            portal_users u
        LEFT JOIN 
            student_progress_reports spr ON u.id = spr.student_id
        WHERE 
            u.role = 'student'
            AND (p_school_id IS NULL OR u.school_id = p_school_id)
        GROUP BY 
            u.id, u.full_name, u.last_login
    )
    SELECT 
        s_id,
        name,
        last_act,
        avg_score,
        CASE 
            WHEN avg_score < 40 OR avg_attendance < 50 THEN 'High'
            WHEN avg_score < 60 OR avg_attendance < 70 THEN 'Medium'
            ELSE 'Low'
        END as risk_level
    FROM 
        student_metrics
    WHERE 
        avg_score < 60 
        OR avg_attendance < 70 
        OR last_act < (NOW() - (p_days_inactive || ' days')::interval);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MIGRATION: 20260305000010_ensure_created_by.sql
-- ============================================================

-- Ensure created_by exists on students and portal_users
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE "public"."students" ADD COLUMN "created_by" UUID REFERENCES "public"."portal_users"("id");
    EXCEPTION WHEN duplicate_column THEN
        -- Already exists
    END;
    
    BEGIN
        ALTER TABLE "public"."portal_users" ADD COLUMN "created_by" UUID REFERENCES "public"."portal_users"("id");
    EXCEPTION WHEN duplicate_column THEN
        -- Already exists
    END;
END $$;

-- ============================================================
-- MIGRATION: 20260305000011_fix_generated_and_constraints.sql
-- ============================================================

-- Migration: Fix GENERATED column, add UNIQUE constraint, fix view, add last_accessed_at
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE guards)

-- 1. Drop GENERATED expression from overall_score so reports/builder can insert it directly
--    (was: GENERATED ALWAYS AS (ROUND(theory_score*0.4 + practical_score*0.4 + attendance_score*0.2, 2)) STORED)
ALTER TABLE public.student_progress_reports
  ALTER COLUMN overall_score DROP EXPRESSION IF EXISTS;

ALTER TABLE public.student_progress_reports
  ALTER COLUMN overall_score SET DEFAULT 0;

-- 2. Add UNIQUE constraint to lesson_plans.lesson_id
--    Required for lessons/[id]/edit upsert with onConflict: 'lesson_id'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_plans_lesson_id_unique'
  ) THEN
    ALTER TABLE public.lesson_plans ADD CONSTRAINT lesson_plans_lesson_id_unique UNIQUE (lesson_id);
  END IF;
END $$;

-- 3. Add last_accessed_at to lesson_progress (analytics service uses it)
ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz DEFAULT now();

-- 4. Fix student_performance_summary view to use cbt_sessions instead of exam_attempts
--    (The app's CBT system uses cbt_sessions; exam_attempts is an older system with no data)
CREATE OR REPLACE VIEW public.student_performance_summary AS
SELECT
    p.id AS student_id,
    p.full_name,
    p.school_id,
    COUNT(DISTINCT e.program_id) AS enrolled_programs,
    COALESCE(AVG(cs.score), 0) AS avg_exam_score,
    COALESCE(AVG(asub.grade), 0) AS avg_assignment_grade,
    COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'completed') AS lessons_completed
FROM public.portal_users p
LEFT JOIN public.enrollments e ON p.id = e.user_id
LEFT JOIN public.cbt_sessions cs ON p.id = cs.user_id
    AND cs.status IN ('passed', 'failed', 'completed')
LEFT JOIN public.assignment_submissions asub ON p.id = asub.portal_user_id
    AND asub.status = 'graded'
LEFT JOIN public.lesson_progress lp ON p.id = lp.portal_user_id
WHERE p.role = 'student'
GROUP BY p.id, p.full_name, p.school_id;

