-- The academic decisions a school is answerable for were never recorded.
-- audit_logs holds 15,803 rows, of which 15,017 are one repeated parent-link
-- event; certification, distribution, class reclassification, result
-- recalculation and certificate issuance had none between them. Reclassifying
-- a live class today left no trace at all.
--
-- These are database triggers rather than application calls, so a change is
-- recorded whether it came from the app, a script, a cron job or a direct
-- service-role write — which is exactly how the untracked changes got in.
--
-- Scope is deliberately narrow: the five decisions that carry accountability,
-- and only when something meaningful actually changed. Audit a change, not a
-- visit, or the trail buries itself the way the parent-link event did.

create or replace function public.audit_academic_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_record uuid;
begin
  if tg_table_name = 'academic_curriculum_releases' then
    -- Certifying: a draft becomes a protected official edition.
    if tg_op = 'INSERT' and new.status = 'published' then
      v_action := 'curriculum.certified';
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      v_action := 'curriculum.status_changed';
      v_old := jsonb_build_object('status', old.status);
    else
      return coalesce(new, old);
    end if;
    v_record := new.id;
    v_new := jsonb_build_object(
      'title', new.title, 'course_id', new.course_id, 'status', new.status,
      'release_number', new.release_number, 'academic_session', new.academic_session,
      'effective_term_number', new.effective_term_number);

  elsif tg_table_name = 'academic_curriculum_adoptions' then
    -- Distributing to a school.
    if tg_op = 'INSERT' then
      v_action := 'curriculum.adopted_by_school';
    elsif tg_op = 'UPDATE' and new.release_id is distinct from old.release_id then
      v_action := 'curriculum.adoption_changed';
      v_old := jsonb_build_object('release_id', old.release_id);
    elsif tg_op = 'DELETE' then
      v_action := 'curriculum.adoption_withdrawn';
      v_old := to_jsonb(old);
      v_record := old.id;
    else
      return coalesce(new, old);
    end if;
    if tg_op <> 'DELETE' then
      v_record := new.id;
      v_new := jsonb_build_object('school_id', new.school_id, 'course_id', new.course_id,
        'release_id', new.release_id, 'academic_session', new.academic_session);
    end if;

  elsif tg_table_name = 'academic_offering_curriculum_directions' then
    -- Distributing to an online or special pathway that owns its edition.
    if tg_op = 'INSERT' then
      v_action := 'curriculum.pathway_direction_assigned';
    elsif tg_op = 'UPDATE' and new.release_id is distinct from old.release_id then
      v_action := 'curriculum.pathway_direction_changed';
      v_old := jsonb_build_object('release_id', old.release_id);
    elsif tg_op = 'DELETE' then
      v_action := 'curriculum.pathway_direction_withdrawn';
      v_old := to_jsonb(old);
      v_record := old.id;
    else
      return coalesce(new, old);
    end if;
    if tg_op <> 'DELETE' then
      v_record := new.id;
      v_new := jsonb_build_object('academic_offering_id', new.academic_offering_id,
        'course_id', new.course_id, 'release_id', new.release_id);
    end if;

  elsif tg_table_name = 'classes' then
    -- Moving a live class between programmes, offerings or periods changes
    -- which curriculum and which results apply to everyone in it.
    if tg_op <> 'UPDATE' then return new; end if;
    if new.program_id is not distinct from old.program_id
       and new.academic_offering_id is not distinct from old.academic_offering_id
       and new.offering_period_id is not distinct from old.offering_period_id
       and new.term_id is not distinct from old.term_id then
      return new;
    end if;
    v_action := 'class.reclassified';
    v_record := new.id;
    v_old := jsonb_build_object('name', old.name, 'program_id', old.program_id,
      'academic_offering_id', old.academic_offering_id,
      'offering_period_id', old.offering_period_id, 'term_id', old.term_id);
    v_new := jsonb_build_object('name', new.name, 'program_id', new.program_id,
      'academic_offering_id', new.academic_offering_id,
      'offering_period_id', new.offering_period_id, 'term_id', new.term_id);

  elsif tg_table_name = 'certificates' then
    if tg_op = 'INSERT' then
      v_action := 'certificate.issued';
    elsif tg_op = 'UPDATE' and new.completion_status is distinct from old.completion_status then
      v_action := 'certificate.status_changed';
      v_old := jsonb_build_object('completion_status', old.completion_status);
    else
      return coalesce(new, old);
    end if;
    v_record := new.id;
    v_new := jsonb_build_object('portal_user_id', new.portal_user_id,
      'course_id', new.course_id, 'certificate_number', new.certificate_number,
      'completion_status', new.completion_status);

  elsif tg_table_name = 'student_progress_reports' then
    -- Publication and automatic recalculation both change what a family sees.
    if tg_op = 'UPDATE' and new.is_published is distinct from old.is_published then
      v_action := case when new.is_published then 'result.published' else 'result.withdrawn' end;
      v_old := jsonb_build_object('is_published', old.is_published,
        'overall_score', old.overall_score);
    elsif tg_op = 'UPDATE' and new.calculated_at is distinct from old.calculated_at
          and new.calculation_mode = 'automatic' then
      v_action := 'result.recalculated';
      v_old := jsonb_build_object('overall_score', old.overall_score);
    else
      return coalesce(new, old);
    end if;
    v_record := new.id;
    v_new := jsonb_build_object('student_id', new.student_id, 'class_id', new.class_id,
      'course_id', new.course_id, 'overall_score', new.overall_score,
      'calculation_mode', new.calculation_mode, 'is_published', new.is_published);
  else
    return coalesce(new, old);
  end if;

  insert into public.audit_logs(user_id, actor_id, action, table_name, record_id,
    old_values, new_values, resource_type, resource_id, created_at)
  values (auth.uid(), auth.uid(), v_action, tg_table_name, v_record,
    v_old, v_new, tg_table_name, v_record, now());

  return coalesce(new, old);
exception when others then
  -- A failure to record must never cancel the academic action itself.
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_curriculum_certified on public.academic_curriculum_releases;
create trigger audit_curriculum_certified
after insert or update of status on public.academic_curriculum_releases
for each row execute function public.audit_academic_decision();

drop trigger if exists audit_curriculum_adoption on public.academic_curriculum_adoptions;
create trigger audit_curriculum_adoption
after insert or update or delete on public.academic_curriculum_adoptions
for each row execute function public.audit_academic_decision();

drop trigger if exists audit_pathway_direction on public.academic_offering_curriculum_directions;
create trigger audit_pathway_direction
after insert or update or delete on public.academic_offering_curriculum_directions
for each row execute function public.audit_academic_decision();

drop trigger if exists audit_class_reclassified on public.classes;
create trigger audit_class_reclassified
after update of program_id, academic_offering_id, offering_period_id, term_id on public.classes
for each row execute function public.audit_academic_decision();

drop trigger if exists audit_certificate_decision on public.certificates;
create trigger audit_certificate_decision
after insert or update of completion_status on public.certificates
for each row execute function public.audit_academic_decision();

drop trigger if exists audit_result_decision on public.student_progress_reports;
create trigger audit_result_decision
after update of is_published, calculated_at on public.student_progress_reports
for each row execute function public.audit_academic_decision();

comment on function public.audit_academic_decision() is
  'Records the academic decisions a school is answerable for — certification, distribution, class reclassification, certificate issuance, result publication and automatic recalculation — at the database level, so a change is caught whether it came from the app, a script or a direct service-role write.';
