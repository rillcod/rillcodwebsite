-- A withdrawal from a class must survive the class moving to a new term.
--
-- active_class_student_count is a union of two definitions. `rostered` counts
-- active roster rows for the class's CURRENT term. `legacy` was a bridge for
-- learners placed through portal_users.class_id before class_term_rosters
-- covered everyone, counting anyone tied to the class who has no roster row for
-- that term.
--
-- The bridge resurrects withdrawals. Withdrawing a learner marks their roster
-- row for the term they were withdrawn in. When the class later moves to a new
-- term, that row no longer matches, so `legacy` sees a learner with a class_id
-- and no row for the current term — and counts them as present again.
--
-- Measured before this change: 9 withdrawn learners were being counted back
-- into 6 classes, and the withdrawal had been recorded correctly in every case.
-- The count simply stopped looking at it after the term rolled over.
--
-- The fix is narrow on purpose. `legacy` still covers a learner who was never
-- rostered at all — that bridge is still load-bearing for placement paths that
-- write class_id without a roster row. It now excludes anyone this class has
-- ever withdrawn, removed or ended. Reinstatement is unaffected: it writes an
-- active row for the current term, which puts the learner back in `rostered`.
--
-- Deliberately NOT excluded: a learner with an ACTIVE row on an older term and
-- none on the current one. Dropping those would turn an incomplete term
-- roll-forward into a silent undercount, which is the failure this function
-- exists to prevent.

create or replace function public.active_class_student_count(p_class_id uuid)
returns bigint language sql stable security definer set search_path=public as $$
  with target as (select id,term_id from public.classes where id=p_class_id),
  rostered as (
    select distinct r.student_id
    from public.class_term_rosters r
    join public.portal_users u on u.id=r.student_id and u.role='student' and coalesce(u.is_deleted,false)=false
    cross join target t
    where r.class_id=t.id and r.term_id is not distinct from t.term_id and r.status='active'
  ), legacy as (
    select u.id from public.portal_users u,target t
    where u.class_id=t.id and u.role='student' and coalesce(u.is_deleted,false)=false and coalesce(u.is_active,true)
      and not exists(select 1 from public.class_term_rosters r where r.class_id=t.id and r.student_id=u.id and r.term_id is not distinct from t.term_id)
      -- A withdrawal is a decision, and it outlives the term it was made in.
      and not exists(select 1 from public.class_term_rosters r
                     where r.class_id=t.id and r.student_id=u.id and r.status<>'active')
  ) select count(*) from (select student_id as id from rostered union select id from legacy) x
$$;

revoke all on function public.active_class_student_count(uuid) from public,anon,authenticated;
grant execute on function public.active_class_student_count(uuid) to service_role;

comment on function public.active_class_student_count(uuid) is
  'How many learners are in a class now: active roster rows for the current term, plus learners tied by class_id who were never rostered. Never counts a learner this class has withdrawn, whichever term the withdrawal was recorded in.';

-- Bring the stored counts back in line with the function.
--
-- classes.current_students is a cache, refreshed only by the paths that change
-- membership. Twenty of fifty-eight classes had drifted, three of them showing
-- zero learners while teaching seventeen, ten and four.
update public.classes c
set current_students = public.active_class_student_count(c.id),
    updated_at = now()
where c.current_students is distinct from public.active_class_student_count(c.id);
