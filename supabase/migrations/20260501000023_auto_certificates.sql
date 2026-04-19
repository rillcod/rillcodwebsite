-- migration: auto-generate completion certificates
-- requirements: NF-2.1

-- unique constraint to prevent duplicate certificates for the same course
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_certificates_user_course') THEN
        ALTER TABLE public.certificates 
        ADD CONSTRAINT uq_certificates_user_course UNIQUE (portal_user_id, course_id);
    END IF;
END $$;

-- function to check if a student has completed a course
create or replace function public.check_course_completion(p_user_id uuid, p_course_id uuid)
returns boolean as $$
declare
    v_total_lessons int;
    v_completed_lessons int;
    v_has_passed_exam boolean;
begin
    -- 1. count total lessons in course
    select count(*) into v_total_lessons 
    from public.lessons 
    where course_id = p_course_id 
    and status = 'published';

    if v_total_lessons = 0 then
        return false;
    end if;

    -- 2. count completed lessons for user
    select count(lp.id) into v_completed_lessons 
    from public.lesson_progress lp
    join public.lessons l on lp.lesson_id = l.id
    where lp.portal_user_id = p_user_id 
    and l.course_id = p_course_id 
    and lp.status = 'completed';

    if v_completed_lessons < v_total_lessons then
        return false;
    end if;

    -- 3. check for passing CBT exam score
    select exists (
        select 1 
        from public.cbt_sessions s
        join public.cbt_exams e on s.exam_id = e.id
        where s.user_id = p_user_id 
        and e.course_id = p_course_id
        and s.score >= e.passing_score
        and s.status in ('completed', 'passed')
    ) into v_has_passed_exam;

    return v_has_passed_exam;
end;
$$ language plpgsql security definer;

-- function to handle the trigger and generate certificate row
create or replace function public.handle_certificate_trigger()
returns trigger as $$
declare
    v_course_id uuid;
    v_user_id uuid;
    v_completed boolean;
    v_cert_id uuid;
begin
    -- determine user_id and course_id based on which table triggered
    if tg_table_name = 'lesson_progress' then
        v_user_id := new.portal_user_id;
        select course_id into v_course_id from public.lessons where id = new.lesson_id;
    elsif tg_table_name = 'cbt_sessions' then
        v_user_id := new.user_id;
        select course_id into v_course_id from public.cbt_exams where id = new.exam_id;
    end if;

    if v_user_id is null or v_course_id is null then
        return new;
    end if;

    -- check if already has certificate
    if exists (select 1 from public.certificates where portal_user_id = v_user_id and course_id = v_course_id) then
        return new;
    end if;

    -- check completion
    if public.check_course_completion(v_user_id, v_course_id) then
        -- generate certificate row
        insert into public.certificates (
            portal_user_id,
            course_id,
            certificate_number,
            verification_code,
            issued_date
        ) values (
            v_user_id,
            v_course_id,
            'CERT-' || upper(substring(replace(v_user_id::text, '-', ''), 1, 8)) || '-' || upper(substring(replace(v_course_id::text, '-', ''), 1, 4)),
            upper(substring(gen_random_uuid()::text, 1, 8)),
            current_date
        )
        returning id into v_cert_id;
        
        -- typically here we'd trigger an external worker to generate PDF/R2
        -- for this task, we assume the backend or a cron job will pick up rows with null pdf_url.
    end if;

    return new;
end;
$$ language plpgsql security definer;

-- triggers
DROP TRIGGER IF EXISTS tr_check_cert_lesson_progress ON public.lesson_progress;
create trigger tr_check_cert_lesson_progress
    after insert or update on public.lesson_progress
    for each row execute function public.handle_certificate_trigger();

DROP TRIGGER IF EXISTS tr_check_cert_cbt_sessions ON public.cbt_sessions;
create trigger tr_check_cert_cbt_sessions
    after insert or update on public.cbt_sessions
    for each row execute function public.handle_certificate_trigger();
