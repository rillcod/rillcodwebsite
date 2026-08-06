-- A learner may read their own points ledger. Nobody may write their own.
--
-- point_transactions has RLS enabled and not one policy, which in Postgres
-- means deny-everything for anon and authenticated. The gamification service
-- was writing to it with the caller's session, so every award — lesson
-- complete, quiz pass, assignment submit, discussion post — was silently
-- refused. The table holds one row for the whole platform.
--
-- The service now writes with the service role, which is the correct side of
-- this: a learner able to insert into point_transactions can award themselves
-- any score, so the write path must never be opened to them. What was missing
-- is the read: a learner could not see their own history either, and the API
-- had to reach for the admin client just to show someone their own points.
--
-- Staff need the whole picture for leaderboards and reports, so admins and
-- teachers may read all of it. Writes remain server-side only — no INSERT,
-- UPDATE or DELETE policy is granted to anyone here.

alter table public.point_transactions enable row level security;

drop policy if exists point_transactions_read_own on public.point_transactions;
create policy point_transactions_read_own
  on public.point_transactions
  for select
  using (portal_user_id = auth.uid());

drop policy if exists point_transactions_staff_read on public.point_transactions;
create policy point_transactions_staff_read
  on public.point_transactions
  for select
  using (
    exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role in ('admin', 'teacher')
         and coalesce(u.is_deleted, false) = false
    )
  );

comment on table public.point_transactions is
  'Append-only XP ledger. Readable by the learner it belongs to and by staff; written only by the service role, so points cannot be self-awarded.';
