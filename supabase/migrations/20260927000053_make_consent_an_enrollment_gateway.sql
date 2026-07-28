-- Consent forms are an admission gateway into the same academic pathway engine.
-- Legacy forms remain Regular School; new Online/Special/In-person forms carry
-- their pathway explicitly and may pin an exact academic offering.

alter table public.consent_forms
  add column if not exists enrollment_type text not null default 'school',
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict;

alter table public.consent_forms
  drop constraint if exists consent_forms_enrollment_type_check;

alter table public.consent_forms
  add constraint consent_forms_enrollment_type_check
  check (enrollment_type in ('school', 'online', 'in_person', 'special'));

create index if not exists idx_consent_forms_academic_offering
  on public.consent_forms(academic_offering_id)
  where academic_offering_id is not null;

comment on column public.consent_forms.enrollment_type is
  'Admission pathway inherited by students onboarded through this form. Legacy forms default to Regular School.';

comment on column public.consent_forms.academic_offering_id is
  'Optional exact academic offering inherited during consent onboarding, required to disambiguate independent Online or Special pathways.';
