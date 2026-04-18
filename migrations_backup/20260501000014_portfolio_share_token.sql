-- migration: portfolio share token columns
-- requirements: req 23.1, nf-13.1

-- add nullable share token columns to portal_users.
-- portfolio_share_token holds the uuid token (null = no active link).
-- portfolio_share_token_expires_at is null when no link is active;
-- set to now() + 30 days on generation and cleared on revocation.
-- no rls changes needed — portal_users rls already exists.
-- no index needed (token lookups on the public student page use a direct
-- equality filter that postgres can handle without a dedicated index at
-- this scale).

alter table public.portal_users
  add column if not exists portfolio_share_token            text,
  add column if not exists portfolio_share_token_expires_at timestamptz;
