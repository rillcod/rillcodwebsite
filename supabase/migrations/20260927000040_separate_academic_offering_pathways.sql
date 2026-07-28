-- One engine, isolated pathways. Regular schools, online school, bootcamps,
-- holiday programmes and short courses share the academic spine without
-- sharing calendars or leaking evidence/results into one another.

create table if not exists public.academic_offerings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pathway text not null check(pathway in (
    'school_term','online_school','bootcamp','holiday_programme','short_course'
  )),
  programme_id uuid references public.programs(id) on delete set null,
  school_id uuid references public.schools(id) on delete cascade,
  special_program_page_id uuid references public.special_program_pages(id) on delete cascade,
  calendar_mode text not null check(calendar_mode in ('school_calendar','fixed_dates','self_paced')),
  result_destination text not null default 'standalone'
    check(result_destination in ('school_report','standalone','transcript_only')),
  starts_on date,
  ends_on date,
  status text not null default 'active' check(status in ('draft','active','completed','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_on is null or starts_on is null or ends_on>=starts_on),
  check(pathway not in ('bootcamp','holiday_programme','short_course') or result_destination<>'school_report' or school_id is not null)
);
create unique index if not exists academic_offering_special_page_unique
  on public.academic_offerings(special_program_page_id) where special_program_page_id is not null;

create table if not exists public.academic_offering_periods (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.academic_offerings(id) on delete cascade,
  label text not null,
  sequence_number integer not null default 1 check(sequence_number>0),
  starts_on date,
  ends_on date,
  status text not null default 'active' check(status in ('planned','active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(offering_id,sequence_number),
  check(ends_on is null or starts_on is null or ends_on>=starts_on)
);

alter table public.classes
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.lesson_plans
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.assignments
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.cbt_exams
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.exams
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.academic_assessment_evidence
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.student_progress_reports
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.academic_assessment_schemes
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete cascade;
alter table public.academic_progression_decisions
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict;
alter table public.special_program_pages
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete set null;

do $$
declare c record; v_offering uuid; v_period uuid; v_term record;
begin
  for c in select * from public.classes where academic_offering_id is null loop
    insert into public.academic_offerings(title,pathway,programme_id,school_id,calendar_mode,result_destination,settings)
    values(c.name,case when c.school_id is null then 'online_school' else 'school_term' end,
      c.program_id,c.school_id,case when c.school_id is null then 'self_paced' else 'school_calendar' end,
      case when c.school_id is null then 'transcript_only' else 'school_report' end,
      jsonb_build_object('source_class_id',c.id)) returning id into v_offering;
    if c.term_id is not null then
      select term_label,academic_year,start_date,end_date into v_term from public.academic_terms where id=c.term_id;
      insert into public.academic_offering_periods(offering_id,label,starts_on,ends_on,status)
      values(v_offering,concat_ws(' ',v_term.term_label,v_term.academic_year),v_term.start_date,v_term.end_date,'active')
      returning id into v_period;
    else
      insert into public.academic_offering_periods(offering_id,label,status)
      values(v_offering,case when c.school_id is null then 'Current learning period' else 'Academic period to be confirmed' end,'active')
      returning id into v_period;
    end if;
    update public.classes set academic_offering_id=v_offering,offering_period_id=v_period where id=c.id;
  end loop;
end $$;

create or replace function public.sync_special_program_academic_offering()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_offering uuid; v_period uuid;
begin
  select id into v_offering from public.academic_offerings where special_program_page_id=new.id;
  if v_offering is null then
    insert into public.academic_offerings(title,pathway,programme_id,special_program_page_id,
      calendar_mode,result_destination,starts_on,ends_on,status,settings)
    values(new.title,
      case when lower(new.title) like '%bootcamp%' then 'bootcamp'
           when lower(new.title) like '%short course%' then 'short_course'
           else 'holiday_programme' end,
      new.program_id,new.id,'fixed_dates','standalone',new.starts_on,new.ends_on,
      case when new.is_published then 'active' else 'draft' end,
      jsonb_build_object('source','special_program_pages','slug',new.slug)) returning id into v_offering;
    insert into public.academic_offering_periods(offering_id,label,starts_on,ends_on,status)
    values(v_offering,new.title,new.starts_on,new.ends_on,case when new.is_published then 'active' else 'planned' end)
    returning id into v_period;
  else
    update public.academic_offerings set title=new.title,programme_id=new.program_id,
      starts_on=new.starts_on,ends_on=new.ends_on,status=case when new.is_published then 'active' else 'draft' end,
      updated_at=now() where id=v_offering;
    select id into v_period from public.academic_offering_periods where offering_id=v_offering order by sequence_number limit 1;
    update public.academic_offering_periods set label=new.title,starts_on=new.starts_on,ends_on=new.ends_on,
      status=case when new.is_published then 'active' else 'planned' end,updated_at=now() where id=v_period;
  end if;
  if new.academic_offering_id is distinct from v_offering then
    update public.special_program_pages set academic_offering_id=v_offering where id=new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_special_program_academic_offering on public.special_program_pages;
create trigger sync_special_program_academic_offering after insert or update of title,program_id,starts_on,ends_on,is_published
on public.special_program_pages for each row execute function public.sync_special_program_academic_offering();

-- Backfill all existing special programme definitions.
update public.special_program_pages set updated_at=updated_at;

create or replace function public.bind_record_to_academic_offering()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_offering uuid; v_period uuid;
begin
  if new.class_id is not null then
    select academic_offering_id,offering_period_id into v_offering,v_period from public.classes where id=new.class_id;
  elsif new.lesson_plan_id is not null then
    select academic_offering_id,offering_period_id into v_offering,v_period from public.lesson_plans where id=new.lesson_plan_id;
  end if;
  if new.academic_offering_id is not null and v_offering is not null and new.academic_offering_id<>v_offering then
    raise exception using message='Academic offering does not match the selected class.',
      hint='Keep school-term and special-programme work in their own class or cohort.';
  end if;
  new.academic_offering_id:=coalesce(new.academic_offering_id,v_offering);
  new.offering_period_id:=coalesce(new.offering_period_id,v_period);
  return new;
end;
$$;

drop trigger if exists bind_plan_to_academic_offering on public.lesson_plans;
create trigger bind_plan_to_academic_offering before insert or update of class_id,academic_offering_id,offering_period_id
on public.lesson_plans for each row execute function public.bind_record_to_academic_offering();
drop trigger if exists bind_assignment_to_academic_offering on public.assignments;
create trigger bind_assignment_to_academic_offering before insert or update of class_id,lesson_plan_id,academic_offering_id,offering_period_id
on public.assignments for each row execute function public.bind_record_to_academic_offering();
drop trigger if exists bind_cbt_to_academic_offering on public.cbt_exams;
create trigger bind_cbt_to_academic_offering before insert or update of class_id,lesson_plan_id,academic_offering_id,offering_period_id
on public.cbt_exams for each row execute function public.bind_record_to_academic_offering();
drop trigger if exists bind_exam_to_academic_offering on public.exams;
create trigger bind_exam_to_academic_offering before insert or update of class_id,lesson_plan_id,academic_offering_id,offering_period_id
on public.exams for each row execute function public.bind_record_to_academic_offering();
drop trigger if exists bind_report_to_academic_offering on public.student_progress_reports;
create trigger bind_report_to_academic_offering before insert or update of class_id,academic_offering_id,offering_period_id
on public.student_progress_reports for each row execute function public.bind_record_to_academic_offering();

create or replace function public.bind_evidence_to_academic_offering()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.class_id is not null then
    select academic_offering_id,offering_period_id into new.academic_offering_id,new.offering_period_id
    from public.classes where id=new.class_id;
  end if;
  return new;
end;
$$;
drop trigger if exists bind_evidence_to_academic_offering on public.academic_assessment_evidence;
create trigger bind_evidence_to_academic_offering before insert or update of class_id,academic_offering_id,offering_period_id
on public.academic_assessment_evidence for each row execute function public.bind_evidence_to_academic_offering();

update public.lesson_plans p set academic_offering_id=c.academic_offering_id,offering_period_id=c.offering_period_id
from public.classes c where c.id=p.class_id and p.academic_offering_id is null;
update public.assignments a set academic_offering_id=c.academic_offering_id,offering_period_id=c.offering_period_id
from public.classes c where c.id=a.class_id and a.academic_offering_id is null;
update public.cbt_exams e set academic_offering_id=c.academic_offering_id,offering_period_id=c.offering_period_id
from public.classes c where c.id=e.class_id and e.academic_offering_id is null;
update public.student_progress_reports r set academic_offering_id=c.academic_offering_id,offering_period_id=c.offering_period_id
from public.classes c where c.id=r.class_id and r.academic_offering_id is null;
update public.academic_assessment_evidence e set academic_offering_id=c.academic_offering_id,offering_period_id=c.offering_period_id
from public.classes c where c.id=e.class_id and e.academic_offering_id is null;

alter table public.academic_offerings enable row level security;
alter table public.academic_offering_periods enable row level security;
create policy offering_staff_read on public.academic_offerings for select using(
  public.is_admin() or school_id is null or exists(select 1 from public.portal_users u where u.id=auth.uid() and u.school_id=academic_offerings.school_id)
  or exists(select 1 from public.classes c where c.academic_offering_id=academic_offerings.id and c.teacher_id=auth.uid())
);
create policy offering_period_staff_read on public.academic_offering_periods for select using(
  exists(select 1 from public.academic_offerings o where o.id=academic_offering_periods.offering_id)
);
create policy offering_admin_manage on public.academic_offerings for all using(public.is_admin()) with check(public.is_admin());
create policy offering_period_admin_manage on public.academic_offering_periods for all using(public.is_admin()) with check(public.is_admin());
grant select on public.academic_offerings,public.academic_offering_periods to authenticated;

create index if not exists assignment_offering_scope_idx on public.assignments(academic_offering_id,offering_period_id,class_id,course_id);
create index if not exists evidence_offering_scope_idx on public.academic_assessment_evidence(academic_offering_id,offering_period_id,student_id,course_id);
create index if not exists report_offering_scope_idx on public.student_progress_reports(academic_offering_id,offering_period_id,student_id,course_id);

comment on table public.academic_offerings is
  'Isolated delivery pathway for a regular school term, online school, bootcamp, holiday programme or short course. All use one academic engine without cross-programme result bleed.';
