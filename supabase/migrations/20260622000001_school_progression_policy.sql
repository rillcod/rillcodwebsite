-- Stage 1: school-only progression policy controls
-- Scope: applies to regular_school programs only (not summer/online/bootcamp)

-- ── Programs: policy controls ───────────────────────────────────────────────
alter table public.programs
  add column if not exists program_scope text not null default 'regular_school',
  add column if not exists school_progression_enabled boolean not null default false,
  add column if not exists session_frequency_per_week int not null default 1,
  add column if not exists progression_policy jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'programs_program_scope_check'
      and conrelid = 'public.programs'::regclass
  ) then
    alter table public.programs
      add constraint programs_program_scope_check
      check (program_scope in ('regular_school', 'summer_school', 'online', 'bootcamp'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'programs_session_frequency_per_week_check'
      and conrelid = 'public.programs'::regclass
  ) then
    alter table public.programs
      add constraint programs_session_frequency_per_week_check
      check (session_frequency_per_week in (1, 2));
  end if;
end $$;

comment on column public.programs.program_scope is
  'Program context gate: regular_school, summer_school, online, bootcamp';
comment on column public.programs.school_progression_enabled is
  'Enables school-role progression rules for this program (regular_school only)';
comment on column public.programs.session_frequency_per_week is
  'Expected class cadence for school progression (1 or 2 per week)';
comment on column public.programs.progression_policy is
  'JSON policy for stage progression, non-repeat constraints, track defaults, and flexible cross-course access';

-- Seed sensible defaults for Young Innovator style programs without touching
-- summer/online/bootcamp programs.
update public.programs
set
  school_progression_enabled = true,
  program_scope = case
    when program_scope in ('summer_school', 'online', 'bootcamp') then program_scope
    else 'regular_school'
  end,
  progression_policy = jsonb_strip_nulls(
    coalesce(progression_policy, '{}'::jsonb) ||
    jsonb_build_object(
      'basic_1_3_track', 'young_innovator',
      'basic_4_6_tracks', jsonb_build_array('python', 'html_css'),
      'basic_4_6_ai_module', 'intro_ai_tools',
      'avoid_project_repetition', true,
      'allow_additional_innovator_courses', true,
      'term_count', 3,
      'year_span', 3
    )
  )
where lower(name) like '%young innovator%';

-- ── Flashcard decks: snapshot applied progression context ───────────────────
alter table public.flashcard_decks
  add column if not exists school_progression_enabled boolean not null default false,
  add column if not exists progression_track text,
  add column if not exists progression_delivery_mode text,
  add column if not exists progression_weekly_frequency int,
  add column if not exists progression_policy_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'flashcard_decks_progression_track_check'
      and conrelid = 'public.flashcard_decks'::regclass
  ) then
    alter table public.flashcard_decks
      add constraint flashcard_decks_progression_track_check
      check (
        progression_track is null
        or progression_track in ('young_innovator', 'scratch', 'python', 'html')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'flashcard_decks_progression_delivery_mode_check'
      and conrelid = 'public.flashcard_decks'::regclass
  ) then
    alter table public.flashcard_decks
      add constraint flashcard_decks_progression_delivery_mode_check
      check (
        progression_delivery_mode is null
        or progression_delivery_mode in ('optional', 'compulsory')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'flashcard_decks_progression_weekly_frequency_check'
      and conrelid = 'public.flashcard_decks'::regclass
  ) then
    alter table public.flashcard_decks
      add constraint flashcard_decks_progression_weekly_frequency_check
      check (
        progression_weekly_frequency is null
        or progression_weekly_frequency in (1, 2)
      );
  end if;
end $$;

comment on column public.flashcard_decks.school_progression_enabled is
  'Whether school-only progression policy was active for this deck when created';
comment on column public.flashcard_decks.progression_track is
  'Applied track for the deck context: young_innovator, scratch, python, or html';
