-- Human-friendly consent entry codes. QR scans and typed codes resolve to the
-- same form so onboarding never forks into separate records.
alter table public.consent_forms
  add column if not exists access_code text;

update public.consent_forms
set access_code = 'CF-'
  || upper(substr(replace(id::text, '-', ''), 1, 4))
  || '-'
  || upper(substr(replace(id::text, '-', ''), 5, 4))
where access_code is null;

alter table public.consent_forms
  alter column access_code set default (
    'CF-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
  ),
  alter column access_code set not null;

alter table public.consent_forms
  drop constraint if exists consent_forms_access_code_format;
alter table public.consent_forms
  add constraint consent_forms_access_code_format
  check (access_code ~ '^CF-[A-F0-9]{4}-[A-F0-9]{4}$');

create unique index if not exists consent_forms_access_code_unique
  on public.consent_forms(access_code);

comment on column public.consent_forms.access_code is
  'Public human-readable entry code. /consent resolves this code to the same canonical form used by its QR.';
