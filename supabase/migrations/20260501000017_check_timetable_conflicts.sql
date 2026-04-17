-- migration: create / replace check_timetable_conflicts rpc
-- requirements: req 13.3, 13.4, 13.5
--
-- detects teacher and room double-booking before a timetable_slot is inserted
-- or updated.  conflicts are based on overlapping time ranges on the same
-- day_of_week within the same timetable, not on period numbers (the
-- timetable_slots table has no period column).
--
-- overlap condition (open-interval): slot_a overlaps slot_b when
--   slot_a.start_time < slot_b.end_time  AND  slot_a.end_time > slot_b.start_time
--
-- input  p_slot jsonb fields:
--   timetable_id  uuid    (required)
--   day_of_week   text    (required)
--   start_time    text    (required)
--   end_time      text    (required)
--   teacher_id    uuid    (optional — skip teacher check when absent)
--   room          text    (optional — skip room check when absent or empty)
--   exclude_id    uuid    (optional — id of the slot being edited; excluded
--                          from conflict search so editing a slot does not
--                          conflict with itself)
--
-- return value is a jsonb object with one of:
--   {"conflict": "TEACHER_CONFLICT", "conflictingSlot": {…}}
--   {"conflict": "ROOM_CONFLICT",    "conflictingSlot": {…}}
--   {"conflict": null}

create or replace function public.check_timetable_conflicts(
  p_slot jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_timetable_id  uuid;
  v_day_of_week   text;
  v_start_time    text;
  v_end_time      text;
  v_teacher_id    uuid;
  v_room          text;
  v_exclude_id    uuid;

  v_conflict      record;
begin
  -- ----------------------------------------------------------------
  -- 1. extract fields from input
  -- ----------------------------------------------------------------
  v_timetable_id := (p_slot->>'timetable_id')::uuid;
  v_day_of_week  :=  p_slot->>'day_of_week';
  v_start_time   :=  p_slot->>'start_time';
  v_end_time     :=  p_slot->>'end_time';
  v_teacher_id   := (p_slot->>'teacher_id')::uuid;   -- null when absent
  v_room         :=  p_slot->>'room';                 -- null when absent
  v_exclude_id   := (p_slot->>'exclude_id')::uuid;   -- null when absent

  -- ----------------------------------------------------------------
  -- 2. teacher conflict check
  --    only run when teacher_id is provided
  -- ----------------------------------------------------------------
  if v_teacher_id is not null then
    select
      ts.id,
      ts.day_of_week,
      ts.start_time,
      ts.end_time,
      ts.subject,
      ts.teacher_name
    into v_conflict
    from public.timetable_slots ts
    where ts.timetable_id = v_timetable_id
      and ts.day_of_week  = v_day_of_week
      and ts.teacher_id   = v_teacher_id
      -- open-interval overlap
      and ts.start_time   < v_end_time
      and ts.end_time     > v_start_time
      -- exclude the slot being edited (if supplied)
      and (v_exclude_id is null or ts.id != v_exclude_id)
    limit 1;

    if found then
      return jsonb_build_object(
        'conflict',        'TEACHER_CONFLICT',
        'conflictingSlot', jsonb_build_object(
          'id',          v_conflict.id,
          'day_of_week', v_conflict.day_of_week,
          'start_time',  v_conflict.start_time,
          'end_time',    v_conflict.end_time,
          'subject',     v_conflict.subject,
          'teacher_name',v_conflict.teacher_name
        )
      );
    end if;
  end if;

  -- ----------------------------------------------------------------
  -- 3. room conflict check
  --    only run when room is provided and non-empty
  -- ----------------------------------------------------------------
  if v_room is not null and v_room <> '' then
    select
      ts.id,
      ts.day_of_week,
      ts.start_time,
      ts.end_time,
      ts.subject,
      ts.room
    into v_conflict
    from public.timetable_slots ts
    where ts.timetable_id = v_timetable_id
      and ts.day_of_week  = v_day_of_week
      and ts.room         = v_room
      -- open-interval overlap
      and ts.start_time   < v_end_time
      and ts.end_time     > v_start_time
      -- exclude the slot being edited (if supplied)
      and (v_exclude_id is null or ts.id != v_exclude_id)
    limit 1;

    if found then
      return jsonb_build_object(
        'conflict',        'ROOM_CONFLICT',
        'conflictingSlot', jsonb_build_object(
          'id',          v_conflict.id,
          'day_of_week', v_conflict.day_of_week,
          'start_time',  v_conflict.start_time,
          'end_time',    v_conflict.end_time,
          'subject',     v_conflict.subject,
          'room',        v_conflict.room
        )
      );
    end if;
  end if;

  -- ----------------------------------------------------------------
  -- 4. no conflict found
  -- ----------------------------------------------------------------
  return jsonb_build_object('conflict', null);
end;
$$;

-- allow authenticated users (teachers / school admins) to call the function.
-- service_role already bypasses rls so no separate grant is needed for
-- server-side usage.
grant execute on function public.check_timetable_conflicts(jsonb)
  to authenticated;
