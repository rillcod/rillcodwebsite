-- Stage 2f: add Teen Developers python path and sequence defaults (additive)

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
      'jss_python',
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
      'jss_python',
      'ss_uiux_mobile'
    )
  );

update public.programs
set progression_policy = jsonb_strip_nulls(
  coalesce(progression_policy, '{}'::jsonb) ||
  jsonb_build_object(
    'jss_1_3_tracks', jsonb_build_array('jss_web_app', 'jss_python', 'python', 'html_css'),
    'ss_1_2_tracks', jsonb_build_array('ss_uiux_mobile', 'python', 'html_css'),
    'teen_developers_sequence', jsonb_build_array(
      'javascript_foundation',
      'react_development',
      'ai_automation',
      'ui_ux_design',
      'mobile_capacitor'
    )
  )
)
where program_scope = 'regular_school'
  and school_progression_enabled = true;
