-- Compulsory schools already run First Test / Second Test / Examination.
-- Capture is how the paper is sat: printed from taught weeks (default), or
-- CBT for advanced labs — especially the examination. Tests stay physical
-- unless a school is explicitly set to CBT. Optional schools ignore these.

alter table public.schools
  add column if not exists exam_capture text not null default 'physical';

alter table public.schools
  drop constraint if exists schools_exam_capture_check;

alter table public.schools
  add constraint schools_exam_capture_check
  check (exam_capture = any (array['physical'::text, 'cbt'::text]));

comment on column public.schools.exam_capture is
  'How a compulsory school sits the term examination. physical = print the paper generated from taught weeks. cbt = students sit it in Rillcod. Optional schools keep Rillcod CBT regardless.';

alter table public.schools
  add column if not exists test_capture text not null default 'physical';

alter table public.schools
  drop constraint if exists schools_test_capture_check;

alter table public.schools
  add constraint schools_test_capture_check
  check (test_capture = any (array['physical'::text, 'cbt'::text]));

comment on column public.schools.test_capture is
  'How a compulsory school sits First Test and Second Test. Default physical (print). CBT only when the school is set up for it.';
