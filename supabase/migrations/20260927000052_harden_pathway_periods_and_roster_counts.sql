-- Keep programme periods append-only across academic years. A repeated First/
-- Second/Third Term number becomes the next pathway sequence automatically.
create or replace function public.keep_offering_period_sequence_unique()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.academic_offering_periods p where p.offering_id=new.offering_id and p.sequence_number=new.sequence_number and p.id is distinct from new.id) then
    select coalesce(max(p.sequence_number),0)+1 into new.sequence_number
    from public.academic_offering_periods p where p.offering_id=new.offering_id;
  end if;
  return new;
end; $$;
drop trigger if exists aa_keep_offering_period_sequence_unique on public.academic_offering_periods;
create trigger aa_keep_offering_period_sequence_unique
before insert or update of offering_id,sequence_number on public.academic_offering_periods
for each row execute function public.keep_offering_period_sequence_unique();

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
    select u.id
    from public.portal_users u cross join target t
    where u.class_id=t.id and u.role='student' and coalesce(u.is_deleted,false)=false and coalesce(u.is_active,true)
      and not exists(select 1 from public.class_term_rosters r where r.class_id=t.id and r.student_id=u.id and r.term_id is not distinct from t.term_id)
  ) select count(*) from (select student_id as id from rostered union select id from legacy) x
$$;
revoke all on function public.active_class_student_count(uuid) from public,anon,authenticated;
grant execute on function public.active_class_student_count(uuid) to service_role;
