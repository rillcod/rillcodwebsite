-- Optional JSON bag for registration / admin context (kept in sync with app inserts).
-- Safe if the column already exists in production.
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.portal_users.metadata IS 'Arbitrary JSON (e.g. prospective registration fields) alongside typed columns.';
