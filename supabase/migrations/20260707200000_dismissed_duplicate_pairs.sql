-- "Not a duplicate" (twin / different-person) dismissals from the class-health duplicate
-- reviewer, so a flagged near-duplicate pair stops reappearing in future scans.
-- pair_key is the two portal_users ids sorted + joined, so (a,b) == (b,a) is one row.
create table if not exists public.dismissed_duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique,
  student_a uuid,
  student_b uuid,
  reason text,
  dismissed_by uuid,
  created_at timestamptz not null default now()
);
revoke all on public.dismissed_duplicate_pairs from anon, authenticated;
