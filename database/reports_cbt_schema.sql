-- Report Generation and CBT (Computer-Based Testing) Schema
-- Comprehensive system for reports and online testing

-- ========================================
-- CBT (COMPUTER-BASED TESTING) TABLES
-- ========================================

-- CBT Exams
create table if not exists cbt_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  program_id uuid references programs(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  exam_type text check (exam_type in ('practice', 'midterm', 'final', 'placement', 'certification')),
  difficulty_level text check (difficulty_level in ('easy', 'medium', 'hard', 'expert')),
  total_questions integer not null,
  time_limit_minutes integer not null,
  passing_score integer not null,
  max_attempts integer default 1,
  is_randomized boolean default true,
  show_results_immediately boolean default false,
  allow_review boolean default true,
  instructions text,
  is_active boolean default true,
  created_by uuid references portal_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CBT Questions
create table if not exists cbt_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references cbt_exams(id) on delete cascade,
  question_text text not null,
  question_type text check (question_type in ('multiple_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering')),
  difficulty_level text check (difficulty_level in ('easy', 'medium', 'hard')),
  points integer default 1,
  time_limit_seconds integer, -- Individual question time limit
  image_url text, -- For questions with images
  explanation text, -- Explanation of correct answer
  tags text[], -- For categorization
  is_active boolean default true,
  order_index integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CBT Question Options (for multiple choice, matching, etc.)
create table if not exists cbt_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references cbt_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean default false,
  explanation text, -- Why this option is correct/incorrect
  order_index integer,
  created_at timestamptz default now()
);

-- CBT Exam Sessions (when students take exams)
create table if not exists cbt_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references cbt_exams(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  attempt_number integer default 1,
  start_time timestamptz default now(),
  end_time timestamptz,
  time_taken_minutes integer,
  score integer,
  percentage_score decimal(5,2),
  passed boolean,
  status text check (status in ('in_progress', 'completed', 'abandoned', 'timeout')) default 'in_progress',
  ip_address inet,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CBT Student Answers
create table if not exists cbt_student_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references cbt_exam_sessions(id) on delete cascade,
  question_id uuid references cbt_questions(id) on delete cascade,
  selected_options uuid[], -- Array of selected option IDs
  answer_text text, -- For essay/fill in blank questions
  is_correct boolean,
  points_earned integer default 0,
  time_taken_seconds integer,
  answered_at timestamptz default now()
);

-- CBT Exam Results (aggregated results)
create table if not exists cbt_exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references cbt_exams(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  best_session_id uuid references cbt_exam_sessions(id),
  best_score integer,
  best_percentage decimal(5,2),
  total_attempts integer default 0,
  average_score decimal(5,2),
  first_attempt_date timestamptz,
  last_attempt_date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(exam_id, student_id)
);

-- CBT Question Banks (for organizing questions)
create table if not exists cbt_question_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  program_id uuid references programs(id) on delete cascade,
  created_by uuid references portal_users(id),
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CBT Question Bank Questions (many-to-many relationship)
create table if not exists cbt_question_bank_questions (
  id uuid primary key default gen_random_uuid(),
  question_bank_id uuid references cbt_question_banks(id) on delete cascade,
  question_id uuid references cbt_questions(id) on delete cascade,
  created_at timestamptz default now(),
  unique(question_bank_id, question_id)
);

-- ========================================
-- REPORT GENERATION TABLES
-- ========================================

-- Report Templates
create table if not exists report_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  template_type text check (template_type in ('student_progress', 'class_performance', 'teacher_evaluation', 'financial', 'attendance', 'exam_results', 'custom')),
  template_content jsonb, -- JSON structure of the report
  header_template text,
  footer_template text,
  css_styles text,
  is_active boolean default true,
  created_by uuid references portal_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Generated Reports
