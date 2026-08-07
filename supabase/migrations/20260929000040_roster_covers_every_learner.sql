-- The class roster covered 262 of 895 active learners. Give it the other 633.
--
-- class_term_rosters is the table the accountability workspace, attendance and
-- billing all treat as "who is in this class this term". Only three code paths
-- ever wrote to it — manual enrol, bulk register, and reinstate — while at
-- least ten set portal_users.class_id. Every learner who arrived through
-- onboarding, a consent form, summer school, backfill or heal/assign-class got
-- a class and no roster row.
--
-- The effect was not subtle. ZAINAB ORHUE teaches 181 learners; the workspace
-- showed 7, and computed her completion against those 7. sulemani: 137 real,
-- 22 visible. Across the school, figures presented as the whole picture were
-- drawn from under a third of it.
--
-- portal_users.class_id is complete — every active student has one — so it is
-- the honest source for the backfill. Rows are inserted with billing left
-- untouched: billing_status defaults to 'unknown', invoice_id and
-- billing_cycle_id stay null, and nothing here suspends access or raises a
-- charge. The only insert trigger refreshes an accountability view.

-- Without this, nothing stopped the same learner being rostered into one class
-- twice, and a backfill could not be safely re-run.
create unique index if not exists uq_class_term_roster_learner
  on public.class_term_rosters (class_id, student_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid));

insert into public.class_term_rosters (class_id, student_id, term_id, school_id, status, started_at)
select u.class_id,
       u.id,
       coalesce(c.term_id, (select id from public.academic_terms where is_current order by updated_at desc limit 1)),
       c.school_id,
       'active',
       coalesce(u.created_at, now())
  from public.portal_users u
  join public.classes c on c.id = u.class_id
 where u.role = 'student'
   and coalesce(u.is_deleted, false) = false
   and u.is_active
   and not exists (
     select 1 from public.class_term_rosters r
      where r.student_id = u.id
        and r.class_id = u.class_id
   );

comment on table public.class_term_rosters is
  'Who is in a class for a term. Backfilled 2026-08-07 from portal_users.class_id, which every placement path writes; this table was only written by three of them, so it covered 262 of 895 learners and understated every accountability figure drawn from it.';
