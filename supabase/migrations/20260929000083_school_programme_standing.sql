-- Partner-school standing and weekly cadence are independent.

-- Standing: optional (unstated) uses Rillcod evaluations; compulsory schools
-- already run First Test / Second Test / Examination on their own calendar.
alter table public.schools
  add column if not exists programme_standing text not null default 'optional';

alter table public.schools
  drop constraint if exists schools_programme_standing_check;

alter table public.schools
  add constraint schools_programme_standing_check
  check (programme_standing = any (array['optional'::text, 'compulsory'::text]));

comment on column public.schools.programme_standing is
  'optional: Rillcod evaluations. compulsory: host-school academic calendar and host tests/exams. Cadence is sessions_per_week, not this column.';

-- Every school class meets once or twice a week. Most meet twice.
alter table public.schools
  add column if not exists sessions_per_week integer not null default 2;

alter table public.schools
  drop constraint if exists schools_sessions_per_week_check;

alter table public.schools
  add constraint schools_sessions_per_week_check
  check (sessions_per_week = any (array[1, 2]));

comment on column public.schools.sessions_per_week is
  'Partner-school weekly cadence. 1 or 2 only; default 2 because most classes meet twice.';