create table if not exists generated_reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references report_templates(id) on delete cascade,
  report_name text not null,
  report_type text check (report_type in ('student_progress', 'class_performance', 'teacher_evaluation', 'financial', 'attendance', 'exam_results', 'custom')),
  generated_by uuid references portal_users(id),
  file_url text, -- URL to generated PDF/Excel file
  file_size integer,
  file_format text check (file_format in ('pdf', 'excel', 'csv', 'html')),
  parameters jsonb, -- Parameters used to generate the report
  status text check (status in ('generating', 'completed', 'failed')) default 'generating',
  generated_at timestamptz default now(),
  expires_at timestamptz, -- When the report file expires
  created_at timestamptz default now()
);

-- Report Schedules (automated report generation)
create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references report_templates(id) on delete cascade,
  schedule_name text not null,
  frequency text check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  cron_expression text, -- For custom scheduling
  recipients text[], -- Array of email addresses
  parameters jsonb, -- Default parameters for the report
  is_active boolean default true,
  last_run timestamptz,
  next_run timestamptz,
  created_by uuid references portal_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Student Progress Reports
create table if not exists student_progress_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  report_period text check (report_period in ('weekly', 'monthly', 'quarterly', 'semester', 'yearly')),
  start_date date,
  end_date date,
  attendance_rate decimal(5,2),
  assignment_completion_rate decimal(5,2),
  average_assignment_score decimal(5,2),
  exam_average decimal(5,2),
  overall_grade text,
  teacher_comments text,
  parent_comments text,
  recommendations text,
  generated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Class Performance Reports
create table if not exists class_performance_reports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  report_period text check (report_period in ('weekly', 'monthly', 'quarterly', 'semester')),
  start_date date,
  end_date date,
  total_students integer,
  average_attendance_rate decimal(5,2),
  average_assignment_score decimal(5,2),
  average_exam_score decimal(5,2),
  top_performers text[], -- Array of student IDs
  struggling_students text[], -- Array of student IDs
  teacher_performance_rating decimal(3,2),
  class_observations text,
  recommendations text,
  generated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Financial Reports
create table if not exists financial_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text check (report_type in ('revenue', 'expenses', 'profit_loss', 'student_payments', 'teacher_payments')),
  report_period text check (report_period in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date,
  end_date date,
  total_revenue decimal(12,2),
  total_expenses decimal(12,2),
  net_profit decimal(12,2),
  total_students integer,
  total_teachers integer,
  payment_methods_breakdown jsonb, -- Breakdown by payment method
  program_revenue_breakdown jsonb, -- Breakdown by program
  generated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Report Access Logs
create table if not exists report_access_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references generated_reports(id) on delete cascade,
  accessed_by uuid references portal_users(id),
  access_type text check (access_type in ('view', 'download', 'print')),
  ip_address inet,
  user_agent text,
  accessed_at timestamptz default now()
);

-- ========================================
-- ANALYTICS & DASHBOARD TABLES
-- ========================================

-- Analytics Events (for tracking user behavior)
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id),
  event_type text not null, -- 'page_view', 'button_click', 'form_submit', etc.
  event_name text not null,
  page_url text,
  session_id text,
  user_agent text,
  ip_address inet,
  event_data jsonb, -- Additional event data
  created_at timestamptz default now()
);

-- Dashboard Widgets (for customizable dashboards)
create table if not exists dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  widget_type text check (widget_type in ('chart', 'table', 'metric', 'list', 'calendar')),
  widget_config jsonb, -- Configuration for the widget
  data_source text, -- SQL query or data source
  refresh_interval integer, -- Refresh interval in minutes
  is_active boolean default true,
  created_by uuid references portal_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User Dashboard Layouts (personalized dashboards)
create table if not exists user_dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade,
  layout_name text not null,
  layout_config jsonb, -- Widget positions and settings
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- CBT indexes
create index if not exists idx_cbt_exams_program on cbt_exams(program_id);
create index if not exists idx_cbt_exams_course on cbt_exams(course_id);
create index if not exists idx_cbt_exams_type on cbt_exams(exam_type);
create index if not exists idx_cbt_exams_active on cbt_exams(is_active);

create index if not exists idx_cbt_questions_exam on cbt_questions(exam_id);
create index if not exists idx_cbt_questions_type on cbt_questions(question_type);
create index if not exists idx_cbt_questions_active on cbt_questions(is_active);

