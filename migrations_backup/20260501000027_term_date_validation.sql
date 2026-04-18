-- migration: add validation that term_end must be after term_start
-- prevents creating invalid lesson plans with backwards date ranges

alter table public.lesson_plans
  drop constraint if exists term_dates_valid;

alter table public.lesson_plans
  add constraint term_dates_valid
    check (
      term_end is null 
      or term_start is null 
      or term_end > term_start
    );

-- add helpful comment
comment on constraint term_dates_valid on public.lesson_plans is
  'Ensures term end date is after term start date when both are provided';
