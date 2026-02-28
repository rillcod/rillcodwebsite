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
  create trigger update_submissions_updated_at
    before update on assignment_submissions
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger update_progress_updated_at
    before update on student_progress
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;
