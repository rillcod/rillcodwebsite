-- Stage 2c: extend progression tracks for JSS 1-3 and SS 1-2

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'curriculum_project_registry_track_check'
      and conrelid = 'public.curriculum_project_registry'::regclass
  ) then
    alter table public.curriculum_project_registry
      drop constraint curriculum_project_registry_track_check;
  end if;
end $$;

alter table public.curriculum_project_registry
  add constraint curriculum_project_registry_track_check
  check (
    track in (
      'young_innovator',
      'scratch',
      'python',
      'html_css',
      'intro_ai_tools',
      'jss_web_app',
      'ss_uiux_mobile',
      'mixed'
    )
  );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'flashcard_decks_progression_track_check'
      and conrelid = 'public.flashcard_decks'::regclass
  ) then
    alter table public.flashcard_decks
      drop constraint flashcard_decks_progression_track_check;
  end if;
end $$;

alter table public.flashcard_decks
  add constraint flashcard_decks_progression_track_check
  check (
    progression_track is null
    or progression_track in (
      'young_innovator',
      'scratch',
      'python',
      'html',
      'html_css',
      'jss_web_app',
      'ss_uiux_mobile'
    )
  );

comment on column public.flashcard_decks.progression_track is
  'Applied track for deck context: young_innovator, scratch, python, html/html_css, jss_web_app, ss_uiux_mobile';
