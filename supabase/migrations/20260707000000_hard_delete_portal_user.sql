-- Full, complete delete of any portal user (student/teacher/school/parent) with correct
-- cascade semantics. Owned student data is removed; creator/teacher references are kept
-- but unlinked. Applied live 2026-07-07. Two parts: (1) FK ON DELETE rules, (2) the
-- hard_delete_portal_user() function that also handles the remaining NO ACTION FKs and
-- wipes the students + portal_users + auth.users rows.

-- FK ON DELETE rules: owned student data → CASCADE, creator/actor refs → SET NULL.
-- Financial / audit / CRM FKs are intentionally left as-is (handled by the function).
ALTER TABLE public.assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_portal_user_id_fkey;
ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_portal_user_id_fkey;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.content_ratings DROP CONSTRAINT IF EXISTS content_ratings_portal_user_id_fkey;
ALTER TABLE public.content_ratings ADD CONSTRAINT content_ratings_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.exam_attempts DROP CONSTRAINT IF EXISTS exam_attempts_portal_user_id_fkey;
ALTER TABLE public.exam_attempts ADD CONSTRAINT exam_attempts_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.leaderboards DROP CONSTRAINT IF EXISTS leaderboards_portal_user_id_fkey;
ALTER TABLE public.leaderboards ADD CONSTRAINT leaderboards_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.lesson_progress DROP CONSTRAINT IF EXISTS lesson_progress_portal_user_id_fkey;
ALTER TABLE public.lesson_progress ADD CONSTRAINT lesson_progress_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.live_session_attendance DROP CONSTRAINT IF EXISTS live_session_attendance_portal_user_id_fkey;
ALTER TABLE public.live_session_attendance ADD CONSTRAINT live_session_attendance_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.live_session_breakout_participants DROP CONSTRAINT IF EXISTS live_session_breakout_participants_portal_user_id_fkey;
ALTER TABLE public.live_session_breakout_participants ADD CONSTRAINT live_session_breakout_participants_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.live_session_poll_responses DROP CONSTRAINT IF EXISTS live_session_poll_responses_portal_user_id_fkey;
ALTER TABLE public.live_session_poll_responses ADD CONSTRAINT live_session_poll_responses_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_portal_user_id_fkey;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.parent_teacher_threads DROP CONSTRAINT IF EXISTS parent_teacher_threads_student_id_fkey;
ALTER TABLE public.parent_teacher_threads ADD CONSTRAINT parent_teacher_threads_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_portal_user_id_fkey;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.project_group_members DROP CONSTRAINT IF EXISTS project_group_members_student_id_fkey;
ALTER TABLE public.project_group_members ADD CONSTRAINT project_group_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.user_badges DROP CONSTRAINT IF EXISTS user_badges_portal_user_id_fkey;
ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.user_points DROP CONSTRAINT IF EXISTS user_points_portal_user_id_fkey;
ALTER TABLE public.user_points ADD CONSTRAINT user_points_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_portal_user_id_fkey;
ALTER TABLE public.whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_portal_user_id_fkey FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_author_id_fkey;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_graded_by_fkey;
ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS fk_audit_actor;
ALTER TABLE public.audit_logs ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_teacher_id_fkey;
ALTER TABLE public.classes ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.content_library DROP CONSTRAINT IF EXISTS content_library_approved_by_fkey;
ALTER TABLE public.content_library ADD CONSTRAINT content_library_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.content_library DROP CONSTRAINT IF EXISTS content_library_created_by_fkey;
ALTER TABLE public.content_library ADD CONSTRAINT content_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.discussion_replies DROP CONSTRAINT IF EXISTS discussion_replies_created_by_fkey;
ALTER TABLE public.discussion_replies ADD CONSTRAINT discussion_replies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.discussion_topics DROP CONSTRAINT IF EXISTS discussion_topics_created_by_fkey;
ALTER TABLE public.discussion_topics ADD CONSTRAINT discussion_topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_created_by_fkey;
ALTER TABLE public.exams ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_uploaded_by_fkey;
ALTER TABLE public.files ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.lesson_plans DROP CONSTRAINT IF EXISTS lesson_plans_created_by_fkey;
ALTER TABLE public.lesson_plans ADD CONSTRAINT lesson_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.live_session_breakout_rooms DROP CONSTRAINT IF EXISTS live_session_breakout_rooms_created_by_fkey;
ALTER TABLE public.live_session_breakout_rooms ADD CONSTRAINT live_session_breakout_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.live_session_polls DROP CONSTRAINT IF EXISTS live_session_polls_created_by_fkey;
ALTER TABLE public.live_session_polls ADD CONSTRAINT live_session_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.newsletters DROP CONSTRAINT IF EXISTS newsletters_author_id_fkey;
ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.portal_users DROP CONSTRAINT IF EXISTS portal_users_created_by_fkey;
ALTER TABLE public.portal_users ADD CONSTRAINT portal_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.project_groups DROP CONSTRAINT IF EXISTS project_groups_created_by_fkey;
ALTER TABLE public.project_groups ADD CONSTRAINT project_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.report_settings DROP CONSTRAINT IF EXISTS report_settings_teacher_id_fkey;
ALTER TABLE public.report_settings ADD CONSTRAINT report_settings_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_approved_by_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_created_by_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS teachers_created_by_fkey;
ALTER TABLE public.teachers ADD CONSTRAINT teachers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.timetables DROP CONSTRAINT IF EXISTS timetables_created_by_fkey;
ALTER TABLE public.timetables ADD CONSTRAINT timetables_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;

create or replace function public.hard_delete_portal_user(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

revoke all on function public.hard_delete_portal_user(uuid) from public, anon, authenticated;
