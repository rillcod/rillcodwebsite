alter table public.assignment_submissions
  add column if not exists grading_details jsonb;

alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_grading_details_object_check;

alter table public.assignment_submissions
  add constraint assignment_submissions_grading_details_object_check
  check (grading_details is null or jsonb_typeof(grading_details) = 'object');

comment on column public.assignment_submissions.grading_details is
  'Server-authored grading evidence such as the criterion-by-criterion rubric scores behind the final mark.';
