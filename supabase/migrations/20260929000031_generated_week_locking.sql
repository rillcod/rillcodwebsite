-- Regenerate freely until a week is locked; never overwrite it after.
--
-- A programme's week spine is not fixed. Insert a week 3, and weeks 3–7 all
-- shift and become week 4–8; extend the run and week 8 appears. Everything
-- downstream of that edit has to be rewritten, or the curriculum describes a
-- shape the programme no longer has.
--
-- Rewriting is only safe while nobody is relying on the old text. The moment a
-- teacher publishes a week, learners can see it — from then on it is a record,
-- not a draft, and regeneration must leave it alone rather than silently
-- replacing what a class already worked through.
--
-- So: generated content is disposable until it is locked, and locking happens
-- automatically at the point it stops being disposable (publication). Nothing
-- here is specific to one programme or one week count.

alter table public.lessons
  add column if not exists content_locked_at timestamptz,
  add column if not exists content_locked_by uuid references auth.users(id) on delete set null;

alter table public.assignments
  add column if not exists content_locked_at timestamptz,
  add column if not exists content_locked_by uuid references auth.users(id) on delete set null;

-- Release is the lock. A teacher moving a week out of draft is exactly the
-- moment the text stops being ours to rewrite.
--
-- Keyed on "no longer draft" rather than one named state: lessons_status_check
-- allows draft | active | scheduled | completed, and all three of the latter
-- mean a class is depending on this week. Naming a single state here would have
-- silently never fired — 'published' is not a lesson status at all.
create or replace function public.lock_generated_content_on_publish()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from 'draft' and coalesce(old.status,'draft') = 'draft'
     and new.content_locked_at is null then
    new.content_locked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lock_lesson_on_publish on public.lessons;
create trigger lock_lesson_on_publish
  before update of status on public.lessons
  for each row execute function public.lock_generated_content_on_publish();

-- Assignments use is_active rather than a status enum.
create or replace function public.lock_generated_assignment_on_release()
returns trigger language plpgsql as $$
begin
  if new.is_active is true and coalesce(old.is_active,false) is false
     and new.content_locked_at is null then
    new.content_locked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lock_assignment_on_release on public.assignments;
create trigger lock_assignment_on_release
  before update of is_active on public.assignments
  for each row execute function public.lock_generated_assignment_on_release();

-- The guard. A locked row cannot be rewritten or deleted by the generators,
-- whichever launcher is running. Clearing content_locked_at is the deliberate
-- unlock, and is the only way past this — so an admin can still choose to
-- rebuild a week, but no automated sweep can do it by accident.
create or replace function public.protect_locked_generated_content()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.content_locked_at is not null then
      raise exception 'This % is locked because it was published to learners.', tg_argv[0]
        using hint = 'Unlock it first (clear content_locked_at) if you really mean to rebuild it.';
    end if;
    return old;
  end if;

  -- Allow the unlock itself, and allow lock metadata to change.
  if old.content_locked_at is not null and new.content_locked_at is not null then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.metadata is distinct from old.metadata then
      raise exception 'This % is locked because it was published to learners.', tg_argv[0]
        using hint = 'Unlock it first (clear content_locked_at) if you really mean to rewrite it.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_locked_lesson on public.lessons;
create trigger protect_locked_lesson
  before update or delete on public.lessons
  for each row execute function public.protect_locked_generated_content('lesson');

drop trigger if exists protect_locked_assignment on public.assignments;
create trigger protect_locked_assignment
  before update or delete on public.assignments
  for each row execute function public.protect_locked_generated_content('assignment');

create index if not exists lessons_locked_idx on public.lessons(content_locked_at)
  where content_locked_at is not null;
create index if not exists assignments_locked_idx on public.assignments(content_locked_at)
  where content_locked_at is not null;

comment on column public.lessons.content_locked_at is
  'Set when the week was published to learners. Generated content is rewritable until this is set; after it, regeneration must skip the week rather than replace what a class already used.';
