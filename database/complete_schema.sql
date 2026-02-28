-- Complete Database Schema for Rillcod Academy
-- This schema supports a scalable academy management system

-- ========================================
-- CORE USER MANAGEMENT TABLES
-- ========================================

-- Portal Users (for login/authentication)
create table if not exists portal_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text not null,
  role text check (role in ('admin', 'teacher', 'student')) not null,
  is_active boolean default false,
  profile_image_url text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User Profiles (extended user information)
create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade,
  bio text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  address text,
  city text,
  state text,
  country text default 'Nigeria',
  postal_code text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- SCHOOL MANAGEMENT TABLES
-- ========================================

-- Schools
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,
  country text default 'Nigeria',
  phone text,
  email text,
  website text,
  principal_name text,
  principal_phone text,
  principal_email text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- STUDENT MANAGEMENT TABLES
-- ========================================

-- Students (prospective students who register)
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  school_name text,
  current_class text,
  address text,
  city text,
  state text,
  country text default 'Nigeria',
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  medical_conditions text,
  allergies text,
  previous_programming_experience text,
  interests text,
  goals text,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  approved_by uuid references portal_users(id),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Student Enrollments (when approved students join programs)
create table if not exists student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  enrollment_date date not null,
  status text check (status in ('active', 'completed', 'dropped', 'suspended')) default 'active',
  completion_date date,
  grade text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, program_id)
);

-- ========================================
-- PROGRAM & COURSE MANAGEMENT TABLES
-- ========================================

-- Programs (main programs like ICT Fundamentals, Python Programming, etc.)
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  duration_weeks integer,
  difficulty_level text check (difficulty_level in ('beginner', 'intermediate', 'advanced')),
  price decimal(10,2),
  max_students integer,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Courses (individual courses within programs)
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  title text not null,
  description text,
  content text,
  duration_hours integer,
  order_index integer,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Course Materials (files, videos, documents)
create table if not exists course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  file_url text,
  file_type text check (file_type in ('pdf', 'video', 'image', 'document', 'link')),
  file_size integer,
  order_index integer,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- ASSIGNMENT & ASSESSMENT TABLES
-- ========================================

-- Assignments
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  instructions text,
  due_date timestamptz,
  max_points integer default 100,
  assignment_type text check (assignment_type in ('homework', 'project', 'quiz', 'exam', 'presentation')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Assignment Submissions
create table if not exists assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  submission_text text,
  file_url text,
  submitted_at timestamptz default now(),
  graded_by uuid references portal_users(id),
  grade integer,
  feedback text,
  graded_at timestamptz,
  status text check (status in ('submitted', 'graded', 'late', 'missing')) default 'submitted'
);

-- ========================================
-- CLASS & SCHEDULE MANAGEMENT TABLES
-- ========================================

-- Classes (specific class sessions)
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  teacher_id uuid references portal_users(id),
  name text not null,
  description text,
  start_date date,
  end_date date,
  schedule text, -- JSON or text describing schedule
  max_students integer,
  current_students integer default 0,
  status text check (status in ('scheduled', 'active', 'completed', 'cancelled')) default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Class Sessions (individual class meetings)
create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  title text not null,
  description text,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  location text,
  meeting_url text, -- for online sessions
  is_online boolean default false,
  status text check (status in ('scheduled', 'completed', 'cancelled')) default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Attendance
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references class_sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  status text check (status in ('present', 'absent', 'late', 'excused')) default 'present',
  notes text,
  recorded_by uuid references portal_users(id),
  created_at timestamptz default now(),
  unique(session_id, student_id)
);

-- ========================================
-- COMMUNICATION & NOTIFICATION TABLES
-- ========================================

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade,
  title text not null,
  message text not null,
  type text check (type in ('info', 'warning', 'error', 'success')),
  is_read boolean default false,
  read_at timestamptz,
  action_url text,
  created_at timestamptz default now()
);

-- Messages (internal messaging system)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references portal_users(id) on delete cascade,
  recipient_id uuid references portal_users(id) on delete cascade,
  subject text,
  message text not null,
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- ========================================
-- PAYMENT & FINANCIAL TABLES
-- ========================================

-- Payments
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  amount decimal(10,2) not null,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'card', 'online')),
  payment_status text check (payment_status in ('pending', 'completed', 'failed', 'refunded')) default 'pending',
  transaction_id text,
  payment_date timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- SYSTEM & AUDIT TABLES
-- ========================================

-- System Settings
create table if not exists system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value text,
  description text,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Audit Logs
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id),
  action text not null,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Portal Users indexes
create index if not exists idx_portal_users_email on portal_users(email);
create index if not exists idx_portal_users_role on portal_users(role);
create index if not exists idx_portal_users_active on portal_users(is_active);

-- Students indexes
create index if not exists idx_students_status on students(status);
create index if not exists idx_students_parent_email on students(parent_email);
create index if not exists idx_students_approved_by on students(approved_by);

-- Enrollments indexes
create index if not exists idx_enrollments_student on student_enrollments(student_id);
create index if not exists idx_enrollments_program on student_enrollments(program_id);
create index if not exists idx_enrollments_status on student_enrollments(status);

-- Programs indexes
create index if not exists idx_programs_active on programs(is_active);
create index if not exists idx_programs_difficulty on programs(difficulty_level);

-- Courses indexes
create index if not exists idx_courses_program on courses(program_id);
create index if not exists idx_courses_active on courses(is_active);

