-- Edit the catalogue by shape instead of by row.
--
-- curriculum_project_registry holds 21,354 rows and 361 distinct prompt shapes.
-- Every row is a real slot — a track crossed with a year, term and week — but
-- the prompt in it is a template with the numbers swapped in:
--
--   "Build, test, and present practical output for week 1 using Cross Track concepts."
--   "Build, test, and present practical output for week 2 using Cross Track concepts."
--
-- 71 characters on average, and the same sentence 59 times over. Rewriting the
-- catalogue row by row is 21,354 edits; rewriting it by shape is 361. Nobody
-- was ever going to do the first, which is the real reason this catalogue has
-- sat untouched since April.
--
-- A "shape" is the prompt with every run of digits replaced by N. That is
-- exactly what makes two rows the same sentence in different slots.

create or replace function public.curriculum_project_shape(prompt text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(prompt, ''), '[0-9]+', 'N', 'g');
$$;

comment on function public.curriculum_project_shape(text) is
  'The prompt with digit runs collapsed to N. Two rows share a shape when they are the same sentence written for different weeks.';

-- Grouping 21k rows in the API means fetching 21k rows. Postgres does it in
-- one pass and returns a few hundred.
create or replace function public.curriculum_project_shapes(
  p_program uuid default null,
  p_track   text default null
)
returns table (
  shape         text,
  rows          bigint,
  sample_title  text,
  sample_prompt text,
  tracks        text[],
  avg_length    int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    curriculum_project_shape(r.classwork_prompt)         as shape,
    count(*)                                             as rows,
    min(r.title)                                         as sample_title,
    min(r.classwork_prompt)                              as sample_prompt,
    array_agg(distinct r.track order by r.track)         as tracks,
    avg(length(coalesce(r.classwork_prompt, '')))::int   as avg_length
  from public.curriculum_project_registry r
  where (p_program is null or r.program_id = p_program)
    and (p_track   is null or r.track = p_track)
  group by 1
  order by count(*) desc;
$$;

comment on function public.curriculum_project_shapes(uuid, text) is
  'The catalogue collapsed to its distinct prompt sentences, biggest group first. 21,354 rows become a few hundred rows of work.';

/**
 * Rewrite every row sharing one shape.
 *
 * The new prompt may carry {week}, {track} and {title}, which are filled from
 * each row as it is written — so one edit stays specific to 59 different weeks
 * rather than flattening them all onto the same sentence. Without that,
 * rewriting by shape would lose the only thing the old prompts got right.
 *
 * Returns the number of rows changed. Callers must already have checked that
 * the actor is an admin; this runs as definer so the API does not need the
 * service role for one statement.
 */
create or replace function public.rewrite_curriculum_project_shape(
  p_shape     text,
  p_prompt    text,
  p_program   uuid default null,
  p_track     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer;
begin
  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'A replacement prompt is required.';
  end if;

  with target as (
    select r.id,
           coalesce((regexp_match(r.title, 'Week ([0-9]+)'))[1], '') as week
      from public.curriculum_project_registry r
     where curriculum_project_shape(r.classwork_prompt) = p_shape
       and (p_program is null or r.program_id = p_program)
       and (p_track   is null or r.track = p_track)
  )
  update public.curriculum_project_registry r
     set classwork_prompt = replace(
                              replace(
                                replace(p_prompt, '{week}',  t.week),
                                '{track}', coalesce(r.track, '')),
                              '{title}', coalesce(r.title, '')),
         updated_at = now()
    from target t
   where r.id = t.id;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

comment on function public.rewrite_curriculum_project_shape(text, text, uuid, text) is
  'Rewrites every row sharing a prompt shape. {week}, {track} and {title} are substituted per row so one edit stays specific to each slot.';
