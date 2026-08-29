-- Older class-plan creation paths stopped at status=draft even after attaching
-- real teaching weeks. The nightly content sweep reads executable plans, so
-- those rows silently stopped receiving later sessions.
--
-- Plan publication only enables generation. It does not change lesson,
-- material, flashcard or assignment visibility, and therefore cannot expose
-- unreviewed content to learners.

update public.lesson_plans
set status = 'published',
    updated_at = now()
where status = 'draft'
  and class_id is not null
  and course_id is not null
  and jsonb_typeof(coalesce(plan_data, '{}'::jsonb) -> 'weeks') = 'array'
  and jsonb_array_length(coalesce(plan_data, '{}'::jsonb) -> 'weeks') > 0
  and coalesce(metadata #>> '{auto_generate_settings,enabled}', 'true') <> 'false';
