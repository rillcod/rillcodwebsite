-- programs.program_scope: map summer_school / bootcamp → special (united with enrollment_type).

ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_program_scope_check;

ALTER TABLE public.programs
  ADD CONSTRAINT programs_program_scope_check
  CHECK (
    program_scope = ANY (ARRAY[
      'regular_school'::text,
      'online'::text,
      'special'::text,
      'summer_school'::text,
      'bootcamp'::text
    ])
  );

UPDATE public.programs
SET program_scope = 'special'
WHERE program_scope IN ('summer_school', 'bootcamp');

ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_program_scope_check;

ALTER TABLE public.programs
  ADD CONSTRAINT programs_program_scope_check
  CHECK (
    program_scope = ANY (ARRAY['regular_school'::text, 'online'::text, 'special'::text])
  );

COMMENT ON COLUMN public.programs.program_scope IS
  'Canonical: regular_school | online | special (special was summer_school/bootcamp)';