create index if not exists idx_cbt_options_question on cbt_question_options(question_id);
create index if not exists idx_cbt_options_correct on cbt_question_options(is_correct);

create index if not exists idx_cbt_sessions_exam on cbt_exam_sessions(exam_id);
create index if not exists idx_cbt_sessions_student on cbt_exam_sessions(student_id);
create index if not exists idx_cbt_sessions_status on cbt_exam_sessions(status);
create index if not exists idx_cbt_sessions_start_time on cbt_exam_sessions(start_time);

create index if not exists idx_cbt_answers_session on cbt_student_answers(session_id);
create index if not exists idx_cbt_answers_question on cbt_student_answers(question_id);

create index if not exists idx_cbt_results_exam on cbt_exam_results(exam_id);
create index if not exists idx_cbt_results_student on cbt_exam_results(student_id);

-- Report indexes
create index if not exists idx_report_templates_type on report_templates(template_type);
create index if not exists idx_report_templates_active on report_templates(is_active);

create index if not exists idx_generated_reports_template on generated_reports(template_id);
create index if not exists idx_generated_reports_type on generated_reports(report_type);
create index if not exists idx_generated_reports_status on generated_reports(status);
create index if not exists idx_generated_reports_generated_at on generated_reports(generated_at);

create index if not exists idx_report_schedules_template on report_schedules(template_id);
create index if not exists idx_report_schedules_active on report_schedules(is_active);
create index if not exists idx_report_schedules_next_run on report_schedules(next_run);

create index if not exists idx_progress_reports_student on student_progress_reports(student_id);
create index if not exists idx_progress_reports_program on student_progress_reports(program_id);

create index if not exists idx_class_reports_class on class_performance_reports(class_id);

create index if not exists idx_financial_reports_type on financial_reports(report_type);
create index if not exists idx_financial_reports_period on financial_reports(report_period);

-- Analytics indexes
create index if not exists idx_analytics_events_user on analytics_events(user_id);
create index if not exists idx_analytics_events_type on analytics_events(event_type);
create index if not exists idx_analytics_events_created on analytics_events(created_at);

-- ========================================
-- TRIGGERS
-- ========================================

-- Triggers for updated_at
create trigger update_cbt_exams_updated_at before update on cbt_exams for each row execute function update_updated_at_column();
create trigger update_cbt_questions_updated_at before update on cbt_questions for each row execute function update_updated_at_column();
create trigger update_cbt_sessions_updated_at before update on cbt_exam_sessions for each row execute function update_updated_at_column();
create trigger update_report_templates_updated_at before update on report_templates for each row execute function update_updated_at_column();
create trigger update_report_schedules_updated_at before update on report_schedules for each row execute function update_updated_at_column();
create trigger update_dashboard_widgets_updated_at before update on dashboard_widgets for each row execute function update_updated_at_column();
create trigger update_user_dashboard_layouts_updated_at before update on user_dashboard_layouts for each row execute function update_updated_at_column();

-- Function to update exam results when session is completed
create or replace function update_exam_results()
returns trigger as $$
begin
  if new.status = 'completed' then
    -- Update or insert exam results
    insert into cbt_exam_results (exam_id, student_id, best_session_id, best_score, best_percentage, total_attempts, average_score, first_attempt_date, last_attempt_date)
    values (
      new.exam_id,
      new.student_id,
      new.id,
      new.score,
      new.percentage_score,
      1,
      new.percentage_score,
      new.start_time,
      new.end_time
    )
    on conflict (exam_id, student_id) do update set
      best_session_id = case when cbt_exam_results.best_score < new.score then new.id else cbt_exam_results.best_session_id end,
      best_score = greatest(cbt_exam_results.best_score, new.score),
      best_percentage = greatest(cbt_exam_results.best_percentage, new.percentage_score),
      total_attempts = cbt_exam_results.total_attempts + 1,
      average_score = (cbt_exam_results.average_score * cbt_exam_results.total_attempts + new.percentage_score) / (cbt_exam_results.total_attempts + 1),
      last_attempt_date = new.end_time;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to update exam results
