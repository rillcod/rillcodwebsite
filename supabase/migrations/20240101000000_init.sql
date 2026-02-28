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
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_portal_users_updated_at BEFORE UPDATE ON portal_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON course_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON class_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cbt_exams_updated_at BEFORE UPDATE ON cbt_exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cbt_questions_updated_at BEFORE UPDATE ON cbt_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cbt_sessions_updated_at BEFORE UPDATE ON cbt_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
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
CREATE POLICY "Public can view schools" ON schools FOR SELECT USING (true);
CREATE POLICY "Public can insert schools" ON schools FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage schools" ON schools FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Students policies (legacy table)
CREATE POLICY "Public can insert students" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view students" ON students FOR SELECT USING (true);
CREATE POLICY "Admins can manage students" ON students FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- =============================
-- RLS POLICIES FOR PORTAL TABLES
-- =============================

-- Portal Users policies
CREATE POLICY "Users can view their own profile" ON portal_users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON portal_users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admins can manage all users" ON portal_users FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Programs policies
CREATE POLICY "Public can view programs" ON programs FOR SELECT USING (true);
CREATE POLICY "Admins can manage programs" ON programs FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Courses policies
CREATE POLICY "Public can view courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Admins can manage courses" ON courses FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Course Materials policies
CREATE POLICY "Public can view materials" ON course_materials FOR SELECT USING (true);
CREATE POLICY "Admins can manage materials" ON course_materials FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Enrollments policies
CREATE POLICY "Users can view their enrollments" ON enrollments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage enrollments" ON enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Assignments policies
CREATE POLICY "Public can view assignments" ON assignments FOR SELECT USING (true);
CREATE POLICY "Admins can manage assignments" ON assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Assignment Submissions policies
CREATE POLICY "Students can view their submissions" ON assignment_submissions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Students can submit assignments" ON assignment_submissions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage submissions" ON assignment_submissions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Classes policies
CREATE POLICY "Public can view classes" ON classes FOR SELECT USING (true);
CREATE POLICY "Admins can manage classes" ON classes FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Class Sessions policies
CREATE POLICY "Public can view sessions" ON class_sessions FOR SELECT USING (true);
CREATE POLICY "Admins can manage sessions" ON class_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Attendance policies
CREATE POLICY "Students can view their attendance" ON attendance FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage attendance" ON attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- CBT policies
CREATE POLICY "Public can view CBT exams" ON cbt_exams FOR SELECT USING (true);
CREATE POLICY "Admins can manage CBT" ON cbt_exams FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Public can view CBT questions" ON cbt_questions FOR SELECT USING (true);
CREATE POLICY "Admins can manage CBT questions" ON cbt_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Students can view their CBT sessions" ON cbt_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Students can take CBT" ON cbt_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage CBT sessions" ON cbt_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Communication policies
CREATE POLICY "Users can view their notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update their notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins can manage notifications" ON notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can view their messages" ON messages FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Admins can manage messages" ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Public can view announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Admins can manage announcements" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Payments policies
CREATE POLICY "Users can view their payments" ON payments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage payments" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- System Settings policies
CREATE POLICY "Public can view public settings" ON system_settings FOR SELECT USING (is_public = true);
CREATE POLICY "Admins can manage settings" ON system_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Audit Logs policies
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

-- Reports policies
CREATE POLICY "Admins can manage reports" ON report_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
);

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