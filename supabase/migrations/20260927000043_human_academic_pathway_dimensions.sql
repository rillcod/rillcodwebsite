-- Human business meaning for offerings. Virtual School is termly like Regular
-- School; special programmes are duration-based and remain standalone.

alter table public.academic_offerings
  add column if not exists academic_model text,
  add column if not exists delivery_mode text,
  add column if not exists special_programme_kind text,
  add column if not exists learner_account_model text,
  add column if not exists parent_onboarding_model text;

update public.academic_offerings set
  academic_model=case when pathway in ('school_term','online_school') then 'termly_school' else 'duration_programme' end,
  delivery_mode=case when pathway='online_school' then 'virtual'
    when pathway='school_term' then 'in_school' else coalesce(settings->>'delivery_mode','hybrid') end,
  special_programme_kind=case when pathway='bootcamp' then 'bootcamp'
    when pathway='holiday_programme' then 'holiday_programme'
    when pathway='short_course' then 'short_course' else null end,
  learner_account_model=case when pathway in ('school_term','online_school') then 'managed_internal_email' else 'mixed_registration' end,
  parent_onboarding_model=case when pathway in ('school_term','online_school') then 'claim_or_form' else 'programme_registration' end
where academic_model is null;

alter table public.academic_offerings
  alter column academic_model set not null,
  alter column delivery_mode set not null,
  alter column learner_account_model set not null,
  alter column parent_onboarding_model set not null;

alter table public.academic_offerings
  add constraint academic_offering_model_check check(academic_model in ('termly_school','duration_programme')),
  add constraint academic_offering_delivery_check check(delivery_mode in ('in_school','virtual','onsite','hybrid')),
  add constraint academic_offering_special_kind_check check(special_programme_kind is null or special_programme_kind in (
    'bootcamp','holiday_programme','short_course','professional_training'
  )),
  add constraint academic_offering_account_model_check check(learner_account_model in ('managed_internal_email','mixed_registration')),
  add constraint academic_offering_parent_model_check check(parent_onboarding_model in ('claim_or_form','programme_registration','optional')),
  add constraint academic_offering_pathway_consistency check(
    (pathway in ('school_term','online_school') and academic_model='termly_school' and special_programme_kind is null)
    or
    (pathway in ('bootcamp','holiday_programme','short_course') and academic_model='duration_programme' and special_programme_kind is not null)
  );

create or replace function public.normalise_academic_offering_business_model()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.pathway='school_term' then
    new.academic_model:='termly_school';new.delivery_mode:=coalesce(new.delivery_mode,'in_school');
    new.special_programme_kind:=null;new.learner_account_model:='managed_internal_email';
    new.parent_onboarding_model:='claim_or_form';new.result_destination:='school_report';
  elsif new.pathway='online_school' then
    new.academic_model:='termly_school';new.delivery_mode:='virtual';new.special_programme_kind:=null;
    new.learner_account_model:='managed_internal_email';new.parent_onboarding_model:='claim_or_form';
    if new.result_destination='standalone' then new.result_destination:='school_report'; end if;
  else
    new.academic_model:='duration_programme';new.delivery_mode:=coalesce(new.delivery_mode,'hybrid');
    new.special_programme_kind:=coalesce(new.special_programme_kind,
      case when new.pathway='bootcamp' then 'bootcamp' when new.pathway='holiday_programme' then 'holiday_programme'
           when new.pathway='short_course' then 'short_course' else 'professional_training' end);
    new.learner_account_model:='mixed_registration';new.parent_onboarding_model:='programme_registration';
    if new.result_destination='school_report' and new.school_id is null then new.result_destination:='standalone'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalise_academic_offering_business_model on public.academic_offerings;
create trigger normalise_academic_offering_business_model
before insert or update of pathway,delivery_mode,special_programme_kind,result_destination,school_id
on public.academic_offerings for each row execute function public.normalise_academic_offering_business_model();

-- Full Stack and similar named-duration programmes are professional training,
-- even when their public page does not contain the words bootcamp/short course.
update public.academic_offerings set special_programme_kind='professional_training'
where academic_model='duration_programme'
  and special_programme_kind not in ('bootcamp','holiday_programme','short_course')
   or (academic_model='duration_programme' and lower(title) similar to '%(full.?stack|web development|professional|career)%');

comment on column public.academic_offerings.academic_model is
  'termly_school for both Regular and Virtual School; duration_programme for bootcamps, holidays, short courses and professional training.';
comment on column public.academic_offerings.learner_account_model is
  'Regular and Virtual School normally use academy-managed internal learner emails; special programmes support mixed registration.';
comment on column public.academic_offerings.parent_onboarding_model is
  'Regular and Virtual School bring parents through claim or form; special programmes use their registration relationship.';
