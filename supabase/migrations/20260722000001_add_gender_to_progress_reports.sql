-- Add gender to student_progress_reports so staff can correct it on the report
-- and have it sync back to portal_users.gender (source-of-truth hierarchy).
alter table public.student_progress_reports
  add column if not exists gender text check (gender in ('male', 'female', 'other')) default null;
