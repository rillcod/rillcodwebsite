-- A timetable slot has to say which class it teaches.
--
-- Slots carry a subject, a teacher, a room and a time. They never carried a
-- class, so nothing could turn "Monday 10:00, Scratch" into the class session a
-- teacher marks attendance against. Teachers created those sessions by hand
-- while the timetable already knew when they were.
--
-- No backfill. Of the eleven live slots, only two resolve to a single class by
-- school and teacher, seven match no class at all, and two are ambiguous —
-- course_id is unset on every one of them. Attaching a class by guesswork would
-- put a lesson in front of the wrong children, and an attendance register is
-- exactly the wrong place to be approximately right.
--
-- Nullable on purpose. Existing slots keep working as a printed schedule; only
-- the ones given a class take part in session generation, and the automation
-- reports the rest rather than inventing them.

alter table public.timetable_slots
  add column if not exists class_id uuid references public.classes(id) on delete set null;

create index if not exists idx_timetable_slots_class_id
  on public.timetable_slots (class_id) where class_id is not null;

comment on column public.timetable_slots.class_id is
  'The class this slot teaches. Required before the slot can generate class sessions; left null a slot is only a printed schedule entry.';

-- One slot per class, day and start time. Without this, a double-saved slot
-- silently produces two sessions on the same morning and splits one register in
-- half — every learner marked present in one and absent in the other.
create unique index if not exists uq_timetable_slot_class_day_start
  on public.timetable_slots (class_id, day_of_week, start_time)
  where class_id is not null;
