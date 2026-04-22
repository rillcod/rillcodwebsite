-- Stage 2e: enforce Teen Developers defaults for JSS1-3 and SS1-2
-- Applies to existing regular-school programs; idempotent update.

update public.programs
set progression_policy = jsonb_strip_nulls(
  coalesce(progression_policy, '{}'::jsonb) ||
  jsonb_build_object(
    'jss_1_3_program', 'teen_developers',
    'jss_1_3_track', 'jss_web_app',
    'jss_1_3_tracks', jsonb_build_array('jss_web_app', 'python', 'html_css'),
    'jss_1_3_stack', jsonb_build_array('react', 'tailwind', 'typescript'),
    'ss_1_2_program', 'teen_developers',
    'ss_1_2_track', 'ss_uiux_mobile',
    'ss_1_2_tracks', jsonb_build_array('ss_uiux_mobile', 'python', 'html_css'),
    'ss_1_2_stack', jsonb_build_array('ui_ux_design', 'capacitor_mobile_app')
  )
)
where program_scope = 'regular_school'
  and school_progression_enabled = true;
