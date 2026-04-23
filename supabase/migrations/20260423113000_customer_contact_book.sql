-- Customer contact book for softly labelled origin capture.

create table if not exists public.customer_contact_book (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.portal_users(id) on delete set null,
  role text not null,
  full_name text not null,
  email text,
  phone text,
  school_name text,
  class_name text,
  source text not null default 'unknown',
  last_channel text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists customer_contact_book_user_uidx
  on public.customer_contact_book (user_id)
  where user_id is not null;

create index if not exists customer_contact_book_role_idx
  on public.customer_contact_book (role, confirmed_at desc);

create index if not exists customer_contact_book_school_class_idx
  on public.customer_contact_book (school_name, class_name);

alter table public.customer_contact_book enable row level security;
