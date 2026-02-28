-- Teachers Table for Rillcod Academy
-- This table stores teacher-specific information separate from portal_users

-- Teachers table
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade unique,
  employee_id text unique,
  specialization text, -- e.g., "Python Programming", "Web Development", "Robotics"
  qualification text, -- e.g., "BSc Computer Science", "MSc Software Engineering"
  years_of_experience integer,
  bio text,
  teaching_philosophy text,
  certifications text[], -- Array of certifications
  languages text[], -- Languages they can teach in
  availability_schedule jsonb, -- JSON object for availability
  hourly_rate decimal(10,2),
  is_verified boolean default false,
  verification_documents text[], -- Array of document URLs
  rating decimal(3,2) default 0.00, -- Average rating from students
  total_reviews integer default 0,
  total_students_taught integer default 0,
  total_classes_conducted integer default 0,
  join_date date default current_date,
  status text check (status in ('active', 'inactive', 'suspended', 'on_leave')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teacher Programs (which programs a teacher can teach)
create table if not exists teacher_programs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  is_primary boolean default false, -- Primary program they teach
  proficiency_level text check (proficiency_level in ('beginner', 'intermediate', 'expert')),
  years_teaching_program integer,
  created_at timestamptz default now(),
  unique(teacher_id, program_id)
);

-- Teacher Availability (detailed availability schedule)
create table if not exists teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  day_of_week integer check (day_of_week between 0 and 6), -- 0=Sunday, 1=Monday, etc.
  start_time time not null,
  end_time time not null,
  is_available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teacher Reviews (student reviews of teachers)
create table if not exists teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  rating integer check (rating between 1 and 5),
  review_text text,
  is_anonymous boolean default false,
  is_approved boolean default false,
  created_at timestamptz default now(),
  unique(teacher_id, student_id, class_id)
);

-- Teacher Performance Metrics
create table if not exists teacher_performance (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  month_year date not null, -- First day of the month
  classes_taught integer default 0,
  total_students integer default 0,
  average_attendance_rate decimal(5,2) default 0.00,
  average_student_rating decimal(3,2) default 0.00,
  assignments_graded integer default 0,
  average_grading_time_hours decimal(5,2) default 0.00,
  student_satisfaction_score decimal(3,2) default 0.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(teacher_id, month_year)
);

-- Teacher Documents (certificates, CV, etc.)
create table if not exists teacher_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  document_type text check (document_type in ('cv', 'certificate', 'degree', 'id_card', 'other')),
  document_name text not null,
  file_url text not null,
  file_size integer,
  is_verified boolean default false,
  verified_by uuid references portal_users(id),
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_teachers_user_id on teachers(user_id);
create index if not exists idx_teachers_employee_id on teachers(employee_id);
create index if not exists idx_teachers_specialization on teachers(specialization);
create index if not exists idx_teachers_status on teachers(status);
create index if not exists idx_teachers_rating on teachers(rating);

create index if not exists idx_teacher_programs_teacher on teacher_programs(teacher_id);
create index if not exists idx_teacher_programs_program on teacher_programs(program_id);

create index if not exists idx_teacher_availability_teacher on teacher_availability(teacher_id);
create index if not exists idx_teacher_availability_day on teacher_availability(day_of_week);

create index if not exists idx_teacher_reviews_teacher on teacher_reviews(teacher_id);
create index if not exists idx_teacher_reviews_student on teacher_reviews(student_id);
create index if not exists idx_teacher_reviews_rating on teacher_reviews(rating);

create index if not exists idx_teacher_performance_teacher on teacher_performance(teacher_id);
create index if not exists idx_teacher_performance_month on teacher_performance(month_year);

create index if not exists idx_teacher_documents_teacher on teacher_documents(teacher_id);
create index if not exists idx_teacher_documents_type on teacher_documents(document_type);

-- Triggers for updated_at
create trigger update_teachers_updated_at before update on teachers for each row execute function update_updated_at_column();
create trigger update_teacher_availability_updated_at before update on teacher_availability for each row execute function update_updated_at_column();
create trigger update_teacher_performance_updated_at before update on teacher_performance for each row execute function update_updated_at_column();

-- Function to automatically create teacher record when portal_user with teacher role is created
create or replace function create_teacher_record()
returns trigger as $$
begin
  if new.role = 'teacher' then
    insert into teachers (user_id, employee_id, status)
    values (new.id, 'EMP-' || substr(new.id::text, 1, 8), 'active');
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to create teacher record
create trigger create_teacher_on_user_insert
  after insert on portal_users
  for each row
  execute function create_teacher_record();

-- Function to update teacher rating when new review is added
create or replace function update_teacher_rating()
returns trigger as $$
begin
  -- Update teacher's average rating and total reviews
  update teachers 
  set 
    rating = (
      select round(avg(rating)::numeric, 2)
      from teacher_reviews 
      where teacher_id = new.teacher_id and is_approved = true
    ),
    total_reviews = (
      select count(*)
      from teacher_reviews 
      where teacher_id = new.teacher_id and is_approved = true
    )
  where id = new.teacher_id;
  
  return new;
end;
$$ language plpgsql;

-- Trigger to update teacher rating
create trigger update_teacher_rating_on_review
  after insert or update on teacher_reviews
  for each row
  execute function update_teacher_rating();

-- Enable RLS
alter table teachers enable row level security;
alter table teacher_programs enable row level security;
alter table teacher_availability enable row level security;
alter table teacher_reviews enable row level security;
alter table teacher_performance enable row level security;
alter table teacher_documents enable row level security;

-- Basic RLS policies (expand based on your needs)
create policy "Allow all operations for now" on teachers for all using (true) with check (true);
create policy "Allow all operations for now" on teacher_programs for all using (true) with check (true);
create policy "Allow all operations for now" on teacher_availability for all using (true) with check (true);
create policy "Allow all operations for now" on teacher_reviews for all using (true) with check (true);
create policy "Allow all operations for now" on teacher_performance for all using (true) with check (true);
create policy "Allow all operations for now" on teacher_documents for all using (true) with check (true);

-- Grant permissions
grant all on teachers to anon, authenticated;
grant all on teacher_programs to anon, authenticated;
grant all on teacher_availability to anon, authenticated;
grant all on teacher_reviews to anon, authenticated;
grant all on teacher_performance to anon, authenticated;
grant all on teacher_documents to anon, authenticated;

-- Display the new tables
select 
  tablename,
  tableowner
from pg_tables 
where schemaname = 'public' 
  and tablename like 'teacher%'
order by tablename; 