create trigger update_exam_results_on_session_complete
  after update on cbt_exam_sessions
  for each row
  execute function update_exam_results();

-- ========================================
-- ENABLE RLS
-- ========================================

-- Enable RLS on all tables
alter table cbt_exams enable row level security;
alter table cbt_questions enable row level security;
alter table cbt_question_options enable row level security;
alter table cbt_exam_sessions enable row level security;
alter table cbt_student_answers enable row level security;
alter table cbt_exam_results enable row level security;
alter table cbt_question_banks enable row level security;
alter table cbt_question_bank_questions enable row level security;

alter table report_templates enable row level security;
alter table generated_reports enable row level security;
alter table report_schedules enable row level security;
alter table student_progress_reports enable row level security;
alter table class_performance_reports enable row level security;
alter table financial_reports enable row level security;
alter table report_access_logs enable row level security;

alter table analytics_events enable row level security;
alter table dashboard_widgets enable row level security;
alter table user_dashboard_layouts enable row level security;

-- Basic RLS policies (expand based on your needs)
create policy "Allow all operations for now" on cbt_exams for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_questions for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_question_options for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_exam_sessions for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_student_answers for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_exam_results for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_question_banks for all using (true) with check (true);
create policy "Allow all operations for now" on cbt_question_bank_questions for all using (true) with check (true);

create policy "Allow all operations for now" on report_templates for all using (true) with check (true);
create policy "Allow all operations for now" on generated_reports for all using (true) with check (true);
create policy "Allow all operations for now" on report_schedules for all using (true) with check (true);
create policy "Allow all operations for now" on student_progress_reports for all using (true) with check (true);
create policy "Allow all operations for now" on class_performance_reports for all using (true) with check (true);
create policy "Allow all operations for now" on financial_reports for all using (true) with check (true);
create policy "Allow all operations for now" on report_access_logs for all using (true) with check (true);

create policy "Allow all operations for now" on analytics_events for all using (true) with check (true);
create policy "Allow all operations for now" on dashboard_widgets for all using (true) with check (true);
create policy "Allow all operations for now" on user_dashboard_layouts for all using (true) with check (true);

-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Grant permissions for CBT tables
grant all on cbt_exams to anon, authenticated;
grant all on cbt_questions to anon, authenticated;
grant all on cbt_question_options to anon, authenticated;
grant all on cbt_exam_sessions to anon, authenticated;
grant all on cbt_student_answers to anon, authenticated;
grant all on cbt_exam_results to anon, authenticated;
grant all on cbt_question_banks to anon, authenticated;
grant all on cbt_question_bank_questions to anon, authenticated;

-- Grant permissions for Report tables
grant all on report_templates to anon, authenticated;
grant all on generated_reports to anon, authenticated;
grant all on report_schedules to anon, authenticated;
grant all on student_progress_reports to anon, authenticated;
grant all on class_performance_reports to anon, authenticated;
grant all on financial_reports to anon, authenticated;
grant all on report_access_logs to anon, authenticated;

-- Grant permissions for Analytics tables
grant all on analytics_events to anon, authenticated;
grant all on dashboard_widgets to anon, authenticated;
grant all on user_dashboard_layouts to anon, authenticated;

-- ========================================
-- SAMPLE DATA
-- ========================================

-- Insert sample report templates
insert into report_templates (name, description, template_type, template_content, created_by) values
('Student Progress Report', 'Comprehensive student progress report', 'student_progress', '{"sections": ["attendance", "assignments", "exams", "overall_grade"]}', null),
('Class Performance Report', 'Class-wide performance analysis', 'class_performance', '{"sections": ["attendance", "grades", "top_performers", "recommendations"]}', null),
('Financial Summary Report', 'Monthly financial summary', 'financial', '{"sections": ["revenue", "expenses", "profit_loss", "trends"]}', null)
on conflict do nothing;

-- Display all new tables
select 
  tablename,
  tableowner
from pg_tables 
where schemaname = 'public' 
  and (tablename like 'cbt%' or tablename like '%report%' or tablename like '%analytics%' or tablename like '%dashboard%')
order by tablename; 