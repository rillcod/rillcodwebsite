-- A special programme's offering must know whose it is before it goes live.
--
-- 20260929000027 added that rule, but it never applied to the one path that
-- creates special-programme offerings. Two reasons, and both are fixed here.
--
-- 1. Trigger order. `duration_offering_needs_its_owner` fired BEFORE
--    `normalise_academic_offering_business_model` (BEFORE triggers run in name
--    order, and 'd' < 'n'). Normalisation is what sets academic_model, so on
--    INSERT the guard read NULL, `NULL = 'duration_programme'` evaluated to
--    NULL, and the check was skipped entirely.
--
-- 2. `sync_special_program_academic_offering` inserts the offering with
--    status='active' whenever the page is published, and never sets school_id
--    (the page has no school column — the school is chosen afterwards, by the
--    API, against the offering).
--
-- Together those minted ACTIVE offerings with no school and often no
-- programme. uq_active_duration_offering_per_programme_school is keyed on
-- (programme_id, school_id), and NULL is never equal to NULL, so the index let
-- them pile up without limit — the exact "Summer School 2026 ran as three
-- offerings at once, money on one and learners on the others" state that
-- 20260929000027 was written to end.
--
-- It also made the page un-editable once published: the next save touching
-- title/programme/dates re-ran the UPDATE branch, academic_model was persisted
-- by then, and the guard finally raised — on a page that was already live.
--
-- Nothing below touches the school_term or online_school pathways.

-- ── 1. The guard runs after normalisation, and derives the model itself ──
--
-- Renamed so it sorts after `normalise_academic_offering_business_model`, and
-- it no longer trusts new.academic_model on INSERT: it falls back to the same
-- pathway mapping normalisation uses, so the rule holds whichever order wins.

drop trigger if exists duration_offering_needs_its_owner on public.academic_offerings;

create or replace function public.duration_offering_needs_its_owner()
returns trigger language plpgsql as $$
declare v_model text;
begin
  v_model := coalesce(
    new.academic_model,
    case
      when new.pathway in ('school_term', 'online_school') then 'termly_school'
      else 'duration_programme'
    end
  );

  if v_model = 'duration_programme' and new.status = 'active' then
    if new.programme_id is null then
      raise exception 'A live duration programme must name the programme it runs.'
        using hint = 'Set programme_id on the offering.';
    end if;
    if new.school_id is null then
      raise exception 'A live duration programme must name the school that runs it.'
        using hint = 'Set school_id on the offering.';
    end if;
  end if;
  return new;
end;
$$;

create trigger zz_duration_offering_needs_its_owner
  before insert or update of academic_model, status, programme_id, school_id
  on public.academic_offerings
  for each row execute function public.duration_offering_needs_its_owner();

-- ── 2. A special offering goes live only once it is owned ──
--
-- Publishing the page is no longer, by itself, enough to activate the
-- offering: the programme and the school have to be on it. The offering waits
-- in 'draft' until they are, instead of being born ownerless. Terminal states
-- ('completed', 'archived') are left exactly as an admin set them.

create or replace function public.special_offering_status_follows_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_published boolean;
begin
  if new.special_program_page_id is null then return new; end if;
  if new.status not in ('draft', 'active') then return new; end if;

  select is_published into v_published
  from public.special_program_pages
  where id = new.special_program_page_id;

  if coalesce(v_published, false)
     and new.programme_id is not null
     and new.school_id is not null then
    new.status := 'active';
  else
    new.status := 'draft';
  end if;
  return new;
end;
$$;

drop trigger if exists special_offering_status_follows_ownership on public.academic_offerings;
create trigger zzz_special_offering_status_follows_ownership
  before insert or update of status, programme_id, school_id, special_program_page_id
  on public.academic_offerings
  for each row execute function public.special_offering_status_follows_ownership();

-- The page sync keeps its own status intent, but hands the final say to the
-- ownership trigger above and stops clobbering a school that was already set.

create or replace function public.sync_special_program_academic_offering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering uuid;
  v_period uuid;
  v_pathway text;
  v_school uuid;
  v_status text;
