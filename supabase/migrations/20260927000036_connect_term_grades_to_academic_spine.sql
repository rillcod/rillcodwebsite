-- Preserve the simple enrolment grade workflow while attaching its academic
-- context and moderation trail to the same evidence spine.

create or replace function public.bind_term_grade_to_academic_spine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_program uuid;
  v_class uuid;
  v_school uuid;
  v_course uuid;
  v_release uuid;
begin
  select e.user_id, e.program_id into v_student, v_program
  from public.enrollments e where e.id = new.enrollment_id;
  if v_student is null then raise exception 'The learner enrolment was not found.'; end if;

  select p.class_id, p.school_id into v_class, v_school
  from public.portal_users p where p.id = v_student;
  if v_class is not null then
    select c.current_course_id, coalesce(v_school, c.school_id)
      into v_course, v_school from public.classes c where c.id = v_class;
  end if;
  if v_course is null then
    select c.id into v_course from public.courses c
    where c.program_id = v_program and c.is_active = true
    order by c.level_order nulls last limit 1;
  end if;
  if v_class is not null and v_course is not null then
    select p.curriculum_release_id into v_release from public.lesson_plans p
    where p.class_id = v_class and p.course_id = v_course and p.term_id = new.term_id
      and p.status <> 'archived' limit 1;
  end if;

  new.school_id := coalesce(new.school_id, v_school);
  new.class_id := coalesce(new.class_id, v_class);
  new.course_id := coalesce(new.course_id, v_course);
  new.curriculum_release_id := coalesce(new.curriculum_release_id, v_release);
  return new;
end;
$$;

drop trigger if exists bind_term_grade_to_academic_spine on public.enrollment_term_grades;
create trigger bind_term_grade_to_academic_spine
before insert or update of enrollment_id,term_id,school_id,class_id,course_id,curriculum_release_id
on public.enrollment_term_grades for each row execute function public.bind_term_grade_to_academic_spine();

create or replace function public.sync_term_grade_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_plan uuid;
begin
  select user_id into v_student from public.enrollments where id = new.enrollment_id;
  if v_student is null then return new; end if;
  if new.class_id is not null and new.course_id is not null then
    select id into v_plan from public.lesson_plans
    where class_id=new.class_id and course_id=new.course_id and term_id=new.term_id
      and status<>'archived' limit 1;
  end if;

  insert into public.academic_assessment_evidence (
    evidence_type,source_id,student_id,school_id,class_id,course_id,academic_term_id,
    curriculum_release_id,lesson_plan_id,evidence_status,evidence_snapshot,updated_at
  ) values (
    'term_grade',new.id,v_student,new.school_id,new.class_id,new.course_id,new.term_id,
    new.curriculum_release_id,v_plan,
    case when new.moderation_status='approved' then 'moderated' else 'recorded' end,
    jsonb_build_object('grade',new.grade,'notes',new.notes,'moderation_status',new.moderation_status),now()
  ) on conflict (evidence_type,source_id) do update set
    school_id=excluded.school_id,class_id=excluded.class_id,course_id=excluded.course_id,
    academic_term_id=excluded.academic_term_id,curriculum_release_id=excluded.curriculum_release_id,
    lesson_plan_id=excluded.lesson_plan_id,evidence_status=excluded.evidence_status,
    evidence_snapshot=excluded.evidence_snapshot,updated_at=now();
  return new;
end;
$$;

drop trigger if exists sync_term_grade_evidence on public.enrollment_term_grades;
create trigger sync_term_grade_evidence after insert or update
on public.enrollment_term_grades for each row execute function public.sync_term_grade_evidence();

-- Populate context for existing term grades without altering grade values.
update public.enrollment_term_grades set updated_at=updated_at;

comment on function public.bind_term_grade_to_academic_spine() is
  'Adds school, class, course and official curriculum context to simple term grades without changing their values.';