-- Assignments indexes
create index if not exists idx_assignments_course on assignments(course_id);
create index if not exists idx_assignments_due_date on assignments(due_date);

-- Submissions indexes
create index if not exists idx_submissions_assignment on assignment_submissions(assignment_id);
create index if not exists idx_submissions_student on assignment_submissions(student_id);
create index if not exists idx_submissions_status on assignment_submissions(status);

-- Classes indexes
create index if not exists idx_classes_program on classes(program_id);
create index if not exists idx_classes_teacher on classes(teacher_id);
create index if not exists idx_classes_status on classes(status);

-- Sessions indexes
create index if not exists idx_sessions_class on class_sessions(class_id);
create index if not exists idx_sessions_date on class_sessions(session_date);

-- Attendance indexes
create index if not exists idx_attendance_session on attendance(session_id);
create index if not exists idx_attendance_student on attendance(student_id);

-- Notifications indexes
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_read on notifications(is_read);

-- Messages indexes
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_messages_recipient on messages(recipient_id);
create index if not exists idx_messages_read on messages(is_read);

-- Payments indexes
create index if not exists idx_payments_student on payments(student_id);
create index if not exists idx_payments_status on payments(payment_status);

-- Audit logs indexes
create index if not exists idx_audit_logs_user on audit_logs(user_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_created on audit_logs(created_at);

-- ========================================
-- TRIGGERS FOR UPDATED_AT
-- ========================================

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply triggers to tables with updated_at
create trigger update_portal_users_updated_at before update on portal_users for each row execute function update_updated_at_column();
create trigger update_user_profiles_updated_at before update on user_profiles for each row execute function update_updated_at_column();
create trigger update_schools_updated_at before update on schools for each row execute function update_updated_at_column();
create trigger update_students_updated_at before update on students for each row execute function update_updated_at_column();
create trigger update_enrollments_updated_at before update on student_enrollments for each row execute function update_updated_at_column();
create trigger update_programs_updated_at before update on programs for each row execute function update_updated_at_column();
create trigger update_courses_updated_at before update on courses for each row execute function update_updated_at_column();
create trigger update_materials_updated_at before update on course_materials for each row execute function update_updated_at_column();
create trigger update_assignments_updated_at before update on assignments for each row execute function update_updated_at_column();
create trigger update_submissions_updated_at before update on assignment_submissions for each row execute function update_updated_at_column();
create trigger update_classes_updated_at before update on classes for each row execute function update_updated_at_column();
create trigger update_sessions_updated_at before update on class_sessions for each row execute function update_updated_at_column();
create trigger update_payments_updated_at before update on payments for each row execute function update_updated_at_column();
create trigger update_settings_updated_at before update on system_settings for each row execute function update_updated_at_column();

-- ========================================
-- INITIAL DATA
-- ========================================

-- Insert default programs
insert into programs (name, description, duration_weeks, difficulty_level, price, max_students) values
('ICT Fundamentals', 'Basic computer skills and digital literacy', 8, 'beginner', 50000, 20),
('Scratch Programming', 'Visual programming for beginners', 10, 'beginner', 75000, 15),
('HTML/CSS Programming', 'Web development fundamentals', 12, 'beginner', 100000, 15),
('Python Programming', 'Advanced programming concepts', 16, 'intermediate', 150000, 12),
('Web Design', 'Creative web design skills', 14, 'intermediate', 120000, 12),
('Robotics Programming', 'Robotics and automation', 18, 'advanced', 200000, 10)
on conflict (name) do nothing;

-- Insert default system settings
insert into system_settings (setting_key, setting_value, description, is_public) values
('academy_name', 'Rillcod Academy', 'Name of the academy', true),
('academy_email', 'info@rillcod.com', 'Primary contact email', true),
('academy_phone', '+234 123 456 7890', 'Primary contact phone', true),
('academy_address', 'Lagos, Nigeria', 'Academy address', true),
('max_students_per_class', '20', 'Maximum students allowed per class', false),
('auto_approve_students', 'false', 'Automatically approve student registrations', false),
('require_teacher_approval', 'true', 'Require admin approval for teachers', false)
on conflict (setting_key) do nothing;

-- ========================================
-- RLS POLICIES (Basic setup)
-- ========================================

-- Enable RLS on all tables
alter table portal_users enable row level security;
alter table user_profiles enable row level security;
alter table students enable row level security;
alter table student_enrollments enable row level security;
alter table programs enable row level security;
alter table courses enable row level security;
alter table assignments enable row level security;
alter table assignment_submissions enable row level security;
alter table classes enable row level security;
alter table class_sessions enable row level security;
alter table attendance enable row level security;
alter table notifications enable row level security;
alter table messages enable row level security;
alter table payments enable row level security;

-- Basic policies (you can expand these based on your needs)
create policy "Allow all operations for now" on portal_users for all using (true) with check (true);
create policy "Allow all operations for now" on students for all using (true) with check (true);
create policy "Allow all operations for now" on programs for all using (true) with check (true);
create policy "Allow all operations for now" on courses for all using (true) with check (true);
create policy "Allow all operations for now" on assignments for all using (true) with check (true);
create policy "Allow all operations for now" on classes for all using (true) with check (true);

-- ========================================
-- FINAL SETUP
-- ========================================

-- Grant permissions
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Display table count
select 
  schemaname,
  tablename,
  tableowner
from pg_tables 
where schemaname = 'public' 
order by tablename; 