begin
  v_pathway := case
    when lower(new.title) like '%bootcamp%' then 'bootcamp'
    when lower(new.title) like '%short course%' then 'short_course'
    else 'holiday_programme'
  end;

  select id, school_id into v_offering, v_school
  from public.academic_offerings
  where special_program_page_id = new.id;

  -- Published alone does not activate: an offering with no programme or no
  -- school stays a draft until someone finishes linking it.
  v_status := case
    when new.is_published and new.program_id is not null and v_school is not null
      then 'active'
    else 'draft'
  end;

  if v_offering is null then
    insert into public.academic_offerings(
      title, pathway, enrollment_type, programme_id, special_program_page_id,
      calendar_mode, result_destination, starts_on, ends_on, status,
      delivery_mode, settings
    ) values (
      new.title, v_pathway, 'special', new.program_id, new.id,
      'fixed_dates', 'standalone', new.starts_on, new.ends_on,
      'draft',
      'hybrid', jsonb_build_object(
        'source', 'special_program_pages',
        'slug', new.slug,
        'pathway_source', 'special_program_registration'
      )
    ) returning id into v_offering;
  else
    update public.academic_offerings
    set title = new.title,
        pathway = v_pathway,
        enrollment_type = 'special',
        programme_id = new.program_id,
        starts_on = new.starts_on,
        ends_on = new.ends_on,
        status = case when status in ('draft', 'active') then v_status else status end,
        updated_at = now()
    where id = v_offering;
  end if;

  select id into v_period
  from public.academic_offering_periods
  where offering_id = v_offering
  order by sequence_number
  limit 1;

  if v_period is null then
    insert into public.academic_offering_periods(
      offering_id, label, starts_on, ends_on, status
    ) values (
      v_offering, new.title, new.starts_on, new.ends_on,
      case when new.is_published then 'active' else 'planned' end
    ) returning id into v_period;
  else
    update public.academic_offering_periods
    set label = new.title,
        starts_on = new.starts_on,
        ends_on = new.ends_on,
        status = case when new.is_published then 'active' else 'planned' end,
        updated_at = now()
    where id = v_period;
  end if;

  if new.academic_offering_id is distinct from v_offering then
    update public.special_program_pages
    set academic_offering_id = v_offering
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_special_program_academic_offering on public.special_program_pages;
create trigger sync_special_program_academic_offering
after insert or update of title, program_id, starts_on, ends_on, is_published
on public.special_program_pages
for each row execute function public.sync_special_program_academic_offering();

-- ── 3. Repair the offerings already minted ownerless ──
--
-- An ownerless offering that already has a cohort class can adopt that class's
-- school — that is the school teaching is actually happening in. The rest fall
-- back to 'draft' so the guard and the unique index both hold from here on.
-- Financial rows are untouched; only offering ownership and status change.

update public.academic_offerings o
set school_id = c.school_id,
    updated_at = now()
from (
  select distinct on (academic_offering_id) academic_offering_id, school_id
  from public.classes
  where academic_offering_id is not null and school_id is not null
  order by academic_offering_id, created_at asc
) c
where c.academic_offering_id = o.id
  and o.special_program_page_id is not null
  and o.school_id is null;

update public.academic_offerings o
set programme_id = p.program_id,
    updated_at = now()
from public.special_program_pages p
where p.id = o.special_program_page_id
  and o.programme_id is null
  and p.program_id is not null;

update public.academic_offerings
set status = 'draft',
    updated_at = now()
where special_program_page_id is not null
  and status = 'active'
  and (programme_id is null or school_id is null);

-- ── 4. Close the offering-spine read leak ──
--
-- `offering_staff_read` allowed any authenticated user to read every offering
-- with school_id IS NULL. That clause exists for the online school, which
-- legitimately has none — but special-programme offerings were also created
-- school-less, so every learner could read every unpublished programme's
-- title, dates and settings (settings carries teaching_launch errors).
-- Requiring a non-draft status keeps the online school exactly as readable as
-- it is today while drafts stop being public to signed-in users.
--
-- `offering_period_staff_read` read `exists(select 1 from academic_offerings
-- where id = offering_id)` — true for every row in the table. It now mirrors
-- the offering policy instead of standing in for it.

drop policy if exists offering_staff_read on public.academic_offerings;
create policy offering_staff_read on public.academic_offerings for select using(
  public.is_admin()
  or (school_id is null and status <> 'draft')
  or exists(select 1 from public.portal_users u
            where u.id = auth.uid() and u.school_id = academic_offerings.school_id)
  or exists(select 1 from public.classes c
            where c.academic_offering_id = academic_offerings.id and c.teacher_id = auth.uid())
);

drop policy if exists offering_period_staff_read on public.academic_offering_periods;
create policy offering_period_staff_read on public.academic_offering_periods for select using(
  exists(
    select 1 from public.academic_offerings o
    where o.id = academic_offering_periods.offering_id
      and (
        public.is_admin()
        or (o.school_id is null and o.status <> 'draft')
        or exists(select 1 from public.portal_users u
                  where u.id = auth.uid() and u.school_id = o.school_id)
        or exists(select 1 from public.classes c
                  where c.academic_offering_id = o.id and c.teacher_id = auth.uid())
      )
  )
);

comment on function public.special_offering_status_follows_ownership() is
  'A special-programme offering is live only while its page is published AND it names a programme and a school. Publishing alone used to mint active offerings owned by nobody.';
