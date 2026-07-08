-- Fix: deleting a student failed ("still has data in email_events") and rolled back, so the
-- account stuck around. Root cause: email_events.report_id -> student_progress_reports was
-- ON DELETE NO ACTION — a SECOND-level dependency the hard-delete walk never reached. When it
-- deleted the student's progress reports, email_events still pointed at them, the report delete
-- failed, and the final student/portal_users delete threw.
--
-- Two-part fix: (1) CASCADE the constraint so notification rows die with their report, and
-- (2) a defensive pre-step in hard_delete_portal_user so it works even without the cascade.

ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_report_id_fkey;
ALTER TABLE email_events
  ADD CONSTRAINT email_events_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES student_progress_reports(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION hard_delete_portal_user(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  r record;
  s_id uuid;
  passes int;
  nulled int := 0;
  removed int := 0;
  is_owner boolean;
  owner_cols text[] := array['student_id','portal_user_id','user_id','holder_id','member_id',
    'owner_id','participant_id','profile_id','account_id','child_id','student_user_id',
    'subject_student_id','enrollee_id'];
begin
  select id into s_id from students where user_id = p_id limit 1;

  -- Second-level cleanup: notification/audit rows that hang off the student's progress reports
  -- (email_events etc.) so the reports themselves can be deleted. Belt to the CASCADE suspenders.
  -- NB: alias must NOT be `r` — that collides with the declared record variable below and
  -- caused "record r is not assigned yet", which broke every hard delete.
  delete from email_events ee using student_progress_reports spr
    where ee.report_id = spr.id and (spr.student_id = s_id or spr.student_id = p_id);

  -- For every FK that references portal_users.id (and the linked students.id), decide per
  -- constraint: CASCADE/SET NULL constraints self-handle on the final delete; for the rest
  -- (NO ACTION/RESTRICT) we DELETE the row when the column denotes ownership (student data)
  -- and NULL it when it's a creator/actor reference (so a teacher's classes, reports and
  -- lessons are preserved, just unlinked). Not-null non-owner refs (join tables) are removed.
  for passes in 1..3 loop
    for r in
      select rel.relname as tbl, att.attname as col, con.confdeltype as del, att.attnotnull as notnull,
             ref.relname as reftbl
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ck.attnum
      where con.contype = 'f'
        and ref.relname in ('portal_users','students')
        and array_length(con.conkey,1) = 1
        and rel.relname not in ('portal_users','students')
    loop
      continue when r.del in ('c','n');  -- CASCADE / SET NULL handled by the engine
      is_owner := r.col = any(owner_cols);
      begin
        if is_owner then
          execute format('delete from public.%I where %I = $1', r.tbl, r.col)
            using (case when r.reftbl = 'students' then s_id else p_id end);
          removed := removed + 1;
        elsif not r.notnull then
          execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col)
            using (case when r.reftbl = 'students' then s_id else p_id end);
          nulled := nulled + 1;
        else
          execute format('delete from public.%I where %I = $1', r.tbl, r.col)
            using (case when r.reftbl = 'students' then s_id else p_id end);
          removed := removed + 1;
        end if;
      exception when others then null;
      end;
    end loop;
  end loop;

  delete from students where user_id = p_id;
  delete from portal_users where id = p_id;
  delete from auth.users where id = p_id;

  return jsonb_build_object('deleted', true, 'user_id', p_id, 'student_id', s_id,
    'children_removed', removed, 'refs_nulled', nulled);
end
$$;
