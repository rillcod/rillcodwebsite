-- A submission is a body of work, not one file.
--
-- assignment_submissions.file_url is a single text column, and the submit form
-- takes e.target.files?.[0] — so a learner who built three things could hand in
-- one of them, and each new upload silently replaced the last. Practical work
-- (a screenshot, the code, a short write-up) had nowhere to go.
--
-- attachments carries the full list. file_url is kept as the first entry rather
-- than dropped: eight routes read it (grading, student view, submit, the
-- submissions APIs), and quietly changing what it means would break marking.
-- A trigger keeps the two in step, so it does not matter which path writes.

alter table public.assignment_submissions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.assignment_submissions.attachments is
  'Ordered list of {url, name, type, size, uploaded_at}. file_url mirrors the first entry for the readers that predate this column.';

-- Shape is enforced in the trigger below rather than a CHECK: validating each
-- element needs jsonb_array_elements, and Postgres does not allow a subquery in
-- a check constraint.

/**
 * Keep file_url and attachments consistent, whichever one the caller set.
 *
 * Older callers write only file_url; the new form writes attachments. Rather
 * than make every route learn both, this reconciles them on the row:
 *   - attachments given  -> file_url becomes the first url
 *   - only file_url given -> attachments becomes that single entry
 * Clearing attachments to empty also clears file_url, so a learner removing
 * every file does not leave a stale link behind on their submission.
 */
create or replace function public.sync_submission_attachments()
returns trigger language plpgsql as $$
declare v_first text; v_bad int;
begin
  if new.attachments is null then
    new.attachments := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'attachments must be a JSON array of {url, name, ...} objects.';
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(new.attachments) e
   where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'url', '') = '';
  if v_bad > 0 then
    raise exception 'every attachment must be an object carrying a non-empty url.';
  end if;

  if jsonb_array_length(new.attachments) > 0 then
    v_first := new.attachments -> 0 ->> 'url';
    new.file_url := v_first;
    return new;
  end if;

  -- No list supplied. Adopt a lone file_url so both representations agree.
  if coalesce(new.file_url, '') <> '' then
    new.attachments := jsonb_build_array(
      jsonb_build_object('url', new.file_url, 'name', 'Submission', 'uploaded_at', now())
    );
  else
    new.attachments := '[]'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_submission_attachments on public.assignment_submissions;
create trigger sync_submission_attachments
  before insert or update of attachments, file_url
  on public.assignment_submissions
  for each row execute function public.sync_submission_attachments();

-- Backfill existing submissions so every historical file is in the list too.
update public.assignment_submissions
   set attachments = jsonb_build_array(
         jsonb_build_object('url', file_url, 'name', 'Submission', 'uploaded_at', coalesce(submitted_at, now()))
       )
 where coalesce(file_url, '') <> ''
   and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) = 0;
