-- Expand billing_contacts to support both school and individual owners

alter table public.billing_contacts
  add column if not exists owner_type text not null default 'school' check (owner_type in ('school', 'individual')),
  add column if not exists owner_user_id uuid null references public.portal_users(id) on delete set null;

-- Existing schema had school_id not null + unique(school_id); keep compatibility but allow individual contacts.
alter table public.billing_contacts
  alter column school_id drop not null;

-- Drop legacy unique constraint/index on school_id if present.
alter table public.billing_contacts
  drop constraint if exists billing_contacts_school_id_key;
drop index if exists billing_contacts_school_id_key;

-- One contact per school owner
create unique index if not exists ux_billing_contacts_school_owner
on public.billing_contacts (school_id)
where owner_type = 'school' and school_id is not null;

-- One contact per individual owner
create unique index if not exists ux_billing_contacts_individual_owner
on public.billing_contacts (owner_user_id)
where owner_type = 'individual' and owner_user_id is not null;

create index if not exists idx_billing_contacts_owner_type
on public.billing_contacts (owner_type);
