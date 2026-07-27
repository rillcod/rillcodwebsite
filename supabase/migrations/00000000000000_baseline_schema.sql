-- ============================================================================
-- RILLCOD ACADEMY — CONSOLIDATED BASELINE SCHEMA
--
-- Single source of truth for the `public` schema of Supabase project
-- akaorqukdoawacvxsdij. Reconstructed from the live database catalogs; it
-- replaces the 231 incremental migration files that preceded it.
--
-- Schema only — contains no data. The auth/storage/realtime schemas are
-- managed by Supabase and are intentionally not included.
--
-- Generated: 2026-07-27T13:17:19.762Z
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "public";
ALTER SCHEMA "public" OWNER TO "pg_database_owner";
COMMENT ON SCHEMA "public" IS 'standard public schema';


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ============================================================================
-- FUNCTIONS & PROCEDURES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.academic_term_id_for_ts(p_ts timestamp with time zone)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT id
  FROM public.academic_terms
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND (p_ts AT TIME ZONE 'Africa/Lagos')::date BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;
$function$;
ALTER FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.allocate_payment_to_invoice(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txn record;
  v_inv record;
  v_alloc_id uuid;
  v_alloc_amount numeric;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_existing uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, amount, currency, payment_status, invoice_id
    INTO v_txn
    FROM public.payment_transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment transaction % not found', p_transaction_id;
  END IF;

  IF lower(COALESCE(v_txn.payment_status, '')) NOT IN ('completed', 'success', 'paid') THEN
    RAISE EXCEPTION 'Payment must be completed before allocation';
  END IF;

  -- Idempotent: already allocated this txn→invoice
  SELECT id INTO v_existing
    FROM public.payment_allocations
   WHERE payment_transaction_id = p_transaction_id
     AND invoice_id = p_invoice_id
   LIMIT 1;

  IF FOUND THEN
    SELECT id, status, amount_paid, amount_remaining, original_amount
      INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
    RETURN jsonb_build_object(
      'status', 'already_allocated',
      'allocation_id', v_existing,
      'invoice_id', p_invoice_id,
      'invoice_status', v_inv.status,
      'amount_paid', v_inv.amount_paid,
      'amount_remaining', v_inv.amount_remaining
    );
  END IF;

  SELECT id, status, original_amount, amount_paid, amount_remaining, currency, amount
    INTO v_inv
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF lower(COALESCE(v_inv.status, '')) IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot allocate to a void/cancelled invoice';
  END IF;

  v_alloc_amount := LEAST(p_amount, COALESCE(v_inv.amount_remaining, v_inv.amount, 0));
  IF v_alloc_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice has no remaining balance' USING ERRCODE = 'check_violation';
  END IF;

  IF p_amount > COALESCE(v_inv.amount_remaining, 0) + 0.01 THEN
    RAISE EXCEPTION
      'Over-allocation: requested % exceeds remaining %',
      p_amount, v_inv.amount_remaining
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payment_allocations (
    payment_transaction_id, invoice_id, amount, currency, created_by
  ) VALUES (
    p_transaction_id, p_invoice_id, v_alloc_amount,
    COALESCE(v_txn.currency, v_inv.currency, 'NGN'),
    p_actor_id
  )
  RETURNING id INTO v_alloc_id;

  v_new_paid := COALESCE(v_inv.amount_paid, 0) + v_alloc_amount;
  v_new_remaining := GREATEST(0, COALESCE(v_inv.original_amount, v_inv.amount, 0) - v_new_paid);

  IF v_new_remaining <= 0.01 THEN
    v_new_status := 'paid';
    v_new_remaining := 0;
    v_new_paid := COALESCE(v_inv.original_amount, v_inv.amount, v_new_paid);
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.invoices
     SET amount_paid = v_new_paid,
         amount_remaining = v_new_remaining,
         status = v_new_status,
         payment_transaction_id = CASE
           WHEN v_new_status = 'paid' THEN p_transaction_id
           ELSE payment_transaction_id
         END,
         updated_at = now()
   WHERE id = p_invoice_id;

  -- Mark matching open instalment items (FIFO by due_date)
  UPDATE public.instalment_items ii
     SET status = 'paid',
         paid_at = now(),
         transaction_ref = p_transaction_id::text
   WHERE ii.id IN (
     SELECT i2.id
       FROM public.instalment_items i2
       JOIN public.instalment_plans ip ON ip.id = i2.plan_id
      WHERE ip.invoice_id = p_invoice_id
        AND lower(COALESCE(i2.status, '')) IN ('pending', 'due', 'overdue', 'scheduled')
      ORDER BY i2.due_date ASC NULLS LAST
      LIMIT 1
   )
   AND abs(ii.amount - v_alloc_amount) <= 0.01;

  RETURN jsonb_build_object(
    'status', 'allocated',
    'allocation_id', v_alloc_id,
    'allocated_amount', v_alloc_amount,
    'invoice_id', p_invoice_id,
    'invoice_status', v_new_status,
    'amount_paid', v_new_paid,
    'amount_remaining', v_new_remaining
  );
END;
$function$;
ALTER FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.assignment_matches_term(p_assignment_term_id uuid, p_term_id uuid)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_term_id IS NULL
      OR p_assignment_term_id IS NOT DISTINCT FROM p_term_id
      OR p_assignment_term_id IS NULL;
$function$;
ALTER FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.block_duplicate_active_student_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  incoming_key text;
  valid_exception boolean := false;
begin
  if new.role <> 'student'
     or new.school_id is null
     or coalesce(new.is_deleted, false) then
    return new;
  end if;

  incoming_key := public.student_duplicate_name_key(new.full_name);
  if incoming_key = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text || ':' || incoming_key, 0));

  if exists (
    select 1
    from public.portal_users existing
    where existing.id <> new.id
      and existing.role = 'student'
      and existing.school_id = new.school_id
      and coalesce(existing.is_deleted, false) = false
      and public.student_duplicate_name_key(existing.full_name) = incoming_key
  ) then
    select exists (
      select 1
      from public.portal_users approver
      where approver.id = new.duplicate_name_exception_approved_by
        and approver.role in ('admin', 'teacher')
        and coalesce(approver.is_deleted, false) = false
        and length(btrim(coalesce(new.duplicate_name_exception_reason, ''))) >= 10
        and new.duplicate_name_exception_key = incoming_key
        and new.duplicate_name_exception_approved_at is not null
        and (
          approver.role = 'admin'
          or approver.school_id = new.school_id
          or exists (
            select 1
            from public.teacher_schools ts
            where ts.teacher_id = approver.id
              and ts.school_id = new.school_id
          )
        )
    ) into valid_exception;

    if not valid_exception then
      raise exception using
        errcode = '23505',
        message = format('An active student named "%s" is already registered at this school.', new.full_name),
        constraint = 'portal_users_active_student_school_name_key';
    end if;
  end if;

  return new;
end;
$function$;
ALTER FUNCTION "public"."block_duplicate_active_student_name"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.canonical_grade(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  parts text[];
  seg text;
  rec record;
  first_norm text;
  norm_lvl text;
  nums int[] := '{}';
  rng text[];
  lo int;
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN RETURN NULL; END IF;

  -- Last "·" segment (a composed class name describes a class; its band is the last part).
  parts := regexp_split_to_array(input, '\s*·\s*');
  seg := upper(btrim(parts[array_upper(parts, 1)]));

  -- Collect level+number tokens in order; keep only those matching the first level seen.
  FOR rec IN
    SELECT m[1] AS lvl_raw, (m[2])::int AS n
    FROM regexp_matches(
      seg,
      '(SSS|SS|JSS|JS|BASIC|PRIMARY|PRY|ELEMENTARY|ELEM|NURSERY|NUR|CRECHE|KINDERGARTEN|KG|RECEPTION|GRADE|YEAR)\s*0*([0-9]+)',
      'g'
    ) AS m
  LOOP
    norm_lvl := CASE rec.lvl_raw
      WHEN 'JS' THEN 'JSS' WHEN 'JSS' THEN 'JSS'
      WHEN 'SSS' THEN 'SS' WHEN 'SS' THEN 'SS'
      WHEN 'BASIC' THEN 'Basic' WHEN 'PRIMARY' THEN 'Basic' WHEN 'PRY' THEN 'Basic'
      WHEN 'ELEMENTARY' THEN 'Basic' WHEN 'ELEM' THEN 'Basic'
      -- Pre-primary is "Nursery" throughout (KG/Kindergarten/Reception all map to Nursery).
      WHEN 'NURSERY' THEN 'Nursery' WHEN 'NUR' THEN 'Nursery' WHEN 'CRECHE' THEN 'Nursery'
      WHEN 'KG' THEN 'Nursery' WHEN 'KINDERGARTEN' THEN 'Nursery' WHEN 'RECEPTION' THEN 'Nursery'
      -- Grade collapses to Basic ("Grade 2" == "Basic 2"). "Year N" adopts the level of the
      -- student's class (primary school → Basic, secondary → JSS); in practice grade is derived
      -- from the class band which already carries the level, so JSS is only a bare fallback.
      WHEN 'GRADE' THEN 'Basic' WHEN 'YEAR' THEN 'JSS'
      ELSE initcap(rec.lvl_raw)
    END;
    IF first_norm IS NULL THEN first_norm := norm_lvl; END IF;
    IF norm_lvl = first_norm THEN nums := nums || rec.n; END IF;
  END LOOP;

  IF first_norm IS NULL THEN RETURN NULL; END IF;

  -- Range → the band's LOWEST grade; otherwise the lowest token of the dominant level.
  -- grade is always a specific single value (never a band label).
  rng := regexp_match(seg, '([0-9]+)\s*[-–]\s*([0-9]+)');
  IF rng IS NOT NULL THEN
    lo := least(rng[1]::int, rng[2]::int);
  ELSE
    SELECT min(x) INTO lo FROM unnest(nums) AS x;
  END IF;

  RETURN first_norm || ' ' || lo;
END;
$function$;
ALTER FUNCTION "public"."canonical_grade"(input text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.cascade_portal_user_to_student()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'student' THEN
    UPDATE public.students
       SET full_name     = COALESCE(NEW.full_name, full_name),
           name          = COALESCE(NEW.full_name, name),
           email         = COALESCE(NEW.email, email),
           student_email = COALESCE(NEW.email, student_email),
           school_id     = COALESCE(NEW.school_id, school_id),
           school_name   = COALESCE(NEW.school_name, school_name),
           section       = COALESCE(NEW.section_class, section),
           current_class = COALESCE(NEW.section_class, current_class),
           gender        = COALESCE(NEW.gender, gender),
           is_active     = COALESCE(NEW.is_active, is_active),
           is_deleted    = COALESCE(NEW.is_deleted, is_deleted),
           status        = CASE WHEN NEW.is_deleted = true THEN 'inactive' ELSE status END,
           updated_at    = now()
     WHERE user_id = NEW.id;

    -- Also update student_name snapshot on student_progress_reports if name changed
    IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.full_name IS NOT NULL THEN
      UPDATE public.student_progress_reports
         SET student_name = NEW.full_name, updated_at = now()
       WHERE student_id = NEW.id
         AND student_name IS DISTINCT FROM NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."cascade_portal_user_to_student"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.cascade_school_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.portal_users SET school_name = NEW.name
      WHERE school_id = NEW.id AND school_name IS DISTINCT FROM NEW.name;
    UPDATE public.students SET school_name = NEW.name
      WHERE school_id = NEW.id AND school_name IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."cascade_school_rename"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.cascade_student_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'student'
     AND NEW.full_name IS DISTINCT FROM OLD.full_name
     AND NEW.full_name IS NOT NULL THEN
    UPDATE public.students
       SET full_name = NEW.full_name, name = NEW.full_name, updated_at = now()
     WHERE user_id = NEW.id
       AND (full_name IS DISTINCT FROM NEW.full_name OR name IS DISTINCT FROM NEW.full_name);

    UPDATE public.student_progress_reports
       SET student_name = NEW.full_name, updated_at = now()
     WHERE student_id = NEW.id
       AND student_name IS DISTINCT FROM NEW.full_name;

    -- Archive row is keyed by the login email.
    IF NEW.email IS NOT NULL THEN
      UPDATE public.registration_results
         SET full_name = NEW.full_name
       WHERE lower(email) = lower(NEW.email)
         AND full_name IS DISTINCT FROM NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."cascade_student_name"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.cbt_session_matches_term(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_meta_term text;
  v_start date;
  v_end date;
BEGIN
  IF p_term_id IS NULL THEN
    RETURN true;
  END IF;

  IF p_exam_term_id IS NOT NULL THEN
    RETURN p_exam_term_id = p_term_id;
  END IF;

  v_meta_term := NULLIF(btrim(COALESCE(
    p_metadata ->> 'term_id',
    p_metadata ->> 'academic_term_id',
    ''
  )), '');
  IF v_meta_term IS NOT NULL THEN
    RETURN v_meta_term = p_term_id::text;
  END IF;

  SELECT start_date, end_date INTO v_start, v_end
  FROM public.academic_terms
  WHERE id = p_term_id;

  IF v_start IS NULL AND v_end IS NULL THEN
    RETURN true;
  END IF;

  IF p_end_time IS NULL THEN
    RETURN true;
  END IF;

  IF v_start IS NOT NULL AND p_end_time::date < v_start THEN
    RETURN false;
  END IF;
  IF v_end IS NOT NULL AND p_end_time::date > v_end THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;
ALTER FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.check_course_completion(p_user_id uuid, p_course_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_lessons     int;
  v_completed_lessons int;
  v_project_count     int;
  v_completed_projects int;
  v_exam_count        int;
  v_has_passed_exam   boolean;
BEGIN
  -- 1. Lessons: Count total published lessons in course
  -- Use direct table access to avoid FK chain to course_curricula
  SELECT count(*) INTO v_total_lessons
  FROM public.lessons
  WHERE course_id = p_course_id AND status = 'published';

  IF v_total_lessons = 0 THEN
    RETURN false;
  END IF;

  -- Count lessons the student has completed
  -- Use subquery instead of JOIN to avoid course_curricula RLS violations
  SELECT count(lp.id) INTO v_completed_lessons
  FROM public.lesson_progress lp
  WHERE lp.portal_user_id = p_user_id
    AND lp.lesson_id IN (
      SELECT id FROM public.lessons 
      WHERE course_id = p_course_id AND status = 'published'
    )
    AND lp.status = 'completed';

  IF v_completed_lessons < v_total_lessons THEN
    RETURN false;
  END IF;

  -- 2. Projects: Count mandatory projects for this course
  SELECT count(*) INTO v_project_count
  FROM public.assignments
  WHERE course_id = p_course_id AND assignment_type = 'project' AND is_active = true;

  IF v_project_count > 0 THEN
    -- Check if all projects are submitted (status 'submitted' or 'graded')
    -- Use subquery to avoid potential RLS issues
    SELECT count(s.id) INTO v_completed_projects
    FROM public.assignment_submissions s
    WHERE s.portal_user_id = p_user_id
      AND s.assignment_id IN (
        SELECT id FROM public.assignments 
        WHERE course_id = p_course_id AND assignment_type = 'project' AND is_active = true
      )
      AND s.status IN ('submitted', 'graded');
    
    IF v_completed_projects < v_project_count THEN
      RETURN false;
    END IF;
  END IF;

  -- 3. Exams: Check whether this course has any active CBT exams
  SELECT count(*) INTO v_exam_count
  FROM public.cbt_exams
  WHERE course_id = p_course_id AND is_active = true;

  -- No exam configured → lesson & project completion is sufficient
  IF v_exam_count = 0 THEN
    RETURN true;
  END IF;

  -- Exam exists → student must have a passing score
  -- Use subquery to avoid potential RLS issues
  SELECT EXISTS (
    SELECT 1
    FROM public.cbt_sessions s
    WHERE s.user_id = p_user_id
      AND s.exam_id IN (
        SELECT id FROM public.cbt_exams 
        WHERE course_id = p_course_id AND is_active = true
      )
      AND s.score >= (
        SELECT passing_score FROM public.cbt_exams 
        WHERE id = s.exam_id
      )
      AND s.status IN ('completed', 'passed')
  ) INTO v_has_passed_exam;

  RETURN v_has_passed_exam;
END;
$function$;
ALTER FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.check_instalment_plan_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_pending_count int;
begin
  -- count how many items in this plan are not yet paid
  select count(*)
    into v_pending_count
    from public.instalment_items
   where plan_id = NEW.plan_id
     and status != 'paid';

  -- if all items are paid, mark the plan as completed
  if v_pending_count = 0 then
    update public.instalment_plans
       set status = 'completed',
           updated_at = now()
     where id = NEW.plan_id
       and status = 'active';  -- only update if currently active
  end if;

  return NEW;
end;
$function$;
ALTER FUNCTION "public"."check_instalment_plan_completion"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.check_timetable_conflicts(p_slot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_timetable_id  uuid;
  v_day_of_week   text;
  v_start_time    text;
  v_end_time      text;
  v_teacher_id    uuid;
  v_room          text;
  v_exclude_id    uuid;

  v_conflict      record;
begin
  -- ----------------------------------------------------------------
  -- 1. extract fields from input
  -- ----------------------------------------------------------------
  v_timetable_id := (p_slot->>'timetable_id')::uuid;
  v_day_of_week  :=  p_slot->>'day_of_week';
  v_start_time   :=  p_slot->>'start_time';
  v_end_time     :=  p_slot->>'end_time';
  v_teacher_id   := (p_slot->>'teacher_id')::uuid;   -- null when absent
  v_room         :=  p_slot->>'room';                 -- null when absent
  v_exclude_id   := (p_slot->>'exclude_id')::uuid;   -- null when absent

  -- ----------------------------------------------------------------
  -- 2. teacher conflict check
  --    only run when teacher_id is provided
  -- ----------------------------------------------------------------
  if v_teacher_id is not null then
    select
      ts.id,
      ts.day_of_week,
      ts.start_time,
      ts.end_time,
      ts.subject,
      ts.teacher_name
    into v_conflict
    from public.timetable_slots ts
    where ts.timetable_id = v_timetable_id
      and ts.day_of_week  = v_day_of_week
      and ts.teacher_id   = v_teacher_id
      -- open-interval overlap
      and ts.start_time   < v_end_time
      and ts.end_time     > v_start_time
      -- exclude the slot being edited (if supplied)
      and (v_exclude_id is null or ts.id != v_exclude_id)
    limit 1;

    if found then
      return jsonb_build_object(
        'conflict',        'TEACHER_CONFLICT',
        'conflictingSlot', jsonb_build_object(
          'id',          v_conflict.id,
          'day_of_week', v_conflict.day_of_week,
          'start_time',  v_conflict.start_time,
          'end_time',    v_conflict.end_time,
          'subject',     v_conflict.subject,
          'teacher_name',v_conflict.teacher_name
        )
      );
    end if;
  end if;

  -- ----------------------------------------------------------------
  -- 3. room conflict check
  --    only run when room is provided and non-empty
  -- ----------------------------------------------------------------
  if v_room is not null and v_room <> '' then
    select
      ts.id,
      ts.day_of_week,
      ts.start_time,
      ts.end_time,
      ts.subject,
      ts.room
    into v_conflict
    from public.timetable_slots ts
    where ts.timetable_id = v_timetable_id
      and ts.day_of_week  = v_day_of_week
      and ts.room         = v_room
      -- open-interval overlap
      and ts.start_time   < v_end_time
      and ts.end_time     > v_start_time
      -- exclude the slot being edited (if supplied)
      and (v_exclude_id is null or ts.id != v_exclude_id)
    limit 1;

    if found then
      return jsonb_build_object(
        'conflict',        'ROOM_CONFLICT',
        'conflictingSlot', jsonb_build_object(
          'id',          v_conflict.id,
          'day_of_week', v_conflict.day_of_week,
          'start_time',  v_conflict.start_time,
          'end_time',    v_conflict.end_time,
          'subject',     v_conflict.subject,
          'room',        v_conflict.room
        )
      );
    end if;
  end if;

  -- ----------------------------------------------------------------
  -- 4. no conflict found
  -- ----------------------------------------------------------------
  return jsonb_build_object('conflict', null);
end;
$function$;
ALTER FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.class_qa_path_offset(p_school_id uuid, p_class_id uuid)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (abs(hashtext(coalesce(p_school_id::text, '') || p_class_id::text)) % 108)::int;
$function$;
ALTER FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.consume_communication_rate_limit(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone)
 RETURNS TABLE(daily_count integer, last_message_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.communication_rate_limits (
    sender_id, sender_role, day_bucket, daily_count, last_message_at, updated_at
  ) values (
    p_sender_id, p_sender_role, p_day_bucket, 1, now(), now()
  )
  on conflict (sender_id, day_bucket) do update
    set daily_count = public.communication_rate_limits.daily_count + 1,
        last_message_at = now(),
        updated_at = now(),
        sender_role = excluded.sender_role
  returning communication_rate_limits.daily_count, communication_rate_limits.last_message_at;
$function$;
ALTER FUNCTION "public"."consume_communication_rate_limit"(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_billing_cycle_with_invoice(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text DEFAULT 'NGN'::text, p_status text DEFAULT 'due'::text, p_items jsonb DEFAULT '[]'::jsonb, p_subscription_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_stream text;
  v_school_id uuid;
BEGIN
  IF p_owner_type NOT IN ('school', 'individual') THEN
    RAISE EXCEPTION 'owner_type must be school or individual';
  END IF;
  IF p_amount_due IS NULL OR p_amount_due <= 0 THEN
    RAISE EXCEPTION 'amount_due must be positive';
  END IF;
  IF p_status NOT IN ('due', 'past_due') THEN
    RAISE EXCEPTION 'New billing cycles must start as due or past_due';
  END IF;

  v_school_id := CASE WHEN p_owner_type = 'school' THEN p_owner_school_id ELSE NULL END;
  v_stream := CASE WHEN p_owner_type = 'school' THEN 'school' ELSE 'individual' END;
  v_invoice_number := 'BCY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.billing_cycles (
    owner_type, owner_school_id, owner_user_id, school_id,
    term_label, term_start_date, due_date, amount_due, currency, status,
    items, subscription_id, created_at, updated_at
  ) VALUES (
    p_owner_type, p_owner_school_id, p_owner_user_id, v_school_id,
    p_term_label, p_term_start_date, p_due_date, p_amount_due,
    upper(COALESCE(p_currency, 'NGN')), p_status,
    COALESCE(p_items, '[]'::jsonb), p_subscription_id, now(), now()
  )
  RETURNING id INTO v_cycle_id;

  INSERT INTO public.invoices (
    invoice_number, school_id, portal_user_id, amount, original_amount,
    amount_paid, amount_remaining, currency, due_date, status, stream,
    billing_cycle_id, notes, items, created_at, updated_at
  ) VALUES (
    v_invoice_number,
    v_school_id,
    CASE WHEN p_owner_type = 'individual' THEN p_owner_user_id ELSE NULL END,
    p_amount_due, p_amount_due, 0, p_amount_due,
    upper(COALESCE(p_currency, 'NGN')),
    p_due_date, 'sent', v_stream, v_cycle_id,
    'Auto-generated from billing cycle: ' || p_term_label,
    COALESCE(p_items, '[]'::jsonb), now(), now()
  )
  RETURNING id INTO v_invoice_id;

  UPDATE public.billing_cycles
     SET invoice_id = v_invoice_id, updated_at = now()
   WHERE id = v_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'created_by', p_actor_id
  );
END;
$function$;
ALTER FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cycle record; v_invoice_id uuid;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;
 IF p_billing_cycle_id IS NOT NULL THEN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id=p_billing_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing cycle not found'; END IF;
  IF v_cycle.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Billing cycle already has an invoice'; END IF;
 END IF;
 INSERT INTO public.invoices(invoice_number,school_id,portal_user_id,amount,original_amount,amount_paid,amount_remaining,currency,status,due_date,items,notes,stream,billing_cycle_id,metadata,created_at,updated_at)
 VALUES(p_invoice_number,p_school_id,p_portal_user_id,p_amount,p_amount,0,p_amount,upper(p_currency),p_status,p_due_date,COALESCE(p_items,'[]'::jsonb),p_notes,p_stream,p_billing_cycle_id,COALESCE(p_metadata,'{}'::jsonb),now(),now()) RETURNING id INTO v_invoice_id;
 IF p_billing_cycle_id IS NOT NULL THEN UPDATE public.billing_cycles SET invoice_id=v_invoice_id,updated_at=now() WHERE id=p_billing_cycle_id; END IF;
 RETURN jsonb_build_object('invoice_id',v_invoice_id);
END $function$;
ALTER FUNCTION "public"."create_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_parent_and_link(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text DEFAULT 'Guardian'::text, p_auth_user_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_parent_id   UUID;
  v_student     RECORD;
BEGIN
  -- Only admin/teacher may call this
  SELECT role INTO v_caller_role
  FROM public.portal_users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Only admin or teacher can create parent accounts';
  END IF;

  -- Get student info
  SELECT * INTO v_student FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Upsert parent in portal_users (avoid duplicate emails)
  INSERT INTO public.portal_users (id, email, full_name, role, phone, is_active, created_at, updated_at)
  VALUES (
    COALESCE(p_auth_user_id, gen_random_uuid()),
    p_email,
    p_full_name,
    'parent',
    p_phone,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    phone      = EXCLUDED.phone,
    updated_at = NOW()
  RETURNING id INTO v_parent_id;

  -- Link parent to student
  UPDATE public.students SET
    parent_email        = p_email,
    parent_name         = p_full_name,
    parent_phone        = p_phone,
    parent_relationship = p_relationship,
    updated_at          = NOW()
  WHERE id = p_student_id;

  RETURN json_build_object(
    'parent_id',  v_parent_id,
    'student_id', p_student_id,
    'email',      p_email
  );
END;
$function$;
ALTER FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_school_term_invoice_atomic(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_term public.academic_terms%ROWTYPE;
  v_cycle public.billing_cycles%ROWTYPE;
  v_existing public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_cycle_id uuid;
  v_cycle_status text;
BEGIN
  IF p_school_id IS NULL OR p_academic_term_id IS NULL THEN
    RAISE EXCEPTION 'school_id and academic_term_id are required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;
  IF p_due_date IS NULL THEN RAISE EXCEPTION 'A due date is required for automated school billing'; END IF;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = p_academic_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic term not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':' || p_academic_term_id::text, 0));

  SELECT * INTO v_existing FROM public.invoices
  WHERE school_id = p_school_id AND stream = 'school'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'void')
    AND metadata->>'academic_term_id' = p_academic_term_id::text
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'An active school invoice already exists for this academic term (%)', v_existing.invoice_number
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_cycle FROM public.billing_cycles
  WHERE owner_type = 'school' AND owner_school_id = p_school_id
    AND academic_term_id = p_academic_term_id AND archived_at IS NULL AND status <> 'cancelled'
  LIMIT 1 FOR UPDATE;

  v_cycle_status := CASE WHEN p_due_date::date < current_date THEN 'past_due' ELSE 'due' END;
  IF FOUND THEN
    IF v_cycle.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Billing cycle already has an invoice' USING ERRCODE = '23505';
    END IF;
    v_cycle_id := v_cycle.id;
    UPDATE public.billing_cycles SET due_date=p_due_date::date, amount_due=p_amount,
      currency=upper(COALESCE(p_currency,'NGN')), status=v_cycle_status,
      items=COALESCE(p_items,'[]'::jsonb), updated_at=now() WHERE id=v_cycle_id;
  ELSE
    INSERT INTO public.billing_cycles (
      owner_type,owner_school_id,school_id,academic_term_id,term_label,
      term_start_date,due_date,amount_due,currency,status,items,created_at,updated_at
    ) VALUES (
      'school',p_school_id,p_school_id,p_academic_term_id,
      v_term.term_label || ' ' || v_term.academic_year,v_term.start_date,p_due_date::date,
      p_amount,upper(COALESCE(p_currency,'NGN')),v_cycle_status,
      COALESCE(p_items,'[]'::jsonb),now(),now()
    ) RETURNING id INTO v_cycle_id;
  END IF;

  INSERT INTO public.invoices (
    invoice_number,school_id,amount,original_amount,amount_paid,amount_remaining,
    currency,status,due_date,items,notes,stream,billing_cycle_id,metadata,created_at,updated_at
  ) VALUES (
    p_invoice_number,p_school_id,p_amount,p_amount,0,p_amount,
    upper(COALESCE(p_currency,'NGN')),p_status,p_due_date,COALESCE(p_items,'[]'::jsonb),
    p_notes,'school',v_cycle_id,COALESCE(p_metadata,'{}'::jsonb) ||
    jsonb_build_object('academic_term_id',p_academic_term_id,'billing_cycle_id',v_cycle_id,'billing_automation',true),
    now(),now()
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.billing_cycles SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_cycle_id;
  RETURN jsonb_build_object('invoice_id',v_invoice_id,'cycle_id',v_cycle_id,
    'academic_term_id',p_academic_term_id,'automation_started',true,'actor_id',p_actor_id);
END $function$;
ALTER FUNCTION "public"."create_school_term_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.current_academic_term()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.live_academic_term_id(CURRENT_DATE);
$function$;
ALTER FUNCTION "public"."current_academic_term"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.current_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT email FROM public.portal_users WHERE id = auth.uid();
$function$;
ALTER FUNCTION "public"."current_user_email"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.portal_users WHERE id = auth.uid();
$function$;
ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.enforce_canonical_consent_response_data()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.response_data ? 'child_matches' OR NEW.response_data ? '_ip' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'response_data.child_matches and response_data._ip are retired; use canonical relational stores';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.response_data ? 'submission_snapshot'
     AND NEW.response_data->'submission_snapshot'
         IS DISTINCT FROM OLD.response_data->'submission_snapshot' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'response_data.submission_snapshot is immutable';
  END IF;

  RETURN NEW;
END
$function$;
ALTER FUNCTION "public"."enforce_canonical_consent_response_data"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.ensure_class_term_teaching_plan(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_class public.classes%ROWTYPE;
  v_term public.academic_terms%ROWTYPE;
  v_curr public.course_curricula%ROWTYPE;
  v_plan public.lesson_plans%ROWTYPE;
  v_plan_data jsonb := '{}'::jsonb;
  v_created boolean := false;
BEGIN
  IF p_class_id IS NULL OR p_course_id IS NULL OR p_academic_term_id IS NULL THEN
    RAISE EXCEPTION 'class_id, course_id and academic_term_id are required';
  END IF;
  SELECT * INTO v_class FROM public.classes WHERE id=p_class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF v_class.term_id IS DISTINCT FROM p_academic_term_id THEN RAISE EXCEPTION 'Academic term does not match class term'; END IF;
  SELECT * INTO v_term FROM public.academic_terms WHERE id=p_academic_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic term not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND (v_class.program_id IS NULL OR c.program_id=v_class.program_id)) THEN
    RAISE EXCEPTION 'Course does not belong to the class programme';
  END IF;
  IF p_curriculum_version_id IS NOT NULL THEN
    SELECT * INTO v_curr FROM public.course_curricula WHERE id=p_curriculum_version_id;
    IF NOT FOUND OR v_curr.course_id IS DISTINCT FROM p_course_id THEN RAISE EXCEPTION 'Curriculum does not belong to the selected course'; END IF;
    IF v_curr.school_id IS NOT NULL AND v_curr.school_id IS DISTINCT FROM v_class.school_id THEN RAISE EXCEPTION 'Curriculum belongs to a different school'; END IF;
    v_plan_data := jsonb_build_object('curriculum_year',1);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_id::text||':'||p_academic_term_id::text||':'||p_course_id::text,0));
  SELECT * INTO v_plan FROM public.lesson_plans
  WHERE class_id=p_class_id AND term_id=p_academic_term_id AND course_id=p_course_id AND status<>'archived'
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF p_curriculum_version_id IS NOT NULL AND v_plan.curriculum_version_id IS DISTINCT FROM p_curriculum_version_id THEN
      UPDATE public.lesson_plans SET curriculum_version_id=p_curriculum_version_id,version=version+1,updated_at=now()
      WHERE id=v_plan.id RETURNING * INTO v_plan;
    END IF;
  ELSE
    INSERT INTO public.lesson_plans(
      class_id,school_id,course_id,term_id,term,term_start,term_end,sessions_per_week,
      curriculum_version_id,plan_data,status,version,created_by,created_at,updated_at
    ) VALUES (
      p_class_id,v_class.school_id,p_course_id,p_academic_term_id,
      v_term.term_label||' '||v_term.academic_year,v_term.start_date,v_term.end_date,
      greatest(COALESCE(p_sessions_per_week,1),1),p_curriculum_version_id,v_plan_data,'draft',1,p_actor_id,now(),now()
    ) RETURNING * INTO v_plan;
    v_created := true;
  END IF;

  RETURN jsonb_build_object('plan_id',v_plan.id,'created',v_created,'curriculum_version_id',v_plan.curriculum_version_id);
END $function$;
ALTER FUNCTION "public"."ensure_class_term_teaching_plan"(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.ensure_settled_invoice_atomic(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tx record; v_invoice_id uuid;
BEGIN
 SELECT * INTO v_tx FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
 IF lower(COALESCE(v_tx.payment_status,'')) NOT IN ('completed','success','paid') THEN RAISE EXCEPTION 'Only a completed payment can produce a settled invoice'; END IF;
 IF v_tx.invoice_id IS NOT NULL THEN RETURN jsonb_build_object('invoice_id',v_tx.invoice_id,'reused',true); END IF;
 IF abs(COALESCE(v_tx.amount,0)-p_amount)>0.01 OR upper(COALESCE(v_tx.currency,'NGN'))<>upper(p_currency) THEN RAISE EXCEPTION 'Invoice amount or currency does not match payment'; END IF;
 INSERT INTO public.invoices(invoice_number,school_id,portal_user_id,amount,original_amount,amount_paid,amount_remaining,currency,status,due_date,payment_transaction_id,items,metadata,stream,created_at,updated_at)
 VALUES(p_invoice_number,p_school_id,p_portal_user_id,p_amount,p_amount,p_amount,0,upper(p_currency),'paid',NULL,v_tx.id,COALESCE(p_items,'[]'::jsonb),COALESCE(p_metadata,'{}'::jsonb),p_stream,now(),now()) RETURNING id INTO v_invoice_id;
 UPDATE public.payment_transactions SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_tx.id;
 RETURN jsonb_build_object('invoice_id',v_invoice_id,'reused',false);
END $function$;
ALTER FUNCTION "public"."ensure_settled_invoice_atomic"(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.ensure_student_shadow_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'student' AND COALESCE(NEW.is_deleted, false) = false
     AND NOT EXISTS (SELECT 1 FROM public.students WHERE user_id = NEW.id) THEN
    INSERT INTO public.students (
      user_id, full_name, name, email, student_email,
      school_id, school_name, grade, grade_level, current_class,
      gender, enrollment_type, status, is_active, is_deleted, created_at, updated_at
    ) VALUES (
      NEW.id, COALESCE(NEW.full_name, 'Student'), COALESCE(NEW.full_name, 'Student'), NEW.email, NEW.email,
      NEW.school_id, NEW.school_name, NEW.section_class, NEW.section_class, NEW.section_class,
      NEW.gender, COALESCE(NEW.enrollment_type, 'in_person'), 'approved', COALESCE(NEW.is_active, true), false, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."ensure_student_shadow_row"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.finalize_full_refund_atomic(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb DEFAULT '{}'::jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tx record; v_inv record; v_course record; v_paid numeric; v_remaining numeric; v_invoice_status text; v_cycle_status text; v_cycle_id uuid;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A refund reason is required'; END IF;
  SELECT * INTO v_tx FROM public.payment_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
  IF lower(COALESCE(v_tx.payment_status,''))='refunded' THEN
    RETURN jsonb_build_object('already_refunded',true,'transaction_id',v_tx.id,'invoice_id',v_tx.invoice_id);
  END IF;
  IF lower(COALESCE(v_tx.payment_status,'')) NOT IN ('completed','success','paid') THEN RAISE EXCEPTION 'Only a completed payment can be refunded'; END IF;

  UPDATE public.payment_transactions SET payment_status='refunded', refunded_at=now(), refund_reason=trim(p_reason), updated_at=now(),
    payment_gateway_response=COALESCE(payment_gateway_response,'{}'::jsonb)||jsonb_build_object('refund',COALESCE(p_gateway_refund,'{}'::jsonb)||jsonb_build_object('reason',trim(p_reason),'actor_id',p_actor_id,'finalized_at',now()))
  WHERE id=v_tx.id;

  IF v_tx.invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices WHERE id=v_tx.invoice_id FOR UPDATE;
    IF FOUND THEN
      v_paid:=GREATEST(0,COALESCE(v_inv.amount_paid,0)-COALESCE(v_tx.amount,0));
      v_remaining:=GREATEST(0,COALESCE(v_inv.original_amount,v_inv.amount,0)-v_paid);
      v_invoice_status:=CASE WHEN v_paid>0 THEN 'partially_paid' WHEN v_inv.due_date IS NOT NULL AND v_inv.due_date<now() THEN 'overdue' ELSE 'sent' END;
      UPDATE public.invoices SET amount_paid=v_paid,amount_remaining=v_remaining,status=v_invoice_status,updated_at=now() WHERE id=v_inv.id;
      DELETE FROM public.payment_allocations WHERE payment_transaction_id=v_tx.id AND invoice_id=v_inv.id;
      IF v_inv.billing_cycle_id IS NOT NULL THEN
        v_cycle_id:=v_inv.billing_cycle_id;
        v_cycle_status:=CASE WHEN v_inv.due_date IS NOT NULL AND v_inv.due_date<now() THEN 'past_due' ELSE 'due' END;
        UPDATE public.billing_cycles SET status=v_cycle_status,updated_at=now() WHERE id=v_inv.billing_cycle_id AND status='paid';
      END IF;
    END IF;
  END IF;

  IF v_tx.course_id IS NOT NULL AND v_tx.portal_user_id IS NOT NULL THEN
    SELECT program_id INTO v_course FROM public.courses WHERE id=v_tx.course_id;
    IF FOUND AND v_course.program_id IS NOT NULL THEN UPDATE public.enrollments SET status='suspended' WHERE user_id=v_tx.portal_user_id AND program_id=v_course.program_id; END IF;
  END IF;
  RETURN jsonb_build_object('transaction_id',v_tx.id,'invoice_id',v_tx.invoice_id,'invoice_status',v_invoice_status,'billing_cycle_id',v_cycle_id,'billing_cycle_status',v_cycle_status,'already_refunded',false);
END $function$;
ALTER FUNCTION "public"."finalize_full_refund_atomic"(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.find_school_student_name_conflicts(p_school_id uuid, p_school_name text, p_name_keys text[])
 RETURNS TABLE(id uuid, full_name text, email text, name_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (public.student_duplicate_name_key(pu.full_name))
    pu.id,
    pu.full_name,
    pu.email,
    public.student_duplicate_name_key(pu.full_name) as name_key
  from public.portal_users pu
  where pu.role = 'student'
    and coalesce(pu.is_deleted, false) = false
    and p_name_keys is not null
    and cardinality(p_name_keys) > 0
    and public.student_duplicate_name_key(pu.full_name) = any (p_name_keys)
    and (
      (p_school_id is not null and pu.school_id = p_school_id)
      or (
        p_school_name is not null
        and length(btrim(p_school_name)) > 0
        and pu.school_name ilike btrim(p_school_name)
      )
    )
  order by public.student_duplicate_name_key(pu.full_name), pu.created_at nulls last, pu.id;
$function$;
ALTER FUNCTION "public"."find_school_student_name_conflicts"(p_school_id uuid, p_school_name text, p_name_keys text[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.fix_portal_user_enrollment_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_school_name text;
BEGIN
  IF NEW.role = 'student'
     AND (NEW.enrollment_type IS NULL OR NEW.enrollment_type = 'in_person')
     AND NEW.school_id IS NOT NULL THEN
    SELECT name INTO v_school_name FROM public.schools WHERE id = NEW.school_id;
    IF v_school_name IS NOT NULL THEN
      NEW.enrollment_type := CASE WHEN v_school_name ILIKE '%online%' THEN 'online' ELSE 'school' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."fix_portal_user_enrollment_type"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.fix_student_enrollment_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_school_name text;
BEGIN
  IF (NEW.enrollment_type IS NULL OR NEW.enrollment_type = 'in_person') AND NEW.school_id IS NOT NULL THEN
    SELECT name INTO v_school_name FROM public.schools WHERE id = NEW.school_id;
    IF v_school_name IS NOT NULL THEN
      NEW.enrollment_type := CASE WHEN v_school_name ILIKE '%online%' THEN 'online' ELSE 'school' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."fix_student_enrollment_type"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  year_prefix text;
  seq_val     int;
  v_stream    text;
begin
  v_stream := coalesce(new.stream, 'individual');

  if v_stream = 'school' then
    year_prefix := 'INV-SCH-' || to_char(now(), 'YYYY') || '-';
  else
    year_prefix := 'INV-' || to_char(now(), 'YYYY') || '-';
  end if;

  select count(*) + 1
    into seq_val
    from public.invoices
   where invoice_number like year_prefix || '%';

  new.invoice_number := year_prefix || lpad(seq_val::text, 5, '0');
  return new;
end;
$function$;
ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  year_prefix text;
  seq_val     int;
  v_stream    text;
begin
  v_stream := coalesce(new.stream, 'individual');

  if v_stream = 'school' then
    year_prefix := 'REC-SCH-' || to_char(now(), 'YYYY') || '-';
  else
    year_prefix := 'REC-' || to_char(now(), 'YYYY') || '-';
  end if;

  select count(*) + 1
    into seq_val
    from public.receipts
   where receipt_number like year_prefix || '%';

  new.receipt_number := year_prefix || lpad(seq_val::text, 6, '0');
  return new;
end;
$function$;
ALTER FUNCTION "public"."generate_receipt_number"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_admin_session_graded_counts(term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
  v_asn bigint;
  v_cbt bigint;
BEGIN
  SELECT COUNT(*) INTO v_asn
  FROM assignment_submissions s
  JOIN assignments a ON a.id = s.assignment_id
  WHERE s.grade IS NOT NULL
    AND public.assignment_matches_term(a.term_id, v_term);

  SELECT COUNT(*) INTO v_cbt
  FROM cbt_sessions cs
  JOIN cbt_exams e ON e.id = cs.exam_id
  WHERE cs.score IS NOT NULL
    AND public.cbt_session_matches_term(cs.end_time, e.metadata, v_term, e.term_id);

  RETURN json_build_object(
    'term_id', v_term,
    'graded_assignments', v_asn,
    'graded_cbt', v_cbt,
    'total_graded', v_asn + v_cbt
  );
END;
$function$;
ALTER FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_at_risk_students(p_school_id uuid, p_class_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(portal_user_id uuid, full_name text, triggered_signals jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH live_term AS (
    SELECT public.live_academic_term_id() AS term_id
  ),
  students AS (
    SELECT
      pu.id,
      pu.full_name,
      pu.last_login,
      pu.class_id
    FROM public.portal_users pu
    WHERE pu.role = 'student'
      AND pu.school_id = p_school_id
      AND (p_class_id IS NULL OR pu.class_id = p_class_id)
      AND pu.is_deleted = false
  ),
  no_login_signals AS (
    SELECT s.id AS student_id, 'no_login'::text AS signal
    FROM students s
    WHERE s.last_login IS NULL
       OR s.last_login < now() - interval '7 days'
  ),
  attendance_stats AS (
    SELECT
      s.id AS student_id,
      count(*) AS total_records,
      count(*) FILTER (WHERE a.status = 'absent') AS absent_count
    FROM students s
    INNER JOIN public.attendance a
      ON (a.user_id = s.id OR a.student_id = s.id)
    CROSS JOIN live_term lt
    WHERE a.created_at >= now() - interval '30 days'
      AND (
        lt.term_id IS NULL
        OR a.term_id = lt.term_id
        OR a.term_id IS NULL
      )
    GROUP BY s.id
  ),
  low_attendance_signals AS (
    SELECT ast.student_id, 'low_attendance'::text AS signal
    FROM attendance_stats ast
    WHERE ast.total_records > 0
      AND (ast.absent_count::float / ast.total_records) > 0.30
  ),
  overdue_assignments AS (
    SELECT s.id AS student_id, asgn.id AS assignment_id
    FROM students s
    INNER JOIN public.assignments asgn ON asgn.class_id = s.class_id
    CROSS JOIN live_term lt
    WHERE asgn.due_date < now()
      AND asgn.is_active = true
      AND public.assignment_matches_term(asgn.term_id, lt.term_id)
  ),
  submitted_assignments AS (
    SELECT DISTINCT oa.student_id, oa.assignment_id
    FROM overdue_assignments oa
    INNER JOIN public.assignment_submissions asub
      ON asub.assignment_id = oa.assignment_id
     AND (asub.portal_user_id = oa.student_id OR asub.user_id = oa.student_id)
  ),
  overdue_counts AS (
    SELECT oa.student_id, count(*) AS overdue_count
    FROM overdue_assignments oa
    LEFT JOIN submitted_assignments sa
      ON sa.student_id = oa.student_id
     AND sa.assignment_id = oa.assignment_id
    WHERE sa.assignment_id IS NULL
    GROUP BY oa.student_id
  ),
  overdue_signals AS (
    SELECT oc.student_id, 'overdue_assignments'::text AS signal
    FROM overdue_counts oc
    WHERE oc.overdue_count >= 2
  ),
  all_signals AS (
    SELECT student_id, signal FROM no_login_signals
    UNION ALL
    SELECT student_id, signal FROM low_attendance_signals
    UNION ALL
    SELECT student_id, signal FROM overdue_signals
  ),
  aggregated_signals AS (
    SELECT als.student_id, jsonb_agg(als.signal ORDER BY als.signal) AS signals
    FROM all_signals als
    GROUP BY als.student_id
  )
  SELECT
    s.id AS portal_user_id,
    s.full_name,
    coalesce(ags.signals, '[]'::jsonb) AS triggered_signals
  FROM students s
  INNER JOIN aggregated_signals ags ON ags.student_id = s.id
  ORDER BY s.full_name;
$function$;
ALTER FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_course_avg_assignment_grade(p_course_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN (
        SELECT AVG(grade)
        FROM assignment_submissions
        WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$function$;
ALTER FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_course_avg_exam_score(p_course_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN (
        SELECT AVG(percentage)
        FROM exam_attempts
        WHERE exam_id IN (SELECT id FROM exams WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$function$;
ALTER FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_dashboard_activity(user_role text, user_uuid uuid, activity_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, title text, description text, time_ago text, icon_type text, color_class text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_term uuid := public.live_academic_term_id();
BEGIN
  IF user_role = 'admin' THEN
    RETURN QUERY
    SELECT
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' AS title,
      COALESCE(a.title, '—') AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      'submission'::text AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'teacher' THEN
    RETURN QUERY
    SELECT
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' AS title,
      COALESCE(a.title, '—') AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      'submission'::text AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE a.created_by = user_uuid
      AND public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'student' THEN
    RETURN QUERY
    SELECT
      s.id,
      CASE WHEN s.status = 'graded' THEN 'Grade received' ELSE 'Assignment submitted' END AS title,
      COALESCE(a.title, '—') ||
        CASE WHEN s.grade IS NOT NULL
          THEN ' · ' || s.grade::text || '/' || COALESCE(a.max_points, 100)::text
          ELSE ''
        END AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      CASE WHEN s.status = 'graded' THEN 'trophy' ELSE 'submission' END AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE s.portal_user_id = user_uuid
      AND public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;
  END IF;
END;
$function$;
ALTER FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_due_flashcards(p_student_id uuid, p_deck_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(card_id uuid, deck_id uuid, front text, back text, front_image_url text, back_image_url text, template text, difficulty_level text, next_review_at timestamp with time zone, ease_factor numeric, repetitions integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    fc.id,
    fc.deck_id,
    fc.front,
    fc.back,
    fc.front_image_url,
    fc.back_image_url,
    fc.template,
    fc.difficulty_level,
    COALESCE(fr.next_review_at, now()) as next_review_at,
    COALESCE(fr.ease_factor, 2.50) as ease_factor,
    COALESCE(fr.repetitions, 0) as repetitions
  FROM public.flashcard_cards fc
  LEFT JOIN public.flashcard_reviews fr ON fr.card_id = fc.id AND fr.student_id = p_student_id
  WHERE (p_deck_id IS NULL OR fc.deck_id = p_deck_id)
    AND (fr.next_review_at IS NULL OR fr.next_review_at <= now())
  ORDER BY COALESCE(fr.next_review_at, now()) ASC;
END;
$function$;
ALTER FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.portal_users WHERE id = auth.uid();
  RETURN v_role;
END;
$function$;
ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_my_school_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT school_id FROM public.portal_users WHERE id = auth.uid());
END; $function$;
ALTER FUNCTION "public"."get_my_school_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_or_create_inbox_conversation(p_portal_user_id uuid, p_contact_name text, p_phone_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversation public.whatsapp_conversations%rowtype;
  v_created boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_portal_user_id::text, 0));
  select * into v_conversation
  from public.whatsapp_conversations
  where portal_user_id = p_portal_user_id
  order by created_at asc
  limit 1;

  if v_conversation.id is null then
    insert into public.whatsapp_conversations (
      portal_user_id, contact_name, phone_number, last_message_at,
      last_message_preview, unread_count
    ) values (
      p_portal_user_id, left(coalesce(nullif(trim(p_contact_name), ''), 'User'), 100),
      nullif(regexp_replace(coalesce(p_phone_number, ''), '\D', '', 'g'), ''),
      now(), 'Conversation started', 0
    ) returning * into v_conversation;
    v_created := true;
  end if;

  return jsonb_build_object('conversation', to_jsonb(v_conversation), 'created', v_created);
end;
$function$;
ALTER FUNCTION "public"."get_or_create_inbox_conversation"(p_portal_user_id uuid, p_contact_name text, p_phone_number text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_parent_child_user_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT s.user_id
  FROM   public.students s
  WHERE  s.id IN (SELECT public.get_parent_student_ids())
    AND  s.user_id IS NOT NULL;
$function$;
ALTER FUNCTION "public"."get_parent_child_user_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_parent_student_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Explicit junction table (primary — survives email changes)
  SELECT psl.student_id
  FROM   public.parent_student_links psl
  WHERE  psl.parent_id = auth.uid()
  UNION
  -- Email-based fallback (legacy denormalized path)
  SELECT s.id
  FROM   public.students s
  JOIN   public.portal_users pu ON pu.id = auth.uid()
  WHERE  lower(s.parent_email) = lower(pu.email)
    AND  pu.role = 'parent'
    AND  pu.email IS NOT NULL
    AND  pu.email <> '';
$function$;
ALTER FUNCTION "public"."get_parent_student_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_school_dashboard_stats(school_uuid uuid, school_name_param text DEFAULT NULL::text, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT json_build_object(
    'term_id', v_term,
    'total_students', (
      SELECT COUNT(*) FROM students
      WHERE school_id = school_uuid
         OR (school_name_param IS NOT NULL AND school_name = school_name_param)
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users
      WHERE role = 'student' AND school_id = school_uuid
    ),
    'assigned_teachers', (
      SELECT COUNT(*) FROM teacher_schools WHERE school_id = school_uuid
    ),
    'total_classes', (
      SELECT COUNT(*) FROM classes
      WHERE school_id = school_uuid
        AND public.assignment_matches_term(term_id, v_term)
    ),
    'avg_performance', (
      SELECT COALESCE(AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100), 0)::integer
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'submissions_count', (
      SELECT COUNT(*)
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    )
  ) INTO result;

  RETURN result;
END;
$function$;
ALTER FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_student_dashboard_stats(student_uuid uuid, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT json_build_object(
    'term_id', v_term,
    'enrolled_courses', (
      SELECT COUNT(*) FROM enrollments WHERE user_id = student_uuid
    ),
    'xp_points', (
      SELECT COALESCE(total_points, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'current_streak', (
      SELECT COALESCE(current_streak, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'achievement_level', (
      SELECT COALESCE(achievement_level, 'Bronze') FROM user_points WHERE portal_user_id = student_uuid
    ),
    'lessons_completed', (
      SELECT COUNT(*) FROM lesson_progress
      WHERE portal_user_id = student_uuid AND status = 'completed'
    ),
    'pending_assignments', (
      SELECT COUNT(*)
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.portal_user_id = student_uuid
        AND s.status = 'submitted'
        AND s.grade IS NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'avg_score', (
      SELECT COALESCE(
        AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100)::integer,
        0
      )
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.portal_user_id = student_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'badges_count', (
      SELECT COUNT(*) FROM user_badges WHERE portal_user_id = student_uuid
    ),
    'leaderboard_rank', (
      SELECT rank FROM (
        SELECT portal_user_id,
               ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank
        FROM user_points
      ) lb WHERE portal_user_id = student_uuid
    )
  ) INTO result;

  RETURN result;
END;
$function$;
ALTER FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_teacher_dashboard_stats(teacher_uuid uuid, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  school_ids uuid[];
  school_names text[];
  assignment_ids uuid[];
  exam_ids uuid[];
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT ARRAY_AGG(DISTINCT school_id) INTO school_ids
  FROM (
    SELECT school_id FROM portal_users WHERE id = teacher_uuid
    UNION
    SELECT school_id FROM teacher_schools WHERE teacher_id = teacher_uuid
    UNION
    SELECT school_id FROM classes WHERE teacher_id = teacher_uuid
  ) schools
  WHERE school_id IS NOT NULL;

  SELECT ARRAY_AGG(DISTINCT name) INTO school_names
  FROM schools WHERE id = ANY(school_ids);

  SELECT ARRAY_AGG(id) INTO assignment_ids
  FROM assignments
  WHERE created_by = teacher_uuid
    AND public.assignment_matches_term(term_id, v_term);

  SELECT ARRAY_AGG(e.id) INTO exam_ids
  FROM cbt_exams e
  WHERE e.created_by = teacher_uuid
    AND public.assignment_matches_term(e.term_id, v_term);

  SELECT json_build_object(
    'term_id', v_term,
    'classes', (
      SELECT COUNT(*) FROM classes
      WHERE (teacher_id = teacher_uuid
         OR (school_ids IS NOT NULL AND school_id = ANY(school_ids)))
        AND public.assignment_matches_term(term_id, v_term)
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users
      WHERE role = 'student'
        AND (school_ids IS NOT NULL AND school_id = ANY(school_ids))
    ),
    'registry_students', (
      SELECT COUNT(*) FROM students
      WHERE user_id IS NULL
        AND (
          (school_ids IS NOT NULL AND school_id = ANY(school_ids))
          OR (school_names IS NOT NULL AND school_name = ANY(school_names))
        )
    ),
    'pending_assignments', (
      SELECT COUNT(*) FROM assignment_submissions
      WHERE assignment_id = ANY(assignment_ids)
        AND status = 'submitted'
        AND grade IS NULL
    ),
    'pending_exams', (
      SELECT COUNT(*) FROM cbt_sessions
      WHERE exam_id = ANY(exam_ids)
        AND needs_grading = true
    ),
    'avg_grade', (
      SELECT COALESCE(AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100), 0)::integer
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.assignment_id = ANY(assignment_ids)
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    )
  ) INTO result;

  RETURN result;
END;
$function$;
ALTER FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_timetable_ids_by_school(p_school_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM public.timetables WHERE school_id = p_school_id;
$function$;
ALTER FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.guard_class_primary_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.teacher_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23502', message = 'Every class must have a primary teacher owner.';
  END IF;
  IF NEW.school_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23502', message = 'Every class must belong to a school.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_users teacher
    WHERE teacher.id = NEW.teacher_id AND teacher.role = 'teacher'
      AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
      AND (teacher.school_id = NEW.school_id OR EXISTS (
        SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = teacher.id AND ts.school_id = NEW.school_id
      ))
  ) THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'Class owner must be an active teacher assigned to the class school.';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."guard_class_primary_owner"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.guard_student_class_division()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_class_teacher uuid;
BEGIN
  -- Only act when class_id is actually changing
  IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
    RETURN NEW;
  END IF;

  -- Not a student row — skip
  IF COALESCE(OLD.role, NEW.role) != 'student' THEN
    RETURN NEW;
  END IF;

  -- No primary teacher recorded yet — student is unprotected, allow any move
  IF OLD.primary_teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin explicitly updating primary_teacher_id in the same statement
  -- (heal tool always does this when doing authorized transfers)
  IF NEW.primary_teacher_id IS DISTINCT FROM OLD.primary_teacher_id THEN
    RETURN NEW;
  END IF;

  -- Moving to no class (unenrolling) — always allowed
  IF NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the destination class's teacher
  SELECT teacher_id INTO v_new_class_teacher
  FROM public.classes WHERE id = NEW.class_id;

  -- Same teacher as recorded owner → allow
  IF v_new_class_teacher IS NOT DISTINCT FROM OLD.primary_teacher_id THEN
    RETURN NEW;
  END IF;

  -- Different teacher without ownership transfer → BLOCK
  RAISE EXCEPTION
    'Class division violation: % is protected under their primary teacher. '
    'Use the Class Health & Repair tool to perform an authorized transfer.',
    COALESCE(OLD.full_name, OLD.id::text);
END;
$function$;
ALTER FUNCTION "public"."guard_student_class_division"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.guard_summer_prospect_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true
     AND COALESCE(NEW.is_deleted, false) = false
     AND COALESCE(NEW.course_interest, '') ILIKE '%summer%'
     AND NEW.status IN ('paid', 'partially_paid', 'active')
     AND NOT EXISTS (
       SELECT 1
       FROM public.students s
       WHERE s.user_id IS NOT NULL
         -- normalize like the app: trim + collapse internal whitespace, case-insensitive
         AND btrim(regexp_replace(lower(s.full_name), '\s+', ' ', 'g')) = btrim(regexp_replace(lower(NEW.full_name), '\s+', ' ', 'g'))
         AND lower(btrim(COALESCE(s.parent_email, ''))) = lower(btrim(COALESCE(NEW.parent_email, NEW.email, '')))
     )
  THEN
    -- No student account yet — refuse to mark active; the sweep cron will onboard + heal.
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."guard_summer_prospect_active"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.guard_whatsapp_group_class_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE linked_class public.classes;
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO linked_class FROM public.classes WHERE id = NEW.class_id;
    IF linked_class.id IS NULL THEN RAISE EXCEPTION 'WhatsApp group class does not exist'; END IF;
    NEW.school_id := linked_class.school_id;
    NEW.class_name := linked_class.name;
    NEW.owner_teacher_id := linked_class.teacher_id;
  ELSIF NEW.group_type = 'class' THEN
    RAISE EXCEPTION 'Class WhatsApp groups require class_id';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."guard_whatsapp_group_class_owner"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.handle_certificate_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_course_id uuid;
    v_user_id uuid;
BEGIN
    -- Determine user_id and course_id based on triggering table
    -- Use direct column access to avoid RLS violations
    IF TG_TABLE_NAME = 'lesson_progress' THEN
        v_user_id := NEW.portal_user_id;
        -- Use subquery to avoid JOIN that might trigger course_curricula access
        SELECT course_id INTO v_course_id 
        FROM public.lessons 
        WHERE id = NEW.lesson_id;
    ELSIF TG_TABLE_NAME = 'cbt_sessions' THEN
        v_user_id := NEW.user_id;
        SELECT course_id INTO v_course_id 
        FROM public.cbt_exams 
        WHERE id = NEW.exam_id;
    ELSIF TG_TABLE_NAME = 'assignment_submissions' THEN
        v_user_id := NEW.portal_user_id;
        SELECT course_id INTO v_course_id 
        FROM public.assignments 
        WHERE id = NEW.assignment_id;
    END IF;

    -- Validate required data
    IF v_user_id IS NULL OR v_course_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if certificate already exists (avoid duplicates)
    IF EXISTS (
        SELECT 1 FROM public.certificates 
        WHERE portal_user_id = v_user_id AND course_id = v_course_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Check completion using the RLS-safe function
    IF public.check_course_completion(v_user_id, v_course_id) THEN
        -- Generate certificate with proper metadata
        INSERT INTO public.certificates (
            portal_user_id,
            course_id,
            certificate_number,
            verification_code,
            issued_date,
            created_at,
            metadata
        ) VALUES (
            v_user_id,
            v_course_id,
            'CERT-' || upper(substring(replace(v_user_id::text, '-', ''), 1, 8)) || '-' || upper(substring(replace(v_course_id::text, '-', ''), 1, 4)),
            upper(substring(gen_random_uuid()::text, 1, 8)),
            current_date,
            now(),
            jsonb_build_object(
                'auto_generated', true,
                'trigger_table', TG_TABLE_NAME,
                'generated_at', now()
            )
        );
    END IF;

    RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."handle_certificate_trigger"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_school_id uuid;
  v_class_id uuid;
  v_active boolean;
BEGIN
  v_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
  BEGIN
    v_school_id := NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_school_id := NULL;
  END;
  BEGIN
    v_class_id := NULLIF(NEW.raw_user_meta_data->>'class_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_class_id := NULL;
  END;

  -- Admins are platform-scoped. Everyone else starts inactive unless metadata
  -- already carries the required school (and class for students).
  IF v_role = 'admin' THEN
    v_active := true;
  ELSIF v_role = 'student' THEN
    v_active := (v_school_id IS NOT NULL AND v_class_id IS NOT NULL);
  ELSIF v_role IN ('parent', 'teacher', 'school') THEN
    v_active := (v_school_id IS NOT NULL);
  ELSE
    v_active := false;
  END IF;

  INSERT INTO public.portal_users (
    id,
    email,
    full_name,
    role,
    school_id,
    class_id,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    v_role,
    v_school_id,
    v_class_id,
    v_active,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.handle_new_school_wa_settings()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.school_whatsapp_settings (school_id)
  VALUES (NEW.id)
  ON CONFLICT (school_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."handle_new_school_wa_settings"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.handover_primary_duty(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.operations_duty_rota%ROWTYPE;
BEGIN
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Duty end must be after start.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('duty:' || p_duty_kind, 0));

  IF p_is_primary THEN
    UPDATE public.operations_duty_rota
    SET status = 'completed',
        updated_at = p_starts_at
    WHERE duty_kind = p_duty_kind
      AND is_primary = true
      AND status IN ('scheduled', 'active')
      AND starts_at <= p_starts_at
      AND ends_at > p_starts_at;
  END IF;

  INSERT INTO public.operations_duty_rota (
    staff_id,
    duty_kind,
    starts_at,
    ends_at,
    is_primary,
    status,
    created_by
  ) VALUES (
    p_staff_id,
    p_duty_kind,
    p_starts_at,
    p_ends_at,
    p_is_primary,
    'active',
    p_created_by
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;
ALTER FUNCTION "public"."handover_primary_duty"(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.hard_delete_portal_user(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;
ALTER FUNCTION "public"."hard_delete_portal_user"(p_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.hard_delete_school(p_school uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  u record;
  users_removed int := 0;
  tables_swept int := 0;
BEGIN
  IF p_school IS NULL THEN
    RAISE EXCEPTION 'p_school is required';
  END IF;

  -- Phase 1 â€” remove every user of the school (cascades their data + auth login).
  FOR u IN SELECT id FROM portal_users WHERE school_id = p_school LOOP
    PERFORM hard_delete_portal_user(u.id);
    users_removed := users_removed + 1;
  END LOOP;

  -- Phase 2 â€” sweep every remaining school-scoped row across all public tables.
  SET LOCAL session_replication_role = replica;
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE school_id = $1', r.table_name) USING p_school;
    tables_swept := tables_swept + 1;
  END LOOP;
  SET LOCAL session_replication_role = default;

  -- The school record itself.
  DELETE FROM schools WHERE id = p_school;

  RETURN jsonb_build_object('users_removed', users_removed, 'tables_swept', tables_swept);
END;
$function$;
ALTER FUNCTION "public"."hard_delete_school"(p_school uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.increment_download_count(file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE files
  SET download_count = download_count + 1
  WHERE id = file_id;
END;
$function$;
ALTER FUNCTION "public"."increment_download_count"(file_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.increment_question_upvotes(question_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE live_session_questions
    SET upvotes = upvotes + 1
    WHERE id = question_id;
END;
$function$;
ALTER FUNCTION "public"."increment_question_upvotes"(question_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
      AND COALESCE(is_deleted, false) = false
  )
$function$;
ALTER FUNCTION "public"."is_active_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT role = 'admin' FROM public.portal_users WHERE id = auth.uid());
END; $function$;
ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_admin_or_teacher()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher') FROM public.portal_users WHERE id = auth.uid());
END; $function$;
ALTER FUNCTION "public"."is_admin_or_teacher"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_parent()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE id = auth.uid() AND role = 'parent'
  );
$function$;
ALTER FUNCTION "public"."is_parent"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher', 'school') FROM public.portal_users WHERE id = auth.uid());
END; $function$;
ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.live_academic_session_label(p_now date DEFAULT CURRENT_DATE)
 RETURNS TABLE(period_label text, term_label text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_month int := EXTRACT(MONTH FROM p_now)::int;
  v_y int := EXTRACT(YEAR FROM p_now)::int;
BEGIN
  IF v_month >= 9 THEN
    period_label := v_y::text || '/' || (v_y + 1)::text;
    term_label := 'First Term';
  ELSIF v_month >= 5 THEN
    period_label := (v_y - 1)::text || '/' || v_y::text;
    term_label := 'Third Term';
  ELSE
    period_label := (v_y - 1)::text || '/' || v_y::text;
    term_label := 'Second Term';
  END IF;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION "public"."live_academic_session_label"(p_now date) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.live_academic_term_id(p_now date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_id uuid;
  v_year text;
  v_label text;
  v_month int := EXTRACT(MONTH FROM p_now)::int;
  v_y int := EXTRACT(YEAR FROM p_now)::int;
BEGIN
  -- Prefer explicit date window on academic_terms
  SELECT id INTO v_id
  FROM public.academic_terms
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND p_now BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Nigerian Sept–Aug calendar fallback (same as TypeScript)
  IF v_month >= 9 THEN
    v_year := v_y::text || '/' || (v_y + 1)::text;
    v_label := 'First Term';
  ELSIF v_month >= 5 THEN
    v_year := (v_y - 1)::text || '/' || v_y::text;
    v_label := 'Third Term';
  ELSE
    v_year := (v_y - 1)::text || '/' || v_y::text;
    v_label := 'Second Term';
  END IF;

  SELECT id INTO v_id
  FROM public.academic_terms
  WHERE academic_year = v_year
    AND term_label = v_label
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Last resort: is_current flag
  RETURN public.current_academic_term();
END;
$function$;
ALTER FUNCTION "public"."live_academic_term_id"(p_now date) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.normalize_contact_book_phone(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;
  IF length(digits) = 11 AND digits LIKE '0%' THEN
    digits := '234' || substring(digits from 2);
  ELSIF length(digits) = 10 THEN
    digits := '234' || digits;
  END IF;
  RETURN digits;
END;
$function$;
ALTER FUNCTION "public"."normalize_contact_book_phone"(raw text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.notify_parent_on_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_parent_id UUID;
  v_invoice_number TEXT;
BEGIN
  -- Only fire when status changes TO 'paid'
  IF OLD.status = NEW.status OR NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;

  v_invoice_number := NEW.invoice_number;

  -- Find the parent linked to the child who owns this invoice
  SELECT pu.id INTO v_parent_id
  FROM public.portal_users pu
  JOIN public.students s ON s.parent_email = pu.email
  WHERE s.user_id = NEW.portal_user_id
    AND pu.role = 'parent'
  LIMIT 1;

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read, created_at)
    VALUES (
      v_parent_id,
      'Payment Confirmed & Receipt Issued',
      'Invoice #' || v_invoice_number || ' has been paid. Your receipt has been automatically generated and is available in your portal.',
      'payment',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."notify_parent_on_invoice_paid"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.notify_parent_on_report_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_student_name  TEXT;
  v_parent_id     UUID;
  v_action_url    TEXT;
BEGIN
  -- Only act when is_published goes from false/null → true
  IF (NEW.is_published IS TRUE) AND (OLD.is_published IS NOT TRUE) THEN

    -- Resolve student name from portal_users (student_id = portal_users.id)
    SELECT full_name INTO v_student_name
    FROM portal_users
    WHERE id = NEW.student_id
    LIMIT 1;

    -- Find the parent portal_users.id via students.parent_email
    SELECT pu.id INTO v_parent_id
    FROM students s
    JOIN portal_users pu ON pu.email = s.parent_email
    WHERE s.user_id = NEW.student_id
      AND pu.role = 'parent'
    LIMIT 1;

    IF v_parent_id IS NOT NULL THEN
      v_action_url := '/dashboard/parent-results?student=' || NEW.student_id::TEXT;

      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        is_read,
        action_url,
        notification_channel,
        delivery_status,
        created_at,
        updated_at
      ) VALUES (
        v_parent_id,
        'Report Card Published',
        COALESCE(v_student_name, 'Your child') || '''s ' ||
          COALESCE(NEW.report_term, 'term') || ' report card for ' ||
          COALESCE(NEW.course_name, 'a course') || ' has been published.',
        'info',
        false,
        v_action_url,
        'in_app',
        'sent',
        NOW(),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."notify_parent_on_report_publish"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.prevent_student_submission_grade_tamper()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  SELECT pu.role INTO caller_role
  FROM public.portal_users pu
  WHERE pu.id = auth.uid();

  -- Staff / service role: allow full updates
  IF caller_role IS NULL OR caller_role IN ('admin', 'teacher', 'school') THEN
    RETURN NEW;
  END IF;

  -- Students (and any non-staff) cannot change grading fields
  NEW.grade := OLD.grade;
  NEW.weighted_score := OLD.weighted_score;
  NEW.graded_by := OLD.graded_by;
  NEW.graded_at := OLD.graded_at;
  NEW.feedback := OLD.feedback;
  NEW.ai_suggested_grade := OLD.ai_suggested_grade;
  NEW.ai_suggested_feedback := OLD.ai_suggested_feedback;
  NEW.grading_mode := OLD.grading_mode;

  -- Once graded, freeze status; otherwise only allow student-facing statuses
  IF OLD.status = 'graded' THEN
    NEW.status := OLD.status;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status NOT IN ('submitted', 'late', 'missing') THEN
    NEW.status := OLD.status;
  END IF;

  -- Never let a student reassign ownership
  NEW.portal_user_id := OLD.portal_user_id;
  NEW.user_id := OLD.user_id;
  NEW.assignment_id := OLD.assignment_id;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."prevent_student_submission_grade_tamper"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.process_payment_atomic(p_reference text, p_invoice_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_existing_id   uuid;
  v_transaction_id uuid;
  v_rows          int;
  v_invoice_amount numeric;
begin
  -- ----------------------------------------------------------------
  -- 1. idempotency check
  -- ----------------------------------------------------------------
  select id
    into v_existing_id
    from public.payment_transactions
   where transaction_reference = p_reference
   limit 1;

  if found then
    return jsonb_build_object(
      'status',         'already_processed',
      'transaction_id', v_existing_id
    );
  end if;

  -- ----------------------------------------------------------------
  -- 2. validate payment amount matches invoice
  -- ----------------------------------------------------------------
  select amount
    into v_invoice_amount
    from public.invoices
   where id = p_invoice_id;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  -- Allow small rounding differences (1 kobo) but reject significant mismatches
  if abs(p_amount - v_invoice_amount) > 0.01 then
    raise exception 
      'Payment amount (%) does not match invoice amount (%). Difference: %',
      p_amount, v_invoice_amount, abs(p_amount - v_invoice_amount);
  end if;

  -- ----------------------------------------------------------------
  -- 3. insert payment transaction
  -- ----------------------------------------------------------------
  insert into public.payment_transactions (
    transaction_reference,
    amount,
    payment_status,
    paid_at,
    invoice_id
  )
  values (
    p_reference,
    p_amount,
    'completed',
    now(),
    p_invoice_id
  )
  returning id into v_transaction_id;

  -- ----------------------------------------------------------------
  -- 4. update invoice status
  -- ----------------------------------------------------------------
  update public.invoices
     set status                 = 'paid',
         payment_transaction_id = v_transaction_id,
         updated_at             = now()
   where id = p_invoice_id;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception
      'process_payment_atomic: invoice % not found — rolling back',
      p_invoice_id;
  end if;

  -- ----------------------------------------------------------------
  -- 5. success
  -- ----------------------------------------------------------------
  return jsonb_build_object(
    'status',         'processed',
    'transaction_id', v_transaction_id
  );

exception
  when others then
    -- re-raise so postgres rolls back the entire transaction
    raise;
end;
$function$;
ALTER FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.purge_registration_archive_on_user_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected text[];
BEGIN
  IF OLD.email IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT array_agg(DISTINCT batch_id::text)
    INTO affected
    FROM registration_results
   WHERE lower(email) = lower(OLD.email);

  DELETE FROM registration_results
   WHERE lower(email) = lower(OLD.email);

  IF affected IS NOT NULL THEN
    -- prune batches that are now empty
    DELETE FROM registration_batches b
     WHERE b.id::text = ANY(affected)
       AND NOT EXISTS (SELECT 1 FROM registration_results r WHERE r.batch_id = b.id);
    -- keep counts accurate on the rest
    UPDATE registration_batches b
       SET student_count = (SELECT count(*) FROM registration_results r WHERE r.batch_id = b.id)
     WHERE b.id::text = ANY(affected);
  END IF;

  RETURN OLD;
END;
$function$;
ALTER FUNCTION "public"."purge_registration_archive_on_user_delete"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.qa_build_explicit_topic(p_lane integer, p_week integer)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  with
  st as (
    select array[
      'Hook & safety', 'Direct instruction', 'Guided practice', 'Independent build', 'Debug clinic',
      'Rubric & peer review', 'Sprint A', 'Sprint B', 'Integration', 'Showcase', 'Portfolio', 'Reteach & stretch'
    ]::text[] as a
  ),
  ng as (
    select array[
      'market pricing', 'traffic flow', 'hospital triage', 'farm yield', 'mobile money', 'solar charging',
      'sports stats', 'music playlist', 'school timetable', 'local news digest', 'waste collection', 'bus arrival times'
    ]::text[] as a
  )
  select format(
    '%s | Y%s T%s W%s — %s — tie-in: %s',
    (case p_lane
      when 1 then 'Blocks/Scratch (Young Innovator · Basic 1)'
      when 2 then 'Blocks/Scratch (Young Innovator · Basic 2)'
      when 3 then 'Blocks/Scratch (Young Innovator · Basic 3)'
      when 4 then 'Python (Basic 4 path)'
      when 5 then 'HTML & CSS (Basic 4 path)'
      when 6 then 'Python (Basic 5 path)'
      when 7 then 'HTML & CSS (Basic 5 path)'
      when 8 then 'Python (Basic 6 path)'
      when 9 then 'HTML & CSS (Basic 6 path)'
      when 10 then 'JSS web app (JS/React/Tailwind · JSS 1)'
      when 11 then 'JSS web app (JSS 2 — partial 40w lane)'
      else 'Unknown lane'
    end),
    (p_week - 1) / 36 + 1,
    ((p_week - 1) % 36) / 12 + 1,
    ((p_week - 1) % 12) + 1,
    (select a[1 + ((p_week - 1) % 12)] from st),
    (select a[1 + ((p_lane + p_week - 1) % 12)] from ng)
  );
$function$;
ALTER FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.recompute_invoice_balances_atomic(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_invoice record; v_paid numeric; v_remaining numeric; v_status text; v_count integer;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT COUNT(*),COALESCE(SUM(amount),0) INTO v_count,v_paid FROM public.payment_allocations WHERE invoice_id=p_invoice_id;
  IF v_count=0 THEN RAISE EXCEPTION 'Invoice has no allocation evidence; automatic balance repair is unsafe'; END IF;
  v_remaining:=GREATEST(0,COALESCE(v_invoice.original_amount,v_invoice.amount,0)-v_paid);
  v_status:=CASE WHEN v_remaining<=0.01 THEN 'paid' WHEN v_paid>0 THEN 'partially_paid' WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date<now() THEN 'overdue' ELSE 'sent' END;
  UPDATE public.invoices SET amount_paid=v_paid,amount_remaining=CASE WHEN v_remaining<=0.01 THEN 0 ELSE v_remaining END,status=v_status,updated_at=now() WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,'amount_paid',v_paid,'amount_remaining',v_remaining,'status',v_status,'allocation_count',v_count);
END $function$;
ALTER FUNCTION "public"."recompute_invoice_balances_atomic"(p_invoice_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.record_class_lesson_delivery(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text DEFAULT NULL::text, p_class_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.lesson_plans%ROWTYPE;
  v_delivery public.class_lesson_delivery%ROWTYPE;
  v_term_number integer;
BEGIN
  IF p_week_number NOT BETWEEN 1 AND 53 THEN RAISE EXCEPTION 'Week number must be between 1 and 53'; END IF;
  IF p_status NOT IN ('planned','delivered','skipped') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  SELECT * INTO v_plan FROM public.lesson_plans WHERE id=p_lesson_plan_id AND status<>'archived' FOR UPDATE;
  IF NOT FOUND OR v_plan.class_id IS NULL OR v_plan.term_id IS NULL OR v_plan.course_id IS NULL THEN
    RAISE EXCEPTION 'Canonical class lesson plan not found';
  END IF;
  IF p_lesson_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lessons l WHERE l.id=p_lesson_id AND l.lesson_plan_id=v_plan.id AND l.class_id=v_plan.class_id
  ) THEN RAISE EXCEPTION 'Lesson does not belong to this class plan'; END IF;
  IF p_class_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_sessions s WHERE s.id=p_class_session_id AND s.class_id=v_plan.class_id
  ) THEN RAISE EXCEPTION 'Session does not belong to this class'; END IF;

  IF p_lesson_id IS NULL THEN
    INSERT INTO public.class_lesson_delivery(
      class_id,academic_term_id,course_id,lesson_plan_id,lesson_id,class_session_id,
      week_number,status,delivered_at,delivered_by,notes,updated_at
    ) VALUES (
      v_plan.class_id,v_plan.term_id,v_plan.course_id,v_plan.id,NULL,p_class_session_id,
      p_week_number,p_status,CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,p_notes,now()
    ) ON CONFLICT (lesson_plan_id,week_number) WHERE lesson_id IS NULL DO UPDATE SET
      class_session_id=EXCLUDED.class_session_id,status=EXCLUDED.status,delivered_at=EXCLUDED.delivered_at,
      delivered_by=EXCLUDED.delivered_by,notes=EXCLUDED.notes,updated_at=now()
    RETURNING * INTO v_delivery;
  ELSE
    INSERT INTO public.class_lesson_delivery(
      class_id,academic_term_id,course_id,lesson_plan_id,lesson_id,class_session_id,
      week_number,status,delivered_at,delivered_by,notes,updated_at
    ) VALUES (
      v_plan.class_id,v_plan.term_id,v_plan.course_id,v_plan.id,p_lesson_id,p_class_session_id,
      p_week_number,p_status,CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,p_notes,now()
    ) ON CONFLICT (lesson_plan_id,week_number,lesson_id) DO UPDATE SET
      class_session_id=EXCLUDED.class_session_id,status=EXCLUDED.status,delivered_at=EXCLUDED.delivered_at,
      delivered_by=EXCLUDED.delivered_by,notes=EXCLUDED.notes,updated_at=now()
    RETURNING * INTO v_delivery;
  END IF;

  IF v_plan.curriculum_version_id IS NOT NULL AND v_plan.school_id IS NOT NULL THEN
    SELECT term_number INTO v_term_number FROM public.academic_terms WHERE id=v_plan.term_id;
    INSERT INTO public.curriculum_week_tracking(
      curriculum_id,school_id,class_id,lesson_plan_id,term_number,week_number,status,
      teacher_notes,actual_date,completed_by,completed_at,updated_at
    ) VALUES (
      v_plan.curriculum_version_id,v_plan.school_id,v_plan.class_id,v_plan.id,v_term_number,p_week_number,
      CASE p_status WHEN 'delivered' THEN 'completed' WHEN 'skipped' THEN 'skipped' ELSE 'pending' END,
      p_notes,CASE WHEN p_status='delivered' THEN current_date ELSE NULL END,
      CASE WHEN p_status='delivered' THEN p_actor_id ELSE NULL END,
      CASE WHEN p_status='delivered' THEN now() ELSE NULL END,now()
    ) ON CONFLICT (curriculum_id,school_id,class_id,lesson_plan_id,term_number,week_number)
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND lesson_plan_id IS NOT NULL
    DO UPDATE SET status=EXCLUDED.status,teacher_notes=EXCLUDED.teacher_notes,
      actual_date=EXCLUDED.actual_date,completed_by=EXCLUDED.completed_by,
      completed_at=EXCLUDED.completed_at,updated_at=now();
  END IF;
  RETURN to_jsonb(v_delivery);
END $function$;
ALTER FUNCTION "public"."record_class_lesson_delivery"(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text, p_class_session_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW admin_dashboard_stats;
END;
$function$;
ALTER FUNCTION "public"."refresh_dashboard_stats"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.repoint_contact_book_dupe(dupe_id uuid, keep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF dupe_id IS NULL OR keep_id IS NULL OR dupe_id = keep_id THEN
    RETURN;
  END IF;

  UPDATE public.form_leads
  SET contact_id = keep_id
  WHERE contact_id = dupe_id;

  UPDATE public.crm_interactions
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_attachments
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_tasks
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  UPDATE public.crm_opportunities
  SET contact_id = keep_id::text
  WHERE contact_id = dupe_id::text;

  IF EXISTS (
    SELECT 1 FROM public.crm_pipeline WHERE contact_id = keep_id::text
  ) THEN
    DELETE FROM public.crm_pipeline WHERE contact_id = dupe_id::text;
  ELSE
    UPDATE public.crm_pipeline
    SET contact_id = keep_id::text
    WHERE contact_id = dupe_id::text;
  END IF;

  DELETE FROM public.customer_contact_book WHERE id = dupe_id;
END;
$function$;
ALTER FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.require_portal_structure()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Soft-deleted / inactive rows may be incomplete while being placed.
  IF COALESCE(NEW.is_deleted, false) = true OR COALESCE(NEW.is_active, false) = false THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'student' THEN
    IF NEW.school_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active student % must have a school (school_id).',
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
    IF NEW.class_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active student % must have a class (class_id).',
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IN ('parent', 'teacher', 'school') THEN
    IF NEW.school_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active % % must have a school (school_id).',
        NEW.role,
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."require_portal_structure"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.resolve_academic_term(p_year text, p_term text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num int;
  v_label text;
  v_id uuid;
BEGIN
  IF p_year IS NULL OR btrim(p_year) = '' THEN RETURN NULL; END IF;
  v_num := CASE
    WHEN p_term ILIKE '%first%'  OR p_term = '1' THEN 1
    WHEN p_term ILIKE '%second%' OR p_term = '2' THEN 2
    WHEN p_term ILIKE '%third%'  OR p_term = '3' THEN 3
    ELSE NULL END;
  IF v_num IS NULL THEN RETURN NULL; END IF;
  v_label := (ARRAY['First Term', 'Second Term', 'Third Term'])[v_num];
  SELECT id INTO v_id FROM public.academic_terms WHERE academic_year = p_year AND term_number = v_num;
  IF v_id IS NULL THEN
    INSERT INTO public.academic_terms (academic_year, term_number, term_label)
    VALUES (p_year, v_num, v_label)
    ON CONFLICT (academic_year, term_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;
ALTER FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.set_attendance_roster_context()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_class_id uuid;
  v_term_id uuid;
  v_student_id uuid;
  v_roster_id uuid;
BEGIN
  SELECT cs.class_id, cs.term_id INTO v_class_id, v_term_id
  FROM public.class_sessions cs
  WHERE cs.id = NEW.session_id;

  v_student_id := COALESCE(NEW.user_id, NEW.student_id);

  IF v_term_id IS NULL AND NEW.session_id IS NOT NULL THEN
    SELECT public.term_id_for_date(cs.session_date::date) INTO v_term_id
    FROM public.class_sessions cs
    WHERE cs.id = NEW.session_id;
  END IF;

  IF v_class_id IS NOT NULL AND v_student_id IS NOT NULL THEN
    SELECT ctr.id INTO v_roster_id
    FROM public.class_term_rosters ctr
    WHERE ctr.class_id = v_class_id
      AND ctr.student_id = v_student_id
      AND (
        (v_term_id IS NOT NULL AND ctr.term_id = v_term_id)
        OR (v_term_id IS NULL AND ctr.term_id IS NULL)
      )
    ORDER BY
      CASE ctr.status WHEN 'active' THEN 0 ELSE 1 END,
      ctr.reinstated_at DESC NULLS LAST,
      ctr.started_at DESC
    LIMIT 1;
  END IF;

  NEW.term_id := COALESCE(NEW.term_id, v_term_id);
  NEW.class_term_roster_id := COALESCE(NEW.class_term_roster_id, v_roster_id);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."set_attendance_roster_context"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.set_class_session_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_term_id uuid;
BEGIN
  SELECT c.term_id INTO v_term_id
  FROM public.classes c
  WHERE c.id = NEW.class_id;

  NEW.term_id := COALESCE(NEW.term_id, v_term_id, public.term_id_for_date(NEW.session_date::date));
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."set_class_session_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.settle_billing_cycle_payment_atomic(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cycle record; v_tx record; v_invoice record; v_invoice_id uuid; v_invoice_number text;
BEGIN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id = p_billing_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing cycle not found'; END IF;
  IF lower(COALESCE(v_cycle.status, '')) IN ('cancelled','rolled_over') THEN
    RAISE EXCEPTION 'A cancelled or rolled-over billing cycle cannot be settled';
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment transaction not found'; END IF;
  IF lower(COALESCE(v_tx.payment_status, '')) NOT IN ('completed','success','paid') THEN
    RAISE EXCEPTION 'Payment transaction must be completed before cycle settlement';
  END IF;
  IF upper(COALESCE(v_tx.currency,'NGN')) <> upper(COALESCE(v_cycle.currency,'NGN')) THEN
    RAISE EXCEPTION 'Payment currency does not match billing cycle currency';
  END IF;
  IF COALESCE(v_tx.amount,0) + 0.01 < COALESCE(v_cycle.amount_due,0) THEN
    RAISE EXCEPTION 'Payment amount is below the billing cycle amount due';
  END IF;

  v_invoice_id := COALESCE(v_tx.invoice_id, v_cycle.invoice_id);
  IF v_invoice_id IS NULL THEN
    v_invoice_number := 'INV-CYC-' || upper(substr(replace(v_tx.id::text,'-',''),1,16));
    INSERT INTO public.invoices (
      invoice_number, school_id, portal_user_id, amount, original_amount, amount_paid,
      amount_remaining, currency, status, due_date, items, notes, stream,
      billing_cycle_id, payment_transaction_id, metadata, created_at, updated_at
    ) VALUES (
      v_invoice_number, COALESCE(v_cycle.owner_school_id,v_cycle.school_id), v_cycle.owner_user_id,
      v_cycle.amount_due, v_cycle.amount_due, v_cycle.amount_due, 0, upper(v_cycle.currency), 'paid',
      v_cycle.due_date, COALESCE(v_cycle.items,'[]'::jsonb),
      'Billing cycle payment: ' || v_cycle.term_label,
      CASE WHEN v_cycle.owner_type='school' THEN 'school' ELSE 'individual' END,
      v_cycle.id, v_tx.id,
      jsonb_build_object('source','billing_cycle_payment','billing_cycle_id',v_cycle.id,'actor_id',p_actor_id),
      now(), now()
    ) RETURNING id INTO v_invoice_id;
  ELSE
    SELECT * INTO v_invoice FROM public.invoices WHERE id=v_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked invoice not found'; END IF;
    UPDATE public.invoices SET
      billing_cycle_id=v_cycle.id,
      status='paid',
      original_amount=COALESCE(original_amount,amount,v_cycle.amount_due),
      amount_paid=COALESCE(original_amount,amount,v_cycle.amount_due),
      amount_remaining=0,
      payment_transaction_id=v_tx.id,
      updated_at=now()
    WHERE id=v_invoice_id;
  END IF;

  UPDATE public.payment_transactions SET invoice_id=v_invoice_id,updated_at=now() WHERE id=v_tx.id;
  UPDATE public.billing_cycles SET invoice_id=v_invoice_id,status='paid',updated_at=now() WHERE id=v_cycle.id;
  IF v_cycle.sticky_notice_id IS NOT NULL THEN
    UPDATE public.billing_notices SET is_resolved=true,resolved_at=now(),updated_at=now()
      WHERE id=v_cycle.sticky_notice_id;
  END IF;
  RETURN jsonb_build_object('billing_cycle_id',v_cycle.id,'invoice_id',v_invoice_id,'transaction_id',v_tx.id,'status','paid');
END $function$;
ALTER FUNCTION "public"."settle_billing_cycle_payment_atomic"(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.student_duplicate_name_key(raw_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select coalesce(string_agg(token, ' ' order by token), '')
  from regexp_split_to_table(
    trim(regexp_replace(lower(coalesce(raw_name, '')), '[^a-z0-9]+', ' ', 'g')),
    '\s+'
  ) as token
  where token <> '' and token !~ '^\d+$';
$function$;
ALTER FUNCTION "public"."student_duplicate_name_key"(raw_name text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_academic_terms_is_current(p_now date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_live uuid := public.live_academic_term_id(p_now);
BEGIN
  IF v_live IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.academic_terms
  SET is_current = (id = v_live),
      updated_at = now()
  WHERE is_current IS DISTINCT FROM (id = v_live);

  RETURN v_live;
END;
$function$;
ALTER FUNCTION "public"."sync_academic_terms_is_current"(p_now date) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_assignment_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    IF NEW.due_date IS NOT NULL THEN
      v_candidate := public.term_id_for_date(NEW.due_date::date);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
ALTER FUNCTION "public"."sync_assignment_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_class_ownership_from_teacher_schools()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Newly assigned to a school: claim its UNOWNED classes (never steal one already owned
    -- by another teacher of that school).
    UPDATE classes SET teacher_id = NEW.teacher_id, updated_at = now()
      WHERE school_id = NEW.school_id AND teacher_id IS NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Reassigned away: release this teacher's ownership of that school's classes and drop them
    -- as the students' primary teacher there — UNLESS they remain assigned to the same school
    -- via their primary profile school_id.
    IF NOT EXISTS (SELECT 1 FROM portal_users WHERE id = OLD.teacher_id AND school_id = OLD.school_id) THEN
      UPDATE portal_users SET primary_teacher_id = NULL, updated_at = now()
        WHERE role = 'student' AND primary_teacher_id = OLD.teacher_id
          AND class_id IN (SELECT id FROM classes WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id);
      UPDATE classes SET teacher_id = NULL, updated_at = now()
        WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION "public"."sync_class_ownership_from_teacher_schools"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_class_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    IF NEW.start_date IS NOT NULL THEN
      v_candidate := public.term_id_for_date(NEW.start_date::date);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
ALTER FUNCTION "public"."sync_class_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_enrollment_live_grade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_live uuid := public.live_academic_term_id();
BEGIN
  IF v_live IS NOT NULL AND NEW.term_id = v_live THEN
    UPDATE public.enrollments
    SET grade = NEW.grade,
        notes = COALESCE(NEW.notes, notes),
        updated_at = now()
    WHERE id = NEW.enrollment_id;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_enrollment_live_grade"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_form_lead_primary_child_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_primary_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT student_portal_user_id
      INTO v_primary_id
    FROM public.form_lead_child_links
    WHERE lead_id = OLD.lead_id
      AND child_index = 0
      AND status IN ('approved', 'onboarded');

    UPDATE public.form_leads
    SET matched_student_id = v_primary_id
    WHERE id = OLD.lead_id
      AND matched_student_id IS DISTINCT FROM v_primary_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND (TG_OP = 'INSERT' OR NEW.lead_id IS DISTINCT FROM OLD.lead_id) THEN
    SELECT student_portal_user_id
      INTO v_primary_id
    FROM public.form_lead_child_links
    WHERE lead_id = NEW.lead_id
      AND child_index = 0
      AND status IN ('approved', 'onboarded');

    UPDATE public.form_leads
    SET matched_student_id = v_primary_id
    WHERE id = NEW.lead_id
      AND matched_student_id IS DISTINCT FROM v_primary_id;
  END IF;

  RETURN NULL;
END
$function$;
ALTER FUNCTION "public"."sync_form_lead_primary_child_cache"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_invoice_amount_from_original()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.original_amount IS NULL THEN
    NEW.original_amount := COALESCE(NEW.amount, 0);
  END IF;
  NEW.amount := NEW.original_amount;
  IF NEW.amount_paid IS NULL THEN
    NEW.amount_paid := 0;
  END IF;
  IF NEW.amount_remaining IS NULL THEN
    NEW.amount_remaining := GREATEST(0, NEW.original_amount - NEW.amount_paid);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_invoice_amount_from_original"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_lesson_plan_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.term IS DISTINCT FROM OLD.term THEN
    IF NEW.term IS NOT NULL AND NEW.term ~ '\d{4}/\d{4}' THEN
      v_candidate := public.resolve_academic_term(substring(NEW.term FROM '(\d{4}/\d{4})'), NEW.term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
ALTER FUNCTION "public"."sync_lesson_plan_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_parent_email_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.role = 'parent' THEN
    UPDATE public.students
    SET    parent_email = NEW.email,
           updated_at   = now()
    WHERE  lower(parent_email) = lower(OLD.email);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_parent_email_on_update"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_portal_student_placement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_class classes%ROWTYPE; v_school_name text;
BEGIN
 IF NEW.role <> 'student' THEN RETURN NEW; END IF;
 IF NEW.class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=NEW.class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected class is not registered'; END IF;
  IF v_class.school_id IS NULL THEN RAISE EXCEPTION 'Selected class has no registered school'; END IF;
  NEW.school_id:=v_class.school_id; NEW.section_class:=v_class.name; NEW.primary_teacher_id:=v_class.teacher_id;
  IF NEW.grade IS NULL OR btrim(NEW.grade)='' THEN NEW.grade:=COALESCE(NULLIF(btrim(v_class.qa_grade_key),''),NULLIF(btrim(v_class.name),'')); END IF;
 END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $function$;
ALTER FUNCTION "public"."sync_portal_student_placement"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_progress_report_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.report_period IS NOT NULL AND NEW.report_term IS NOT NULL THEN
    NEW.term_id := public.resolve_academic_term(NEW.report_period, NEW.report_term);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_progress_report_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_report_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.report_period IS DISTINCT FROM OLD.report_period
     OR NEW.report_term   IS DISTINCT FROM OLD.report_term THEN
    IF NEW.report_period IS NOT NULL AND NEW.report_term IS NOT NULL THEN
      v_candidate := public.resolve_academic_term(NEW.report_period, NEW.report_term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
ALTER FUNCTION "public"."sync_report_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_school_name_from_fk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.school_id IS NOT NULL THEN
    SELECT name INTO NEW.school_name FROM public.schools WHERE id = NEW.school_id;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_school_name_from_fk"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_student_registry_placement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_class classes%ROWTYPE; v_portal_grade text; v_class_id uuid; v_school_name text;
BEGIN
 SELECT class_id,grade INTO v_class_id,v_portal_grade FROM portal_users WHERE id=NEW.user_id AND role='student';
 IF v_class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=v_class_id;
  IF FOUND THEN NEW.school_id:=v_class.school_id; NEW.section:=v_class.name; NEW.current_class:=v_class.name; END IF;
 END IF;
 IF v_portal_grade IS NOT NULL AND btrim(v_portal_grade)<>'' THEN NEW.grade:=v_portal_grade; NEW.grade_level:=v_portal_grade; END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $function$;
ALTER FUNCTION "public"."sync_student_registry_placement"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_timetable_term_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
     OR NEW.term          IS DISTINCT FROM OLD.term THEN
    IF NEW.academic_year IS NOT NULL AND NEW.term IS NOT NULL THEN
      v_candidate := public.resolve_academic_term(NEW.academic_year, NEW.term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
ALTER FUNCTION "public"."sync_timetable_term_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_whatsapp_conversation_school()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.portal_user_id IS NOT NULL THEN
    SELECT school_name INTO NEW.school_name
    FROM public.portal_users
    WHERE id = NEW.portal_user_id;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_whatsapp_conversation_school"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.term_id_for_date(p_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT id FROM public.academic_terms
  WHERE p_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC LIMIT 1;
$function$;
ALTER FUNCTION "public"."term_id_for_date"(p_date date) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.touch_session_recordings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
ALTER FUNCTION "public"."touch_session_recordings_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;
ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.trg_portal_users_fill_grade()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.role = 'student' AND NEW.grade IS NULL THEN
    NEW.grade := canonical_grade(NEW.section_class);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."trg_portal_users_fill_grade"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.unlink_parent_from_student(target_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.students
  set parent_email = null
  where id = target_student_id;
end;
$function$;
ALTER FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_billing_cycle_with_invoice(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle record;
  v_invoice record;
  v_remaining numeric;
  v_invoice_status text;
  v_notes text;
BEGIN
  SELECT * INTO v_cycle FROM public.billing_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked term record not found';
  END IF;
  IF v_cycle.status = 'paid' THEN
    RAISE EXCEPTION 'Cannot edit a paid invoice';
  END IF;
  IF p_amount_due IS NULL OR p_amount_due <= 0 THEN
    RAISE EXCEPTION 'amount must be a positive number';
  END IF;
  IF upper(p_currency) NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'currency must be NGN or USD';
  END IF;
  IF p_status NOT IN ('due', 'past_due', 'cancelled', 'rolled_over') THEN
    RAISE EXCEPTION 'Invalid term status';
  END IF;

  v_notes := COALESCE(NULLIF(trim(p_notes), ''), 'Auto-generated from billing cycle: ' || p_term_label);

  IF v_cycle.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_cycle.invoice_id FOR UPDATE;
    IF lower(COALESCE(v_invoice.status, '')) = 'paid' OR COALESCE(v_invoice.amount_paid, 0) > 0 THEN
      RAISE EXCEPTION 'Invoice has payment activity and is financially locked';
    END IF;
    v_remaining := p_amount_due;
    v_invoice_status := CASE
      WHEN p_status IN ('cancelled', 'rolled_over') THEN 'cancelled'
      WHEN p_due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'sent'
    END;
    UPDATE public.invoices
    SET
      amount = p_amount_due,
      original_amount = p_amount_due,
      amount_remaining = v_remaining,
      currency = upper(p_currency),
      due_date = p_due_date,
      status = v_invoice_status,
      notes = v_notes,
      items = COALESCE(p_items, items),
      metadata = CASE
        WHEN p_metadata IS NOT NULL THEN COALESCE(metadata, '{}'::jsonb) || p_metadata
        ELSE metadata
      END,
      updated_at = now()
    WHERE id = v_invoice.id;
  END IF;

  UPDATE public.billing_cycles
  SET
    term_label = p_term_label,
    term_start_date = p_term_start_date,
    due_date = p_due_date,
    amount_due = p_amount_due,
    currency = upper(p_currency),
    status = p_status,
    items = COALESCE(p_items, items),
    updated_at = now()
  WHERE id = p_cycle_id;

  RETURN jsonb_build_object(
    'cycle_id', p_cycle_id,
    'invoice_id', v_cycle.invoice_id,
    'cycle_status', p_status,
    'invoice_status', v_invoice_status
  );
END;
$function$;
ALTER FUNCTION "public"."update_billing_cycle_with_invoice"(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_metadata jsonb, p_notes text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.school_teacher_conversations 
  SET updated_at = NEW.created_at 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_conversation_timestamp"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_feedback_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_flashcard_statistics()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.flashcard_card_statistics (
    card_id,
    total_reviews,
    correct_reviews,
    incorrect_reviews
  )
  VALUES (
    NEW.card_id,
    1,
    CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions > OLD.repetitions) THEN 1 ELSE 0 END,
    CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions <= OLD.repetitions) THEN 1 ELSE 0 END
  )
  ON CONFLICT (card_id) DO UPDATE SET
    total_reviews     = flashcard_card_statistics.total_reviews + 1,
    correct_reviews   = flashcard_card_statistics.correct_reviews
                        + CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions > OLD.repetitions) THEN 1 ELSE 0 END,
    incorrect_reviews = flashcard_card_statistics.incorrect_reviews
                        + CASE WHEN (TG_OP = 'INSERT' OR NEW.repetitions <= OLD.repetitions) THEN 1 ELSE 0 END,
    last_updated      = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_flashcard_statistics"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_last_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE portal_users SET last_login = NOW() WHERE id = NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_last_login"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_live_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
ALTER FUNCTION "public"."update_live_sessions_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_parent_feedback_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
ALTER FUNCTION "public"."update_parent_feedback_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_support_tickets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_support_tickets_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end;
$function$;
ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_xp_summary()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_total integer;
  new_level integer;
BEGIN
  INSERT INTO student_xp_summary (student_id, total_xp, level, this_term_xp, last_updated)
  VALUES (NEW.student_id, NEW.xp, GREATEST(1, NEW.xp / 500 + 1), NEW.xp, now())
  ON CONFLICT (student_id) DO UPDATE
    SET total_xp     = student_xp_summary.total_xp + NEW.xp,
        level        = GREATEST(1, (student_xp_summary.total_xp + NEW.xp) / 500 + 1),
        this_term_xp = student_xp_summary.this_term_xp + CASE WHEN NEW.term_number IS NOT NULL THEN NEW.xp ELSE 0 END,
        last_updated = now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."update_xp_summary"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.validate_form_lead_child_link_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_student_role text;
BEGIN
  SELECT role
    INTO v_student_role
  FROM public.portal_users
  WHERE id = NEW.student_portal_user_id;

  IF v_student_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'form_lead_child_links.student_portal_user_id %s must reference a student-role portal user',
        NEW.student_portal_user_id
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students
    WHERE user_id = NEW.student_portal_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'form_lead_child_links.student_portal_user_id %s has no students row',
        NEW.student_portal_user_id
      );
  END IF;

  IF NEW.status IN ('approved', 'onboarded') AND NEW.linked_at IS NULL THEN
    NEW.linked_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$function$;
ALTER FUNCTION "public"."validate_form_lead_child_link_roles"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.withdraw_receipt_atomic(p_receipt_id uuid, p_actor_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_receipt record;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A withdrawal reason is required';
  END IF;
  SELECT id, receipt_number, transaction_id, amount, currency
    INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;

  IF v_receipt.transaction_id IS NOT NULL THEN
    UPDATE public.payment_transactions SET receipt_url = NULL, updated_at = now()
     WHERE id = v_receipt.transaction_id;
  END IF;
  DELETE FROM public.receipts WHERE id = v_receipt.id;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'transaction_id', v_receipt.transaction_id,
    'amount', v_receipt.amount,
    'currency', v_receipt.currency,
    'actor_id', p_actor_id,
    'reason', trim(p_reason)
  );
END $function$;
ALTER FUNCTION "public"."withdraw_receipt_atomic"(p_receipt_id uuid, p_actor_id uuid, p_reason text) OWNER TO "postgres";


-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."academic_terms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "academic_year" text NOT NULL,
    "term_number" integer NOT NULL,
    "term_label" text NOT NULL,
    "start_date" date,
    "end_date" date,
    "is_current" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."academic_terms" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."account_deletion_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "email" text NOT NULL,
    "full_name" text,
    "account_role" text,
    "reason" text,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone,
    "retention_note" text,
    "admin_note" text
);
ALTER TABLE "public"."account_deletion_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "school_id" uuid,
    "event_type" text NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."activity_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."announcement_reads" (
    "portal_user_id" uuid NOT NULL,
    "announcement_id" uuid NOT NULL,
    "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."announcement_reads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "author_id" uuid,
    "target_audience" text DEFAULT 'all'::text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "school_id" uuid,
    "status" text DEFAULT 'published'::text NOT NULL,
    "expires_at" timestamp with time zone,
    "class_id" uuid
);
ALTER TABLE "public"."announcements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" text NOT NULL,
    "value" text DEFAULT ''::text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."app_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."assignment_submissions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "assignment_id" uuid,
    "user_id" uuid,
    "submission_text" text,
    "file_url" text,
    "submitted_at" timestamp with time zone DEFAULT now(),
    "graded_by" uuid,
    "grade" integer,
    "feedback" text,
    "graded_at" timestamp with time zone,
    "status" text DEFAULT 'submitted'::text,
    "student_id" uuid,
    "portal_user_id" uuid,
    "updated_at" timestamp with time zone DEFAULT now(),
    "answers" jsonb,
    "weighted_score" integer,
    "grading_mode" text,
    "ai_suggested_grade" numeric(5,2),
    "ai_suggested_feedback" text
);
ALTER TABLE "public"."assignment_submissions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "instructions" text,
    "due_date" timestamp with time zone,
    "max_points" integer DEFAULT 100,
    "assignment_type" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid,
    "class_id" uuid,
    "questions" jsonb,
    "school_id" uuid,
    "school_name" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "lesson_id" uuid,
    "weight" integer DEFAULT 0 NOT NULL,
    "grading_mode" text DEFAULT 'manual'::text NOT NULL,
    "program_id" uuid,
    "term_id" uuid
);
ALTER TABLE "public"."assignments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid,
    "user_id" uuid,
    "status" text DEFAULT 'present'::text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "student_id" uuid,
    "recorded_by" uuid,
    "term_id" uuid,
    "class_term_roster_id" uuid
);
ALTER TABLE "public"."attendance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "action" text NOT NULL,
    "table_name" text,
    "record_id" uuid,
    "old_values" jsonb,
    "new_values" jsonb,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "actor_id" uuid,
    "resource_type" text,
    "resource_id" text,
    "old_value" text,
    "new_value" text
);
ALTER TABLE "public"."audit_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "name" text NOT NULL,
    "description" text,
    "icon_url" text,
    "criteria" jsonb,
    "points_value" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."badges" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."balance_reminder_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "every_days" integer DEFAULT 5 NOT NULL,
    "max_reminders" integer DEFAULT 4 NOT NULL,
    "channel_email" boolean DEFAULT true NOT NULL,
    "channel_whatsapp" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."balance_reminder_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_contacts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "representative_name" text,
    "representative_email" text,
    "representative_whatsapp" text,
    "teacher_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "owner_type" text DEFAULT 'school'::text NOT NULL,
    "owner_user_id" uuid
);
ALTER TABLE "public"."billing_contacts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_cycles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "subscription_id" uuid,
    "owner_type" text NOT NULL,
    "owner_school_id" uuid,
    "owner_user_id" uuid,
    "school_id" uuid,
    "invoice_id" uuid,
    "term_label" text NOT NULL,
    "term_start_date" date NOT NULL,
    "due_date" date NOT NULL,
    "amount_due" numeric DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'NGN'::text NOT NULL,
    "status" text DEFAULT 'due'::text NOT NULL,
    "reminder_week6_sent_at" timestamp with time zone,
    "reminder_week7_sent_at" timestamp with time zone,
    "reminder_week8_sent_at" timestamp with time zone,
    "sticky_notice_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "rillcod_retain_amount" numeric,
    "school_settlement_amount" numeric,
    "archived_at" timestamp with time zone,
    "academic_term_id" uuid
);
ALTER TABLE "public"."billing_cycles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_document_archive" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "doc_ref" text NOT NULL,
    "doc_type" text NOT NULL,
    "school_id" uuid,
    "school_name" text,
    "term_label" text,
    "amount" numeric,
    "currency" text DEFAULT 'NGN'::text,
    "invoice_number" text,
    "student_count" integer,
    "period_label" text,
    "due_date" date,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "html_body" text
);
ALTER TABLE "public"."billing_document_archive" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_notices" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_type" text NOT NULL,
    "owner_school_id" uuid,
    "owner_user_id" uuid,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "due_date" date,
    "is_sticky" boolean DEFAULT true NOT NULL,
    "is_resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."billing_notices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."billing_reminder_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "billing_cycle_id" uuid NOT NULL,
    "week_number" integer NOT NULL,
    "channel" text NOT NULL,
    "target" text,
    "status" text DEFAULT 'sent'::text NOT NULL,
    "error_message" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."billing_reminder_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."card_audit_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "card_id" uuid,
    "actor_id" uuid,
    "school_id" uuid,
    "action" text NOT NULL,
    "entity" text DEFAULT 'identity_card'::text NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."card_audit_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."card_scan_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "card_id" uuid NOT NULL,
    "scanned_by" uuid,
    "school_id" uuid,
    "source" text DEFAULT 'web'::text NOT NULL,
    "scan_result" text DEFAULT 'ok'::text NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."card_scan_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cbt_exams" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "program_id" uuid,
    "duration_minutes" integer NOT NULL,
    "total_questions" integer NOT NULL,
    "passing_score" integer DEFAULT 50,
    "is_active" boolean DEFAULT true,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "course_id" uuid,
    "created_by" uuid,
    "metadata" jsonb,
    "school_id" uuid,
    "grading_mode" text DEFAULT 'auto'::text NOT NULL,
    "term_id" uuid,
    "class_id" uuid,
    "lesson_plan_id" uuid,
    "lesson_id" uuid,
    "curriculum_week_number" integer
);
ALTER TABLE "public"."cbt_exams" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cbt_questions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "exam_id" uuid,
    "question_text" text NOT NULL,
    "question_type" text DEFAULT 'multiple_choice'::text,
    "options" jsonb,
    "correct_answer" text,
    "points" integer DEFAULT 1,
    "order_index" integer,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE "public"."cbt_questions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cbt_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "exam_id" uuid,
    "user_id" uuid,
    "start_time" timestamp with time zone DEFAULT now(),
    "end_time" timestamp with time zone,
    "score" integer,
    "status" text DEFAULT 'in_progress'::text,
    "answers" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "needs_grading" boolean DEFAULT false,
    "manual_scores" jsonb DEFAULT '{}'::jsonb,
    "grading_notes" text,
    "deadline" timestamp with time zone
);
ALTER TABLE "public"."cbt_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."certificates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "course_id" uuid,
    "certificate_number" text NOT NULL,
    "verification_code" text NOT NULL,
    "issued_date" date NOT NULL,
    "pdf_url" text,
    "template_id" uuid,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."certificates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."class_lesson_delivery" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "class_id" uuid NOT NULL,
    "academic_term_id" uuid NOT NULL,
    "course_id" uuid NOT NULL,
    "lesson_plan_id" uuid NOT NULL,
    "lesson_id" uuid,
    "class_session_id" uuid,
    "week_number" integer NOT NULL,
    "status" text DEFAULT 'planned'::text NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivered_by" uuid,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."class_lesson_delivery" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."class_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "class_id" uuid,
    "session_date" date NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "topic" text,
    "description" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "title" text,
    "location" text,
    "meeting_url" text,
    "is_online" boolean DEFAULT false,
    "status" text DEFAULT 'scheduled'::text,
    "term_id" uuid
);
ALTER TABLE "public"."class_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."class_term_rosters" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "class_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "term_id" uuid,
    "school_id" uuid,
    "program_id" uuid,
    "status" text DEFAULT 'active'::text NOT NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ended_at" timestamp with time zone,
    "reinstated_at" timestamp with time zone,
    "notes" text,
    "created_by" uuid,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "billing_status" text DEFAULT 'unknown'::text,
    "subscription_status" text DEFAULT 'unknown'::text,
    "invoice_id" uuid,
    "billing_cycle_id" uuid,
    "subscription_id" uuid,
    "billing_checked_at" timestamp with time zone,
    "access_suspended_at" timestamp with time zone,
    "access_suspension_reason" text
);
ALTER TABLE "public"."class_term_rosters" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "program_id" uuid,
    "teacher_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "max_students" integer,
    "start_date" date,
    "end_date" date,
    "status" text DEFAULT 'scheduled'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "schedule" text,
    "current_students" integer DEFAULT 0,
    "school_id" uuid NOT NULL,
    "qa_grade_key" text,
    "qa_grade_mode" text DEFAULT 'optional'::text,
    "qa_grade_band" text,
    "qa_track_hint" text,
    "qa_spine_lane" integer,
    "current_course_id" uuid,
    "term_id" uuid,
    "tier" text,
    "band_lvl" text,
    "band_low" integer,
    "band_high" integer
);
ALTER TABLE "public"."classes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_abuse_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "sender_id" uuid,
    "sender_role" text,
    "channel" text NOT NULL,
    "event_type" text NOT NULL,
    "reason" text NOT NULL,
    "target_conversation_id" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_abuse_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_case_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "case_id" uuid NOT NULL,
    "channel" text NOT NULL,
    "direction" text NOT NULL,
    "source_type" text,
    "source_id" text,
    "subject" text,
    "body" text NOT NULL,
    "actor_id" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "provider" text,
    "provider_message_id" text,
    "delivery_status" text DEFAULT 'recorded'::text NOT NULL,
    "automated" boolean DEFAULT false NOT NULL,
    "template_key" text,
    "external_thread_id" text,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone
);
ALTER TABLE "public"."communication_case_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_cases" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "requester_id" uuid,
    "requester_name" text,
    "requester_email" text,
    "requester_phone" text,
    "school_id" uuid,
    "subject" text NOT NULL,
    "category" text DEFAULT 'general'::text NOT NULL,
    "department" text DEFAULT 'customer_care'::text NOT NULL,
    "priority" text DEFAULT 'normal'::text NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "assigned_to" uuid,
    "first_response_due_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "first_responded_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "channels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "customer_key" uuid,
    "next_action" text DEFAULT 'Review and respond to the customer'::text NOT NULL,
    "next_action_due_at" timestamp with time zone,
    "sensitivity" text DEFAULT 'standard'::text NOT NULL,
    "restricted" boolean DEFAULT false NOT NULL,
    "resolution_summary" text,
    "reopened_count" integer DEFAULT 0 NOT NULL,
    "satisfaction_requested_at" timestamp with time zone,
    "satisfaction_score" integer,
    "outcome" text
);
ALTER TABLE "public"."communication_cases" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_conversation_meta" (
    "conversation_id" uuid NOT NULL,
    "priority" text DEFAULT 'medium'::text NOT NULL,
    "sla_due_at" timestamp with time zone,
    "status" text DEFAULT 'open'::text NOT NULL,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "updated_by" uuid,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "notes" text,
    "reminder_count" integer DEFAULT 0 NOT NULL,
    "last_reminder_at" timestamp with time zone,
    "escalated_at" timestamp with time zone
);
ALTER TABLE "public"."communication_conversation_meta" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_customer_identities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "customer_key" uuid DEFAULT gen_random_uuid() NOT NULL,
    "identity_type" text NOT NULL,
    "identity_value" text NOT NULL,
    "portal_user_id" uuid,
    "verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_customer_identities" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_delivery_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "case_id" uuid,
    "case_event_id" uuid,
    "channel" text NOT NULL,
    "recipient" text,
    "provider" text,
    "provider_message_id" text,
    "status" text DEFAULT 'queued'::text NOT NULL,
    "automated" boolean DEFAULT true NOT NULL,
    "template_key" text,
    "campaign_key" text,
    "error" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_delivery_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_escalations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "target_conversation_id" uuid,
    "target_user_id" uuid,
    "trigger" text NOT NULL,
    "trigger_count" integer DEFAULT 0 NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "notes" text,
    "resolved_by" uuid,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_escalations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_rate_limits" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "sender_id" uuid NOT NULL,
    "sender_role" text NOT NULL,
    "day_bucket" timestamp with time zone NOT NULL,
    "daily_count" integer DEFAULT 0 NOT NULL,
    "last_message_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_rate_limits" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "reporter_id" uuid NOT NULL,
    "reporter_role" text NOT NULL,
    "target_conversation_id" uuid,
    "target_message_id" uuid,
    "reason" text NOT NULL,
    "details" text,
    "status" text DEFAULT 'open'::text NOT NULL,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_reports" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_template_versions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "template_id" uuid NOT NULL,
    "version_number" integer NOT NULL,
    "subject" text,
    "body" text NOT NULL,
    "change_note" text,
    "test_status" text DEFAULT 'untested'::text NOT NULL,
    "test_notes" text,
    "tested_at" timestamp with time zone,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_template_versions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."communication_templates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "template_key" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "category" text DEFAULT 'operations'::text NOT NULL,
    "channel" text NOT NULL,
    "status" text DEFAULT 'draft'::text NOT NULL,
    "required_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "current_version_id" uuid,
    "created_by" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."communication_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."consent_forms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid NOT NULL,
    "title" text NOT NULL,
    "body" text NOT NULL,
    "due_date" timestamp with time zone,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_public" boolean DEFAULT false,
    "form_type" text DEFAULT 'general'::text,
    "class_id" uuid
);
ALTER TABLE "public"."consent_forms" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."consent_responses" (
    "form_id" uuid NOT NULL,
    "parent_id" uuid NOT NULL,
    "signed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "response_data" jsonb
);
ALTER TABLE "public"."consent_responses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."consent_submission_throttle" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "form_id" uuid NOT NULL,
    "ip_hmac" text NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);
ALTER TABLE "public"."consent_submission_throttle" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."content_library" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "created_by" uuid,
    "title" text NOT NULL,
    "description" text,
    "content_type" text,
    "file_id" uuid,
    "category" text,
    "tags" text[],
    "subject" text,
    "grade_level" text,
    "license_type" text,
    "attribution" text,
    "version" integer DEFAULT 1,
    "usage_count" integer DEFAULT 0,
    "rating_average" numeric(3,2),
    "rating_count" integer DEFAULT 0,
    "is_approved" boolean DEFAULT false,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "program_id" uuid
);
ALTER TABLE "public"."content_library" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."content_ratings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "content_id" uuid,
    "portal_user_id" uuid,
    "rating" integer,
    "review" text,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."content_ratings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."course_curricula" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid NOT NULL,
    "school_id" uuid,
    "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_visible_to_school" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."course_curricula" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."course_materials" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "file_url" text,
    "file_type" text,
    "file_size" integer,
    "order_index" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."course_materials" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "program_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "content" text,
    "duration_hours" integer,
    "order_index" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "teacher_id" uuid,
    "school_id" uuid,
    "school_name" text,
    "is_locked" boolean DEFAULT false NOT NULL,
    "level_order" integer DEFAULT 1 NOT NULL,
    "next_course_id" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE "public"."courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_attachments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" text NOT NULL,
    "contact_type" text DEFAULT 'portal_user'::text NOT NULL,
    "contact_name" text NOT NULL,
    "file_name" text NOT NULL,
    "file_key" text NOT NULL,
    "file_type" text,
    "file_size" integer,
    "uploaded_by" uuid,
    "uploaded_by_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_attachments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_interactions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" text NOT NULL,
    "contact_type" text DEFAULT 'portal_user'::text NOT NULL,
    "contact_name" text NOT NULL,
    "type" text DEFAULT 'note'::text NOT NULL,
    "direction" text DEFAULT 'outbound'::text NOT NULL,
    "content" text NOT NULL,
    "staff_id" uuid,
    "staff_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_interactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_opportunities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" text NOT NULL,
    "contact_name" text NOT NULL,
    "stage" text DEFAULT 'new_inquiry'::text NOT NULL,
    "estimated_value" numeric(12,2),
    "source" text,
    "close_probability" integer DEFAULT 10,
    "expected_close_at" timestamp with time zone,
    "owner_id" uuid,
    "owner_name" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_opportunities" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_pipeline" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" text NOT NULL,
    "contact_type" text DEFAULT 'portal_user'::text NOT NULL,
    "contact_name" text,
    "stage" text DEFAULT 'active'::text NOT NULL,
    "pipeline_notes" text,
    "updated_by" uuid,
    "updated_by_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_pipeline" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."crm_tasks" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" text NOT NULL,
    "contact_name" text NOT NULL,
    "title" text NOT NULL,
    "due_at" timestamp with time zone,
    "status" text DEFAULT 'open'::text NOT NULL,
    "priority" text DEFAULT 'medium'::text NOT NULL,
    "owner_id" uuid,
    "owner_name" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."crm_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cron_job_health" (
    "job_name" text NOT NULL,
    "expected_interval_minutes" integer NOT NULL,
    "last_started_at" timestamp with time zone,
    "last_finished_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "next_expected_at" timestamp with time zone,
    "last_status_code" integer,
    "last_duration_ms" integer,
    "last_error" text,
    "last_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "last_alerted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."cron_job_health" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cron_run_history" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "job_name" text NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone NOT NULL,
    "duration_ms" integer NOT NULL,
    "success" boolean NOT NULL,
    "status_code" integer,
    "error" text,
    "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."cron_run_history" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."curriculum_project_registry" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "program_id" uuid,
    "course_id" uuid,
    "project_key" text NOT NULL,
    "title" text NOT NULL,
    "track" text NOT NULL,
    "concept_tags" text[] DEFAULT '{}'::text[] NOT NULL,
    "difficulty_level" integer DEFAULT 1 NOT NULL,
    "classwork_prompt" text,
    "estimated_minutes" integer,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."curriculum_project_registry" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."curriculum_project_usage" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "school_id" uuid NOT NULL,
    "course_id" uuid,
    "lesson_plan_id" uuid,
    "class_id" uuid,
    "year_number" integer NOT NULL,
    "term_number" integer NOT NULL,
    "week_number" integer NOT NULL,
    "is_repeat" boolean DEFAULT false NOT NULL,
    "used_at" timestamp with time zone DEFAULT now() NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE "public"."curriculum_project_usage" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."curriculum_week_performance" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid NOT NULL,
    "lesson_plan_id" uuid NOT NULL,
    "course_id" uuid,
    "class_id" uuid,
    "student_id" uuid NOT NULL,
    "year_number" integer NOT NULL,
    "term_number" integer NOT NULL,
    "week_number" integer NOT NULL,
    "practical_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "completion_seconds" integer DEFAULT 0 NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "recorded_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."curriculum_week_performance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."curriculum_week_tracking" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "curriculum_id" uuid NOT NULL,
    "school_id" uuid,
    "term_number" integer NOT NULL,
    "week_number" integer NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "teacher_notes" text,
    "actual_date" date,
    "completed_by" uuid,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "class_id" uuid,
    "lesson_plan_id" uuid
);
ALTER TABLE "public"."curriculum_week_tracking" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."customer_contact_book" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "role" text NOT NULL,
    "full_name" text NOT NULL,
    "email" text,
    "phone" text,
    "school_name" text,
    "class_name" text,
    "source" text DEFAULT 'unknown'::text NOT NULL,
    "last_channel" text DEFAULT 'unknown'::text NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."customer_contact_book" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."customer_value_outcomes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "case_id" uuid,
    "feedback_id" uuid,
    "portal_user_id" uuid,
    "outcome_type" text NOT NULL,
    "score" integer,
    "comment" text,
    "source" text DEFAULT 'customer'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."customer_value_outcomes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."device_push_tokens" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "token" text NOT NULL,
    "platform" text NOT NULL,
    "device_hint" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."device_push_tokens" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."discussion_attachments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "topic_id" uuid,
    "reply_id" uuid,
    "file_id" uuid,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."discussion_attachments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."discussion_replies" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "topic_id" uuid,
    "parent_reply_id" uuid,
    "created_by" uuid,
    "content" text NOT NULL,
    "upvotes" integer DEFAULT 0,
    "is_accepted_answer" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."discussion_replies" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."discussion_topics" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "created_by" uuid,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "is_pinned" boolean DEFAULT false,
    "is_locked" boolean DEFAULT false,
    "is_resolved" boolean DEFAULT false,
    "upvotes" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."discussion_topics" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."dismissed_duplicate_pairs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "pair_key" text NOT NULL,
    "student_a" uuid,
    "student_b" uuid,
    "reason" text,
    "dismissed_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."dismissed_duplicate_pairs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."email_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid,
    "event" text NOT NULL,
    "email" text,
    "occurred_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."email_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."email_thread_links" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "case_id" uuid NOT NULL,
    "provider" text,
    "provider_message_id" text,
    "internet_message_id" text,
    "subject_token" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."email_thread_links" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."engage_posts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "author_name" text NOT NULL,
    "content" text NOT NULL,
    "code_snippet" text,
    "language" text,
    "likes" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."engage_posts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."enrollment_term_grades" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "enrollment_id" uuid NOT NULL,
    "term_id" uuid NOT NULL,
    "grade" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."enrollment_term_grades" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "program_id" uuid,
    "role" text NOT NULL,
    "enrollment_date" date DEFAULT CURRENT_DATE NOT NULL,
    "status" text DEFAULT 'active'::text,
    "completion_date" date,
    "grade" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "progress_pct" integer DEFAULT 0,
    "last_activity_at" timestamp with time zone
);
ALTER TABLE "public"."enrollments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."exam_attempts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "exam_id" uuid,
    "portal_user_id" uuid,
    "attempt_number" integer DEFAULT 1,
    "started_at" timestamp with time zone DEFAULT now(),
    "submitted_at" timestamp with time zone,
    "score" integer,
    "total_points" integer,
    "percentage" numeric(5,2),
    "status" text,
    "answers" jsonb,
    "tab_switches" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."exam_attempts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."exam_questions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "exam_id" uuid,
    "question_text" text NOT NULL,
    "question_type" text,
    "points" integer DEFAULT 1,
    "order_index" integer,
    "options" jsonb,
    "correct_answer" jsonb,
    "explanation" text,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."exam_questions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."exams" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "duration_minutes" integer,
    "total_points" integer DEFAULT 100,
    "passing_score" integer DEFAULT 70,
    "randomize_questions" boolean DEFAULT true,
    "randomize_options" boolean DEFAULT true,
    "max_attempts" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."exams" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "user_name" text NOT NULL,
    "user_email" text,
    "user_role" text,
    "type" text NOT NULL,
    "rating" integer,
    "subject" text NOT NULL,
    "message" text NOT NULL,
    "status" text DEFAULT 'new'::text NOT NULL,
    "admin_response" text,
    "responded_at" timestamp with time zone,
    "responded_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now(),
    "assigned_to" uuid,
    "assigned_at" timestamp with time zone,
    "department" text DEFAULT 'customer_care'::text NOT NULL,
    "priority" text DEFAULT 'normal'::text NOT NULL,
    "first_response_due_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "reopened_count" integer DEFAULT 0 NOT NULL,
    "reopened_at" timestamp with time zone,
    "resolution_minutes" integer,
    "satisfaction_score" integer,
    "outcome" text
);
ALTER TABLE "public"."feedback" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "uploaded_by" uuid,
    "filename" text NOT NULL,
    "original_filename" text NOT NULL,
    "file_type" text NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" text,
    "storage_path" text NOT NULL,
    "storage_provider" text,
    "public_url" text,
    "thumbnail_url" text,
    "is_virus_scanned" boolean DEFAULT false,
    "virus_scan_result" text,
    "download_count" integer DEFAULT 0,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."files" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."finance_automation_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "stream" text NOT NULL,
    "action" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" uuid NOT NULL,
    "stage" text,
    "channel" text DEFAULT 'email'::text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "error" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."finance_automation_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flagged_content" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "reporter_id" uuid,
    "content_type" text NOT NULL,
    "content_id" uuid NOT NULL,
    "reason" text NOT NULL,
    "status" text DEFAULT 'pending'::text,
    "moderator_id" uuid,
    "moderator_notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."flagged_content" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flashcard_card_statistics" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "card_id" uuid NOT NULL,
    "total_reviews" integer DEFAULT 0 NOT NULL,
    "correct_reviews" integer DEFAULT 0 NOT NULL,
    "incorrect_reviews" integer DEFAULT 0 NOT NULL,
    "average_confidence" numeric(3,2) DEFAULT 3.00,
    "last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."flashcard_card_statistics" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flashcard_cards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "deck_id" uuid NOT NULL,
    "front" text NOT NULL,
    "back" text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "front_image_url" text,
    "back_image_url" text,
    "tags" text[] DEFAULT '{}'::text[],
    "difficulty_level" text DEFAULT 'medium'::text,
    "is_starred" boolean DEFAULT false,
    "notes" text,
    "updated_at" timestamp with time zone DEFAULT now(),
    "template" text DEFAULT 'classic'::text
);
ALTER TABLE "public"."flashcard_cards" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flashcard_decks" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "lesson_id" uuid,
    "course_id" uuid,
    "school_id" uuid,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_public" boolean DEFAULT false,
    "description" text,
    "tags" text[] DEFAULT '{}'::text[],
    "updated_at" timestamp with time zone DEFAULT now(),
    "school_progression_enabled" boolean DEFAULT false NOT NULL,
    "progression_track" text,
    "progression_delivery_mode" text,
    "progression_weekly_frequency" integer,
    "progression_policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "term_id" uuid,
    "class_id" uuid,
    "lesson_plan_id" uuid,
    "curriculum_week_number" integer
);
ALTER TABLE "public"."flashcard_decks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flashcard_reviews" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "card_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
    "interval_days" integer DEFAULT 1 NOT NULL,
    "ease_factor" numeric(4,2) DEFAULT 2.50 NOT NULL,
    "repetitions" integer DEFAULT 0 NOT NULL,
    "study_time_seconds" integer DEFAULT 0,
    "confidence_level" integer DEFAULT 3,
    "last_reviewed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."flashcard_reviews" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."flashcard_study_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "deck_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "cards_studied" integer DEFAULT 0 NOT NULL,
    "cards_correct" integer DEFAULT 0 NOT NULL,
    "cards_incorrect" integer DEFAULT 0 NOT NULL,
    "max_streak" integer DEFAULT 0 NOT NULL,
    "study_duration_seconds" integer DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."flashcard_study_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."form_lead_child_links" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lead_id" uuid NOT NULL,
    "child_index" integer NOT NULL,
    "student_portal_user_id" uuid NOT NULL,
    "status" text DEFAULT 'approved'::text NOT NULL,
    "source" text NOT NULL,
    "linked_at" timestamp with time zone,
    "linked_by" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."form_lead_child_links" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."form_leads" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "form_id" uuid NOT NULL,
    "school_id" uuid,
    "matched_school_id" uuid,
    "child_current_school" text,
    "email" text,
    "response_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT now(),
    "status" text DEFAULT 'new'::text,
    "contact_id" uuid,
    "prospect_id" uuid,
    "match_status" text DEFAULT 'unreviewed'::text,
    "match_candidate_id" uuid,
    "match_confidence" text,
    "match_notes" text,
    "matched_student_id" uuid,
    "matched_parent_id" uuid
);
ALTER TABLE "public"."form_leads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "template_id" uuid,
    "generated_by" uuid,
    "report_name" text NOT NULL,
    "report_data" jsonb,
    "file_url" text,
    "generated_at" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."generated_reports" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."grade_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "portal_user_id" uuid,
    "program_id" uuid,
    "total_assignments" integer DEFAULT 0,
    "graded_assignments" integer DEFAULT 0,
    "average_score" numeric(5,2),
    "highest_score" numeric(5,2),
    "lowest_score" numeric(5,2),
    "letter_grade" text,
    "generated_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."grade_reports" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."identity_cards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "holder_type" text NOT NULL,
    "holder_id" uuid NOT NULL,
    "school_id" uuid,
    "class_id" uuid,
    "card_number" text NOT NULL,
    "verification_code" text NOT NULL,
    "status" text DEFAULT 'issued'::text NOT NULL,
    "template_type" text DEFAULT 'student'::text NOT NULL,
    "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
    "activated_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_reason" text,
    "created_by" uuid,
    "updated_by" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."identity_cards" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."instalment_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "plan_id" uuid NOT NULL,
    "amount" numeric NOT NULL,
    "due_date" date NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "paid_at" timestamp with time zone,
    "transaction_ref" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."instalment_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."instalment_plans" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid NOT NULL,
    "parent_id" uuid NOT NULL,
    "total_amount" numeric NOT NULL,
    "currency" text DEFAULT 'NGN'::text NOT NULL,
    "status" text DEFAULT 'active'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."instalment_plans" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."invoice_automation_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "triggered_by" text NOT NULL,
    "invoices_scanned" integer DEFAULT 0 NOT NULL,
    "reminders_sent" integer DEFAULT 0 NOT NULL,
    "overdue_marked" integer DEFAULT 0 NOT NULL,
    "errors" integer DEFAULT 0 NOT NULL,
    "details" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."invoice_automation_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."invoice_payment_proofs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid NOT NULL,
    "submitted_by" uuid NOT NULL,
    "proof_image_url" text NOT NULL,
    "payer_note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "admin_note" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone
);
ALTER TABLE "public"."invoice_payment_proofs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "invoice_number" text NOT NULL,
    "school_id" uuid,
    "portal_user_id" uuid,
    "amount" numeric DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'NGN'::text,
    "status" text DEFAULT 'draft'::text,
    "due_date" timestamp with time zone,
    "items" jsonb DEFAULT '[]'::jsonb,
    "notes" text,
    "payment_link" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "payment_transaction_id" uuid,
    "reminder_1_sent_at" timestamp with time zone,
    "reminder_2_sent_at" timestamp with time zone,
    "reminder_3_sent_at" timestamp with time zone,
    "stream" text DEFAULT 'individual'::text NOT NULL,
    "billing_cycle_id" uuid,
    "original_amount" numeric DEFAULT 0 NOT NULL,
    "amount_paid" numeric DEFAULT 0 NOT NULL,
    "amount_remaining" numeric DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."invoices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lab_projects" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "title" text NOT NULL,
    "language" text NOT NULL,
    "code" text,
    "blocks_xml" text,
    "preview_url" text,
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "lesson_id" uuid,
    "assignment_id" uuid
);
ALTER TABLE "public"."lab_projects" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."leaderboards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "portal_user_id" uuid,
    "points" integer DEFAULT 0,
    "rank" integer,
    "period_start" date,
    "period_end" date,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."leaderboards" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lesson_materials" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lesson_id" uuid,
    "title" text NOT NULL,
    "file_url" text NOT NULL,
    "file_type" text,
    "is_public" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."lesson_materials" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lesson_plans" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lesson_id" uuid,
    "objectives" text,
    "activities" text,
    "assessment_methods" text,
    "staff_notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "summary_notes" text,
    "plan_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "status" text DEFAULT 'draft'::text NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "curriculum_version_id" uuid,
    "term_start" date,
    "term_end" date,
    "sessions_per_week" integer,
    "school_id" uuid,
    "course_id" uuid,
    "class_id" uuid,
    "term" text,
    "created_by" uuid,
    "term_id" uuid
);
ALTER TABLE "public"."lesson_plans" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lesson_id" uuid,
    "portal_user_id" uuid,
    "status" text DEFAULT 'not_started'::text,
    "progress_percentage" integer DEFAULT 0,
    "time_spent_minutes" integer DEFAULT 0,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "last_accessed_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "lesson_type" text,
    "status" text DEFAULT 'draft'::text,
    "duration_minutes" integer,
    "session_date" timestamp with time zone,
    "video_url" text,
    "content" text,
    "order_index" integer,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "content_layout" jsonb DEFAULT '[]'::jsonb,
    "lesson_notes" text,
    "school_id" uuid,
    "school_name" text,
    "metadata" jsonb,
    "lesson_plan_id" uuid,
    "class_id" uuid,
    "academic_term_id" uuid,
    "curriculum_week_number" integer
);
ALTER TABLE "public"."lessons" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_attendance" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid,
    "portal_user_id" uuid,
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_attendance" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_breakout_participants" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "room_id" uuid NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_breakout_participants" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_breakout_rooms" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "name" text NOT NULL,
    "max_participants" integer,
    "created_by" uuid,
    "status" text DEFAULT 'active'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_breakout_rooms" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_poll_options" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "poll_id" uuid NOT NULL,
    "option_text" text NOT NULL,
    "order_index" integer,
    "is_correct" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_poll_options" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_poll_responses" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "poll_id" uuid NOT NULL,
    "option_id" uuid NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_poll_responses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_polls" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "question" text NOT NULL,
    "poll_type" text DEFAULT 'poll'::text,
    "status" text DEFAULT 'draft'::text,
    "allow_multiple" boolean DEFAULT false,
    "created_by" uuid,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."live_session_polls" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_session_questions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "body" text NOT NULL,
    "answered" boolean DEFAULT false,
    "answer" text,
    "answered_by" uuid,
    "answered_at" timestamp with time zone,
    "upvotes" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."live_session_questions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."live_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "host_id" uuid NOT NULL,
    "school_id" uuid,
    "program_id" uuid,
    "session_url" text,
    "platform" text DEFAULT 'zoom'::text NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "status" text DEFAULT 'scheduled'::text NOT NULL,
    "recording_url" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."live_sessions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."marketing_campaigns" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "campaign_key" text NOT NULL,
    "name" text NOT NULL,
    "purpose" text DEFAULT 'marketing'::text NOT NULL,
    "status" text DEFAULT 'draft'::text NOT NULL,
    "owner_id" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "scheduled_for" timestamp with time zone,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "delivered_count" integer DEFAULT 0 NOT NULL,
    "viewed_count" integer DEFAULT 0 NOT NULL,
    "response_count" integer DEFAULT 0 NOT NULL,
    "conversion_count" integer DEFAULT 0 NOT NULL,
    "suppressed_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marketing_campaigns" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."marketing_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "campaign_id" uuid NOT NULL,
    "portal_user_id" uuid,
    "event_type" text NOT NULL,
    "channel" text NOT NULL,
    "reason" text,
    "source_id" text,
    "value" numeric,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marketing_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."marketing_suppressions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "identity_type" text NOT NULL,
    "identity_value" text NOT NULL,
    "channel" text NOT NULL,
    "reason" text NOT NULL,
    "source" text DEFAULT 'user_preference'::text NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marketing_suppressions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "sender_id" uuid,
    "recipient_id" uuid,
    "subject" text,
    "message" text NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "read_at" timestamp with time zone
);
ALTER TABLE "public"."messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."newsletter_delivery" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "newsletter_id" uuid,
    "user_id" uuid,
    "is_viewed" boolean DEFAULT false,
    "delivered_at" timestamp with time zone DEFAULT now(),
    "status" text DEFAULT 'delivered'::text NOT NULL,
    "email_status" text,
    "suppressed_reason" text,
    "campaign_id" uuid,
    "viewed_at" timestamp with time zone
);
ALTER TABLE "public"."newsletter_delivery" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."newsletters" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "image_url" text,
    "author_id" uuid,
    "status" text DEFAULT 'draft'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "published_at" timestamp with time zone,
    "school_id" uuid,
    "scheduled_for" timestamp with time zone,
    "scheduled_target" text,
    "scheduled_send_email" boolean DEFAULT false NOT NULL,
    "purpose" text DEFAULT 'service'::text NOT NULL,
    "campaign_id" uuid
);
ALTER TABLE "public"."newsletters" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notification_dead_letters" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "source" text DEFAULT 'notification_queue'::text NOT NULL,
    "job_type" text NOT NULL,
    "original_job_id" text,
    "user_id" uuid,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "error" text NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "last_retry_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" uuid,
    "resolution_note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."notification_dead_letters" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "email_enabled" boolean DEFAULT true,
    "sms_enabled" boolean DEFAULT false,
    "push_enabled" boolean DEFAULT true,
    "assignment_reminders" boolean DEFAULT true,
    "grade_notifications" boolean DEFAULT true,
    "announcement_notifications" boolean DEFAULT true,
    "discussion_replies" boolean DEFAULT true,
    "marketing_emails" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "payment_updates" boolean DEFAULT true NOT NULL,
    "report_published" boolean DEFAULT true NOT NULL,
    "attendance_alerts" boolean DEFAULT true NOT NULL,
    "weekly_summary" boolean DEFAULT true NOT NULL,
    "streak_reminder" boolean DEFAULT true NOT NULL
);
ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "subject" text,
    "content" text NOT NULL,
    "variables" jsonb,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."notification_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "type" text DEFAULT 'info'::text,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "read_at" timestamp with time zone,
    "action_url" text,
    "notification_channel" text,
    "sent_at" timestamp with time zone,
    "delivery_status" text,
    "retry_count" integer DEFAULT 0,
    "external_id" text
);
ALTER TABLE "public"."notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."operations_duty_rota" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "staff_id" uuid NOT NULL,
    "duty_kind" text DEFAULT 'general_service'::text NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "is_primary" boolean DEFAULT true NOT NULL,
    "status" text DEFAULT 'scheduled'::text NOT NULL,
    "notes" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."operations_duty_rota" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."operations_staff_settings" (
    "user_id" uuid NOT NULL,
    "is_primary_admin" boolean DEFAULT false NOT NULL,
    "accepts_general_queue" boolean DEFAULT true NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "unavailable_until" timestamp with time zone,
    "max_active_cases" integer DEFAULT 8 NOT NULL,
    "skill_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "notes" text,
    "updated_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."operations_staff_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_claim_audit" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "parent_id" uuid,
    "email" text,
    "phone" text,
    "action" text NOT NULL,
    "siblings_linked" integer DEFAULT 0 NOT NULL,
    "ip" text,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."parent_claim_audit" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_claim_otps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "full_name" text NOT NULL,
    "email" text NOT NULL,
    "phone" text,
    "relationship" text,
    "child_name" text,
    "code_hash" text NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "child_gender" text,
    "child_age" integer,
    "whatsapp_opt_in" boolean DEFAULT false NOT NULL,
    "child_dob" date
);
ALTER TABLE "public"."parent_claim_otps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_feedback" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "category" text DEFAULT 'General Experience'::text NOT NULL,
    "rating" smallint,
    "message" text NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."parent_feedback" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_student_links" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."parent_student_links" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_teacher_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "thread_id" uuid NOT NULL,
    "sender_id" uuid NOT NULL,
    "body" text NOT NULL,
    "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."parent_teacher_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."parent_teacher_threads" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "parent_id" uuid NOT NULL,
    "teacher_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."parent_teacher_threads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payment_accounts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_type" text DEFAULT 'school'::text NOT NULL,
    "school_id" uuid,
    "label" text NOT NULL,
    "bank_name" text NOT NULL,
    "account_number" text NOT NULL,
    "account_name" text NOT NULL,
    "account_type" text DEFAULT 'savings'::text NOT NULL,
    "payment_note" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."payment_accounts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "payment_transaction_id" uuid NOT NULL,
    "invoice_id" uuid NOT NULL,
    "amount" numeric NOT NULL,
    "currency" text DEFAULT 'NGN'::text NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "portal_user_id" uuid,
    "course_id" uuid,
    "amount" numeric(10,2) NOT NULL,
    "currency" text DEFAULT 'NGN'::text,
    "payment_method" text,
    "payment_status" text DEFAULT 'pending'::text,
    "transaction_reference" text,
    "external_transaction_id" text,
    "payment_gateway_response" jsonb,
    "paid_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "refund_reason" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "receipt_url" text,
    "invoice_id" uuid
);
ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "program_id" uuid,
    "amount" numeric(10,2) NOT NULL,
    "payment_method" text DEFAULT 'cash'::text,
    "payment_status" text DEFAULT 'pending'::text,
    "transaction_reference" text,
    "payment_date" timestamp with time zone,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "student_id" uuid,
    "transaction_id" text
);
ALTER TABLE "public"."payments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."platform_syllabus_week_template" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "catalog_version" text DEFAULT 'qa_spine_v1'::text NOT NULL,
    "program_id" uuid NOT NULL,
    "lane_index" integer NOT NULL,
    "track" text NOT NULL,
    "grade_key" text NOT NULL,
    "grade_label" text NOT NULL,
    "syllabus_phase" text NOT NULL,
    "year_number" integer NOT NULL,
    "term_number" integer NOT NULL,
    "week_number" integer NOT NULL,
    "week_index" integer NOT NULL,
    "topic" text NOT NULL,
    "subtopics" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."platform_syllabus_week_template" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."point_transactions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "points" integer NOT NULL,
    "activity_type" text NOT NULL,
    "reference_id" uuid,
    "description" text,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."point_transactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."portal_users" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "full_name" text NOT NULL,
    "role" text NOT NULL,
    "phone" text,
    "school_name" text,
    "is_active" boolean DEFAULT true,
    "email_verified" boolean DEFAULT false,
    "profile_image_url" text,
    "bio" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "student_id" uuid,
    "is_deleted" boolean DEFAULT false,
    "last_login" timestamp with time zone,
    "school_id" uuid,
    "enrollment_type" text,
    "reputation_score" integer DEFAULT 0,
    "section_class" text,
    "current_module" text,
    "date_of_birth" date,
    "photo_url" text,
    "created_by" uuid,
    "is_direct_enrollment" boolean DEFAULT false,
    "avatar_url" text,
    "class_id" uuid,
    "metadata" jsonb,
    "portfolio_share_token" text,
    "portfolio_share_token_expires_at" timestamp with time zone,
    "whatsapp_opt_in" boolean DEFAULT false,
    "primary_teacher_id" uuid,
    "gender" text,
    "grade" text,
    "duplicate_name_exception_reason" text,
    "duplicate_name_exception_key" text,
    "duplicate_name_exception_approved_by" uuid,
    "duplicate_name_exception_approved_at" timestamp with time zone,
    "class_arm" text
);
ALTER TABLE "public"."portal_users" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."portfolio_projects" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "category" text DEFAULT 'Coding'::text NOT NULL,
    "tags" text[] DEFAULT '{}'::text[] NOT NULL,
    "project_url" text,
    "image_url" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."portfolio_projects" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "duration_weeks" integer,
    "difficulty_level" text,
    "price" numeric(10,2),
    "max_students" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "school_id" uuid,
    "instalments_enabled" boolean DEFAULT false NOT NULL,
    "default_currency" text DEFAULT 'NGN'::text NOT NULL,
    "delivery_type" text DEFAULT 'compulsory'::text NOT NULL,
    "program_scope" text DEFAULT 'regular_school'::text NOT NULL,
    "school_progression_enabled" boolean DEFAULT false NOT NULL,
    "session_frequency_per_week" integer DEFAULT 1 NOT NULL,
    "progression_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "visible_to_teachers" boolean DEFAULT false NOT NULL,
    "visible_to_students" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."programs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."progression_override_audit" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lesson_plan_id" uuid NOT NULL,
    "school_id" uuid,
    "actor_id" uuid,
    "actor_role" text,
    "year_number" integer,
    "term_number" integer,
    "week_number" integer,
    "action_type" text NOT NULL,
    "reason" text,
    "before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."progression_override_audit" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."project_engagement" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "assignment_id" uuid,
    "event_type" text NOT NULL,
    "score" numeric(5,2),
    "is_showcase" boolean DEFAULT false,
    "has_nigerian_context" boolean DEFAULT false,
    "used_ai_tools" boolean DEFAULT false,
    "feedback" text,
    "school_id" uuid,
    "curriculum_id" uuid,
    "term_number" integer,
    "week_number" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."project_engagement" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."project_group_members" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "group_id" uuid NOT NULL,
    "student_id" uuid NOT NULL,
    "individual_score" numeric(5,2),
    "individual_feedback" text,
    "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
    "task_description" text
);
ALTER TABLE "public"."project_group_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."project_groups" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "assignment_id" uuid,
    "class_id" uuid,
    "class_name" text,
    "school_id" uuid,
    "school_name" text,
    "created_by" uuid,
    "evaluation_type" text DEFAULT 'individual'::text NOT NULL,
    "group_score" numeric(5,2),
    "group_feedback" text,
    "is_graded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."project_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."prospective_students" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "full_name" text NOT NULL,
    "email" text NOT NULL,
    "parent_name" text,
    "parent_phone" text,
    "parent_email" text,
    "grade" text,
    "age" integer,
    "gender" text,
    "school_id" uuid,
    "school_name" text,
    "course_interest" text,
    "preferred_schedule" text,
    "hear_about_us" text,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."prospective_students" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "receipt_number" text NOT NULL,
    "transaction_id" uuid,
    "student_id" uuid,
    "school_id" uuid,
    "amount" numeric NOT NULL,
    "currency" text DEFAULT 'NGN'::text,
    "issued_at" timestamp with time zone DEFAULT now(),
    "pdf_url" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "stream" text DEFAULT 'individual'::text NOT NULL
);
ALTER TABLE "public"."receipts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."registration_batches" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid,
    "school_id" uuid,
    "school_name" text,
    "program_id" uuid,
    "class_id" uuid,
    "class_name" text,
    "student_count" integer DEFAULT 0,
    "class_arm" text
);
ALTER TABLE "public"."registration_batches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."registration_results" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "batch_id" uuid NOT NULL,
    "full_name" text NOT NULL,
    "email" text NOT NULL,
    "password" text NOT NULL,
    "class_name" text,
    "status" text NOT NULL,
    "error" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "class_arm" text
);
ALTER TABLE "public"."registration_results" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."report_settings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "teacher_id" uuid,
    "org_name" text DEFAULT 'Rillcod Technologies'::text,
    "org_tagline" text DEFAULT 'Excellence in Educational Technology'::text,
    "org_address" text DEFAULT '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City'::text,
    "org_phone" text DEFAULT '08116600091'::text,
    "org_email" text DEFAULT 'rillcod@gmail.com'::text,
    "org_website" text DEFAULT 'www.rillcod.com'::text,
    "logo_url" text,
    "default_term" text DEFAULT 'Termly'::text,
    "default_instructor" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."report_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."report_templates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "template_type" text DEFAULT 'student_progress'::text,
    "query_template" text,
    "parameters" jsonb,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."report_templates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."result_access_codes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "school_id" uuid,
    "access_code" text NOT NULL,
    "code_source" text DEFAULT 'fnv1a_uuid_v1'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."result_access_codes" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."safeguarding_incidents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "case_id" uuid NOT NULL,
    "incident_type" text NOT NULL,
    "risk_level" text DEFAULT 'high'::text NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "owner_id" uuid,
    "summary" text NOT NULL,
    "actions_taken" text,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."safeguarding_incidents" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_performance_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid NOT NULL,
    "title" text NOT NULL,
    "period_start" date NOT NULL,
    "academic_term_id" uuid,
    "academic_year" text NOT NULL,
    "term_label" text NOT NULL,
    "period_end" date NOT NULL,
    "curriculum_start_term" integer DEFAULT 1 NOT NULL,
    "curriculum_start_week" integer DEFAULT 1 NOT NULL,
    "curriculum_end_term" integer DEFAULT 1 NOT NULL,
    "curriculum_end_week" integer DEFAULT 12 NOT NULL,
    "status" text DEFAULT 'draft'::text NOT NULL,
    "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "narrative" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_by" uuid NOT NULL,
    "published_by" uuid,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "design" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "lock_version" integer DEFAULT 1 NOT NULL,
    "working_revision_number" integer,
    "published_revision_number" integer,
    "verification_code" text,
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" uuid,
    "acknowledgement_name" text,
    "acknowledgement_note" text
);
ALTER TABLE "public"."school_performance_reports" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_report_comments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "revision_id" uuid,
    "author_id" uuid NOT NULL,
    "body" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."school_report_comments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_report_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "revision_id" uuid,
    "event_type" text NOT NULL,
    "actor_id" uuid,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."school_report_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_report_readiness_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "school_id" uuid NOT NULL,
    "academic_term_id" uuid,
    "status" text NOT NULL,
    "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "notified_at" timestamp with time zone
);
ALTER TABLE "public"."school_report_readiness_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_report_revisions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "revision_number" integer NOT NULL,
    "status" text DEFAULT 'working'::text NOT NULL,
    "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "narrative" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "design" jsonb,
    "data_sources" jsonb,
    "created_by" uuid NOT NULL,
    "published_by" uuid,
    "published_at" timestamp with time zone,
    "change_reason" text,
    "pdf_hash" text,
    "force_publish_override" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."school_report_revisions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_settlements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid NOT NULL,
    "billing_cycle_id" uuid,
    "amount" numeric NOT NULL,
    "currency" text DEFAULT 'NGN'::text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "reference" text,
    "notes" text,
    "paid_at" timestamp with time zone,
    "paid_by" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."school_settlements" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_teacher_conversations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid NOT NULL,
    "teacher_id" uuid NOT NULL,
    "subject" text NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."school_teacher_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_teacher_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "sender_id" uuid NOT NULL,
    "body" text NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."school_teacher_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."school_whatsapp_settings" (
    "school_id" uuid NOT NULL,
    "is_enabled" boolean DEFAULT true,
    "human_takeover_timeout_minutes" integer DEFAULT 30,
    "custom_rules" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."school_whatsapp_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "address" text,
    "city" text,
    "state" text,
    "contact_person" text,
    "phone" text,
    "email" text,
    "student_count" integer,
    "created_at" timestamp with time zone DEFAULT now(),
    "school_type" text,
    "lga" text,
    "program_interest" text[],
    "updated_at" timestamp with time zone DEFAULT now(),
    "status" text DEFAULT 'pending'::text,
    "is_active" boolean DEFAULT true,
    "is_deleted" boolean DEFAULT false,
    "enrollment_types" text[] DEFAULT ARRAY['school'::text],
    "rillcod_quota_percent" numeric DEFAULT 0,
    "commission_rate" numeric DEFAULT 15 NOT NULL,
    "default_band_granularity" text DEFAULT 'fixed'::text,
    "public_enrollment_open" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."schools" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."session_recordings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "school_id" uuid,
    "program_id" uuid,
    "class_id" uuid,
    "title" text,
    "egress_id" text,
    "r2_key" text,
    "status" text DEFAULT 'recording'::text NOT NULL,
    "duration_seconds" integer,
    "size_bytes" bigint,
    "error" text,
    "started_by" uuid,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "lesson_id" uuid
);
ALTER TABLE "public"."session_recordings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."showcase_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "school_id" uuid,
    "title" text NOT NULL,
    "description" text,
    "file_url" text,
    "thumbnail_url" text,
    "item_type" text DEFAULT 'project'::text NOT NULL,
    "assignment_id" uuid,
    "course_name" text,
    "term_number" integer,
    "academic_year" text DEFAULT to_char(now(), 'YYYY'::text) NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "pinned_by" uuid,
    "teacher_note" text,
    "views" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."showcase_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."special_program_pages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "program_id" uuid,
    "slug" text NOT NULL,
    "title" text NOT NULL,
    "button_label" text DEFAULT 'Special Program'::text NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "starts_on" date,
    "ends_on" date,
    "registration_deadline" date,
    "online_fee" numeric(12,2) DEFAULT 50000 NOT NULL,
    "onsite_fee" numeric(12,2) DEFAULT 100000 NOT NULL,
    "deposit_percent" numeric(5,2) DEFAULT 50 NOT NULL,
    "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."special_program_pages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_assignment_engagement" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "school_id" uuid,
    "course_id" uuid,
    "term_number" integer NOT NULL,
    "academic_year" text DEFAULT to_char(now(), 'YYYY'::text) NOT NULL,
    "total_assigned" integer DEFAULT 0 NOT NULL,
    "total_submitted" integer DEFAULT 0 NOT NULL,
    "on_time_count" integer DEFAULT 0 NOT NULL,
    "late_count" integer DEFAULT 0 NOT NULL,
    "submission_pct" numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (total_assigned > 0) THEN round((((total_submitted)::numeric / (total_assigned)::numeric) * (100)::numeric), 2)
    ELSE 100.00
END) STORED,
    "last_submission" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_assignment_engagement" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_badges" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "badge_key" text NOT NULL,
    "badge_label" text NOT NULL,
    "badge_icon" text DEFAULT '🏅'::text NOT NULL,
    "earned_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ref_id" uuid,
    "school_id" uuid
);
ALTER TABLE "public"."student_badges" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_enrollments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "program_id" uuid,
    "enrollment_date" date DEFAULT CURRENT_DATE NOT NULL,
    "status" text DEFAULT 'active'::text,
    "completion_date" date,
    "grade" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."student_enrollments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_level_enrollments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "course_id" uuid NOT NULL,
    "school_id" uuid,
    "program_id" uuid,
    "cohort_year" integer DEFAULT (EXTRACT(year FROM now()))::integer NOT NULL,
    "term_label" text NOT NULL,
    "start_week" integer DEFAULT 1 NOT NULL,
    "status" text DEFAULT 'active'::text NOT NULL,
    "promoted_to" uuid,
    "module_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_level_enrollments" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_progress" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid,
    "portal_user_id" uuid,
    "course_id" uuid,
    "lessons_completed" integer DEFAULT 0,
    "total_lessons" integer DEFAULT 0,
    "assignments_completed" integer DEFAULT 0,
    "total_assignments" integer DEFAULT 0,
    "average_grade" numeric(5,2),
    "started_at" timestamp with time zone DEFAULT now(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."student_progress" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_progress_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "teacher_id" uuid,
    "school_id" uuid,
    "course_id" uuid,
    "student_name" text,
    "school_name" text,
    "section_class" text,
    "course_name" text,
    "report_date" date DEFAULT CURRENT_DATE,
    "report_term" text DEFAULT 'Termly'::text,
    "report_period" text,
    "instructor_name" text,
    "current_module" text,
    "next_module" text,
    "learning_milestones" text[],
    "course_duration" text,
    "theory_score" numeric(5,2) DEFAULT 0,
    "practical_score" numeric(5,2) DEFAULT 0,
    "attendance_score" numeric(5,2) DEFAULT 0,
    "overall_score" numeric(5,2) DEFAULT 0,
    "participation_grade" text,
    "projects_grade" text,
    "homework_grade" text,
    "assignments_grade" text,
    "overall_grade" text,
    "key_strengths" text,
    "areas_for_growth" text,
    "instructor_assessment" text,
    "has_certificate" boolean DEFAULT false,
    "certificate_text" text,
    "course_completed" text,
    "proficiency_level" text,
    "verification_code" text DEFAULT "substring"((gen_random_uuid())::text, 1, 8),
    "is_published" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "photo_url" text,
    "school_section" text,
    "fee_label" text,
    "fee_amount" text,
    "fee_status" text,
    "show_payment_notice" boolean DEFAULT false NOT NULL,
    "participation_score" numeric DEFAULT 0,
    "engagement_metrics" jsonb DEFAULT '{}'::jsonb,
    "gender" text,
    "term_id" uuid,
    "student_grade" text,
    "published_at" timestamp with time zone
);
ALTER TABLE "public"."student_progress_reports" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_streaks" (
    "student_id" uuid NOT NULL,
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "last_active_week" date,
    "total_active_weeks" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_streaks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_teacher_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "thread_id" uuid NOT NULL,
    "sender_id" uuid NOT NULL,
    "body" text NOT NULL,
    "sent_at" timestamp with time zone DEFAULT now(),
    "is_read" boolean DEFAULT false
);
ALTER TABLE "public"."student_teacher_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_teacher_threads" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "teacher_id" uuid NOT NULL,
    "subject" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."student_teacher_threads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_transfer_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "from_class_id" uuid NOT NULL,
    "to_class_id" uuid NOT NULL,
    "from_teacher_id" uuid NOT NULL,
    "requested_by" uuid NOT NULL,
    "school_id" uuid NOT NULL,
    "reason" text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "decision_note" text,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_transfer_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_xp_ledger" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "student_id" uuid NOT NULL,
    "event_key" text NOT NULL,
    "event_label" text NOT NULL,
    "xp" integer DEFAULT 0 NOT NULL,
    "ref_id" uuid,
    "ref_type" text,
    "term_number" integer,
    "school_id" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_xp_ledger" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_xp_summary" (
    "student_id" uuid NOT NULL,
    "total_xp" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "this_term_xp" integer DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."student_xp_summary" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "age" integer,
    "email" text,
    "phone" text,
    "school" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "grade" text,
    "gender" text,
    "parent_name" text,
    "course_interest" text,
    "preferred_schedule" text,
    "hear_about_us" text,
    "status" text DEFAULT 'pending'::text,
    "updated_at" timestamp with time zone DEFAULT now(),
    "is_active" boolean DEFAULT true,
    "is_deleted" boolean DEFAULT false,
    "full_name" text,
    "date_of_birth" date,
    "parent_email" text,
    "parent_phone" text,
    "school_name" text,
    "current_class" text,
    "city" text,
    "state" text,
    "country" text DEFAULT 'Nigeria'::text,
    "medical_conditions" text,
    "allergies" text,
    "previous_programming_experience" text,
    "interests" text,
    "goals" text,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "user_id" uuid,
    "student_number" text,
    "grade_level" text,
    "avatar_url" text,
    "enrollment_type" text DEFAULT 'school'::text,
    "student_email" text,
    "heard_about_us" text,
    "parent_relationship" text,
    "school_id" uuid,
    "section" text,
    "created_by" uuid,
    "registration_payment_at" timestamp with time zone,
    "registration_paystack_reference" text,
    "payment_plan" text DEFAULT 'full'::text NOT NULL,
    "class_arm" text,
    "partner_program_track" text,
    "rc_code" text
);
ALTER TABLE "public"."students" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."study_group_members" (
    "group_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."study_group_members" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."study_group_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "group_id" uuid NOT NULL,
    "sender_id" uuid NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."study_group_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."study_groups" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "course_id" uuid,
    "school_id" uuid NOT NULL,
    "created_by" uuid NOT NULL,
    "status" text DEFAULT 'active'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "code_content" text DEFAULT ''::text
);
ALTER TABLE "public"."study_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "course_id" uuid,
    "subscription_plan" text,
    "amount" numeric(10,2) NOT NULL,
    "currency" text DEFAULT 'NGN'::text,
    "billing_cycle" text,
    "status" text DEFAULT 'active'::text,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "external_subscription_id" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "owner_type" text DEFAULT 'school'::text NOT NULL,
    "school_id" uuid,
    "pricing_model" text DEFAULT 'fixed_school'::text NOT NULL,
    "fixed_amount" numeric,
    "price_per_student" numeric,
    "billing_channel" text,
    "auto_rollover" boolean DEFAULT true NOT NULL,
    "plan_name" text,
    "plan_type" text,
    "start_date" date,
    "end_date" date,
    "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "max_students" integer,
    "max_teachers" integer
);
ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "subject" text NOT NULL,
    "message" text NOT NULL,
    "follow_up" text,
    "category" text DEFAULT 'general'::text NOT NULL,
    "priority" text DEFAULT 'normal'::text NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "invoice_id" uuid,
    "assigned_to" uuid,
    "admin_reply" text,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."support_tickets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "setting_key" text NOT NULL,
    "setting_value" text,
    "description" text,
    "category" text DEFAULT 'general'::text,
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."system_settings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."teacher_schools" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "teacher_id" uuid NOT NULL,
    "school_id" uuid NOT NULL,
    "assigned_by" uuid,
    "assigned_at" timestamp with time zone DEFAULT now(),
    "is_primary" boolean DEFAULT false,
    "notes" text
);
ALTER TABLE "public"."teacher_schools" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "full_name" text NOT NULL,
    "phone" text,
    "subjects" text[] DEFAULT '{}'::text[],
    "experience_years" integer DEFAULT 0,
    "education" text,
    "bio" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "created_by" uuid
);
ALTER TABLE "public"."teachers" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."term_schedules" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lesson_plan_id" uuid NOT NULL,
    "school_id" uuid NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "current_week" integer DEFAULT 1 NOT NULL,
    "term_start" date NOT NULL,
    "cadence_days" integer DEFAULT 7 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."term_schedules" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."timetable_slots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "timetable_id" uuid NOT NULL,
    "day_of_week" text NOT NULL,
    "start_time" text NOT NULL,
    "end_time" text NOT NULL,
    "subject" text NOT NULL,
    "teacher_id" uuid,
    "teacher_name" text,
    "course_id" uuid,
    "room" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."timetable_slots" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."timetables" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "school_id" uuid,
    "title" text NOT NULL,
    "section" text,
    "academic_year" text,
    "term" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "term_id" uuid
);
ALTER TABLE "public"."timetables" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."topic_subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "topic_id" uuid,
    "user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."topic_subscriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "badge_id" uuid,
    "earned_at" timestamp with time zone DEFAULT now(),
    "metadata" jsonb
);
ALTER TABLE "public"."user_badges" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_points" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid,
    "total_points" integer DEFAULT 0,
    "current_streak" integer DEFAULT 0,
    "longest_streak" integer DEFAULT 0,
    "last_activity_date" date,
    "achievement_level" text DEFAULT 'Bronze'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."user_points" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "bio" text,
    "date_of_birth" date,
    "gender" text,
    "address" text,
    "city" text,
    "state" text,
    "country" text DEFAULT 'Nigeria'::text,
    "postal_code" text,
    "emergency_contact_name" text,
    "emergency_contact_phone" text,
    "emergency_contact_relationship" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."user_profiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."vault_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "title" text NOT NULL,
    "language" text DEFAULT 'javascript'::text NOT NULL,
    "code" text NOT NULL,
    "description" text,
    "tags" text[],
    "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "public"."vault_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."web_push_subscriptions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "portal_user_id" uuid NOT NULL,
    "endpoint" text NOT NULL,
    "subscription_json" jsonb NOT NULL,
    "device_hint" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."web_push_subscriptions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "phone_number" text NOT NULL,
    "contact_name" text,
    "portal_user_id" uuid,
    "last_message_at" timestamp with time zone DEFAULT now(),
    "last_message_preview" text,
    "unread_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "opted_out" boolean DEFAULT false,
    "opted_out_at" timestamp with time zone,
    "opted_in_at" timestamp with time zone,
    "school_name" text,
    "assigned_staff_id" uuid
);
ALTER TABLE "public"."whatsapp_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_group_broadcasts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "group_id" uuid,
    "group_name" text,
    "school_id" uuid,
    "school_name" text,
    "sent_by" uuid,
    "sent_by_name" text,
    "message" text NOT NULL,
    "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."whatsapp_group_broadcasts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_groups" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "link" text NOT NULL,
    "school_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "description" text,
    "group_type" text DEFAULT 'general'::text NOT NULL,
    "class_name" text,
    "term" text,
    "status" text DEFAULT 'active'::text NOT NULL,
    "member_count" integer DEFAULT 0,
    "last_broadcast_at" timestamp with time zone,
    "school_name" text,
    "class_id" uuid,
    "owner_teacher_id" uuid
);
ALTER TABLE "public"."whatsapp_groups" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "direction" text NOT NULL,
    "meta_message_id" text,
    "message_type" text DEFAULT 'text'::text,
    "body" text,
    "media_url" text,
    "status" text DEFAULT 'delivered'::text,
    "created_at" timestamp with time zone DEFAULT now(),
    "metadata" jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whatsapp_outbox" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "recipient_user_id" uuid,
    "phone" text NOT NULL,
    "message_body" text NOT NULL,
    "template_name" text,
    "template_language" text DEFAULT 'en'::text NOT NULL,
    "template_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "status" text DEFAULT 'queued'::text NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 4 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
    "meta_message_id" text,
    "last_error" text,
    "source_type" text,
    "source_id" uuid,
    "school_id" uuid,
    "class_id" uuid,
    "created_by" uuid,
    "idempotency_key" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sent_at" timestamp with time zone
);
ALTER TABLE "public"."whatsapp_outbox" OWNER TO "postgres";


-- ============================================================================
-- FUNCTIONS DEPENDING ON TABLE TYPES (must follow their tables)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox(p_limit integer DEFAULT 20)
 RETURNS SETOF public.whatsapp_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.whatsapp_outbox
    WHERE status IN ('queued','retry') AND next_attempt_at <= now() AND attempts < max_attempts
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
  )
  UPDATE public.whatsapp_outbox outbox
  SET status = 'processing', attempts = outbox.attempts + 1, updated_at = now()
  FROM claimed WHERE outbox.id = claimed.id
  RETURNING outbox.*;
END;
$function$;
ALTER FUNCTION "public"."claim_whatsapp_outbox"(p_limit integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.decide_student_transfer_request(p_request_id uuid, p_actor_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS public.student_transfer_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req public.student_transfer_requests;
  actor_role text;
  dest public.classes;
  live_count integer;
BEGIN
  SELECT * INTO req FROM public.student_transfer_requests WHERE id = p_request_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Transfer request has already been decided'; END IF;

  SELECT role INTO actor_role FROM public.portal_users
  WHERE id = p_actor_id AND NOT coalesce(is_deleted, false) AND coalesce(is_active, true);
  IF actor_role <> 'admin' AND req.from_teacher_id <> p_actor_id THEN
    RAISE EXCEPTION 'Only the current owning teacher or an admin may decide this request';
  END IF;

  IF p_approve THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_users student
      JOIN public.classes source ON source.id = student.class_id
      WHERE student.id = req.student_id AND student.role = 'student'
        AND student.class_id = req.from_class_id AND source.teacher_id = req.from_teacher_id
    ) THEN
      RAISE EXCEPTION 'Student ownership changed after this request was created; refresh and submit a new request';
    END IF;

    SELECT * INTO dest FROM public.classes WHERE id = req.to_class_id FOR UPDATE;
    IF dest.id IS NULL OR dest.teacher_id IS NULL THEN RAISE EXCEPTION 'Destination class has no valid owner'; END IF;
    IF dest.school_id <> req.school_id THEN RAISE EXCEPTION 'Cross-school transfer is forbidden'; END IF;

    SELECT count(*) INTO live_count FROM public.portal_users
    WHERE role = 'student' AND class_id = dest.id AND NOT coalesce(is_deleted, false);
    IF dest.max_students IS NOT NULL AND dest.max_students > 0 AND live_count >= dest.max_students THEN
      RAISE EXCEPTION 'Destination class is full';
    END IF;

    UPDATE public.portal_users SET
      class_id = dest.id,
      school_id = dest.school_id,
      section_class = dest.name,
      primary_teacher_id = dest.teacher_id,
      updated_at = now()
    WHERE id = req.student_id AND role = 'student';

    UPDATE public.students SET
      school_id = dest.school_id,
      school_name = (SELECT name FROM public.schools WHERE id = dest.school_id),
      current_class = dest.name,
      grade_level = coalesce(grade_level, dest.qa_grade_band),
      updated_at = now()
    WHERE user_id = req.student_id;

    IF to_regclass('public.class_term_rosters') IS NOT NULL THEN
      EXECUTE 'UPDATE public.class_term_rosters SET status = ''withdrawn'', ended_at = now(), updated_by = $1 WHERE student_id = $2 AND class_id = $3 AND status = ''active'''
        USING p_actor_id, req.student_id, req.from_class_id;
    END IF;

    UPDATE public.classes c SET current_students = (
      SELECT count(*) FROM public.portal_users pu
      WHERE pu.role = 'student' AND pu.class_id = c.id AND NOT coalesce(pu.is_deleted, false)
    ), updated_at = now()
    WHERE c.id IN (req.from_class_id, req.to_class_id);
  END IF;

  UPDATE public.student_transfer_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
    decision_note = nullif(btrim(p_note), ''),
    decided_by = p_actor_id,
    decided_at = now(),
    updated_at = now()
  WHERE id = req.id
  RETURNING * INTO req;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, new_values)
  VALUES (p_actor_id, CASE WHEN p_approve THEN 'student_transfer_approved' ELSE 'student_transfer_declined' END,
          'student_transfer_requests', req.id,
          jsonb_build_object('student_id', req.student_id, 'from_class_id', req.from_class_id, 'to_class_id', req.to_class_id, 'note', p_note));

  RETURN req;
END;
$function$;
ALTER FUNCTION "public"."decide_student_transfer_request"(p_request_id uuid, p_actor_id uuid, p_approve boolean, p_note text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.staff_can_access_assignment(a public.assignments)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Admin
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
    OR
    -- School account: same school only
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'school'
        AND pu.school_id IS NOT NULL
        AND pu.school_id = a.school_id
    )
    OR
    -- Teacher: creator, class owner, or school-wide (no class) at their school
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'teacher'
        AND (
          a.created_by = pu.id
          OR EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.teacher_id = pu.id
              AND c.id = COALESCE(
                (
                  SELECT c2.id
                  FROM public.classes c2
                  WHERE c2.id::text = NULLIF(trim(a.metadata ->> 'target_class_id'), '')
                  LIMIT 1
                ),
                a.class_id
              )
          )
          OR (
            COALESCE(
              (
                SELECT c3.id
                FROM public.classes c3
                WHERE c3.id::text = NULLIF(trim(a.metadata ->> 'target_class_id'), '')
                LIMIT 1
              ),
              a.class_id
            ) IS NULL
            AND a.school_id IS NOT NULL
            AND (
              pu.school_id = a.school_id
              OR EXISTS (
                SELECT 1 FROM public.teacher_schools ts
                WHERE ts.teacher_id = pu.id AND ts.school_id = a.school_id
              )
            )
          )
        )
    );
$function$;
ALTER FUNCTION "public"."staff_can_access_assignment"(a public.assignments) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.upsert_enrollment_term_grade(p_enrollment_id uuid, p_grade text, p_notes text DEFAULT NULL::text, p_term_id uuid DEFAULT NULL::uuid)
 RETURNS public.enrollment_term_grades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_term uuid := COALESCE(p_term_id, public.live_academic_term_id());
  v_row public.enrollment_term_grades;
BEGIN
  IF v_term IS NULL THEN
    RAISE EXCEPTION 'No academic term available for enrollment grade';
  END IF;

  INSERT INTO public.enrollment_term_grades (enrollment_id, term_id, grade, notes, updated_at)
  VALUES (p_enrollment_id, v_term, p_grade, p_notes, now())
  ON CONFLICT (enrollment_id, term_id) DO UPDATE
    SET grade = EXCLUDED.grade,
        notes = COALESCE(EXCLUDED.notes, public.enrollment_term_grades.notes),
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
ALTER FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) OWNER TO "postgres";


-- ============================================================================
-- PRIMARY KEYS, UNIQUE & CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE ONLY "public"."academic_terms"
    ADD CONSTRAINT "academic_terms_term_number_check" CHECK (((term_number >= 1) AND (term_number <= 3)));
ALTER TABLE ONLY "public"."academic_terms"
    ADD CONSTRAINT "academic_terms_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."academic_terms"
    ADD CONSTRAINT "academic_terms_academic_year_term_number_key" UNIQUE (academic_year, term_number);
ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_pkey" PRIMARY KEY (portal_user_id, announcement_id);
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_target_audience_check" CHECK ((target_audience = ANY (ARRAY['all'::text, 'students'::text, 'teachers'::text, 'admins'::text, 'parents'::text, 'class'::text])));
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (key);
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_grading_mode_check" CHECK ((grading_mode = ANY (ARRAY['auto'::text, 'ai_suggested'::text, 'manual'::text])));
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'graded'::text, 'late'::text, 'missing'::text, 'pending_review'::text])));
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "uq_submissions_assignment_portal_user" UNIQUE (assignment_id, portal_user_id);
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_assignment_type_check" CHECK ((assignment_type = ANY (ARRAY['homework'::text, 'project'::text, 'quiz'::text, 'exam'::text, 'presentation'::text, 'coding'::text])));
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_grading_mode_check" CHECK ((grading_mode = ANY (ARRAY['auto'::text, 'ai_assisted'::text, 'manual'::text])));
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_status_check" CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])));
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_id_user_id_key" UNIQUE (session_id, user_id);
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."balance_reminder_settings"
    ADD CONSTRAINT "balance_reminder_settings_single_row" CHECK ((id = 1));
ALTER TABLE ONLY "public"."balance_reminder_settings"
    ADD CONSTRAINT "balance_reminder_settings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."billing_contacts"
    ADD CONSTRAINT "billing_contacts_owner_type_check" CHECK ((owner_type = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."billing_contacts"
    ADD CONSTRAINT "billing_contacts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_owner_type_check" CHECK ((owner_type = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_status_check" CHECK ((status = ANY (ARRAY['due'::text, 'past_due'::text, 'paid'::text, 'cancelled'::text, 'rolled_over'::text])));
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."billing_document_archive"
    ADD CONSTRAINT "billing_document_archive_doc_type_check" CHECK ((doc_type = ANY (ARRAY['payment_register'::text, 'attendance_roster'::text, 'billing_statement'::text])));
ALTER TABLE ONLY "public"."billing_document_archive"
    ADD CONSTRAINT "billing_document_archive_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."billing_notices"
    ADD CONSTRAINT "billing_notices_owner_type_check" CHECK ((owner_type = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."billing_notices"
    ADD CONSTRAINT "billing_notices_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."billing_reminder_logs"
    ADD CONSTRAINT "billing_reminder_logs_channel_check" CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'whatsapp'::text])));
ALTER TABLE ONLY "public"."billing_reminder_logs"
    ADD CONSTRAINT "billing_reminder_logs_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])));
ALTER TABLE ONLY "public"."billing_reminder_logs"
    ADD CONSTRAINT "billing_reminder_logs_week_number_check" CHECK ((week_number = ANY (ARRAY[6, 7, 8])));
ALTER TABLE ONLY "public"."billing_reminder_logs"
    ADD CONSTRAINT "billing_reminder_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."card_audit_logs"
    ADD CONSTRAINT "card_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_scan_result_check" CHECK ((scan_result = ANY (ARRAY['ok'::text, 'revoked'::text, 'expired'::text, 'invalid'::text])));
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_source_check" CHECK ((source = ANY (ARRAY['web'::text, 'qr'::text, 'api'::text])));
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_curriculum_week_number_check" CHECK (((curriculum_week_number >= 1) AND (curriculum_week_number <= 53)));
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_grading_mode_check" CHECK ((grading_mode = ANY (ARRAY['auto'::text, 'ai_assisted'::text, 'manual'::text])));
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."cbt_questions"
    ADD CONSTRAINT "cbt_questions_question_type_check" CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'essay'::text, 'fill_blank'::text, 'coding_blocks'::text])));
ALTER TABLE ONLY "public"."cbt_questions"
    ADD CONSTRAINT "cbt_questions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'abandoned'::text, 'passed'::text, 'failed'::text, 'pending_grading'::text])));
ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_exam_user_unique" UNIQUE (exam_id, user_id);
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_certificate_number_key" UNIQUE (certificate_number);
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_verification_code_key" UNIQUE (verification_code);
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "uq_certificates_user_course" UNIQUE (portal_user_id, course_id);
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'delivered'::text, 'skipped'::text])));
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_week_number_check" CHECK (((week_number >= 1) AND (week_number <= 53)));
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_lesson_plan_id_week_number_lesson_id_key" UNIQUE (lesson_plan_id, week_number, lesson_id);
ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_billing_status_check" CHECK ((billing_status = ANY (ARRAY['unknown'::text, 'not_required'::text, 'pending'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text, 'void'::text, 'rolled_over'::text])));
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'withdrawn'::text, 'completed'::text])));
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_subscription_status_check" CHECK ((subscription_status = ANY (ARRAY['unknown'::text, 'active'::text, 'trialing'::text, 'past_due'::text, 'suspended'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_qa_grade_mode_check" CHECK (((qa_grade_mode IS NULL) OR (qa_grade_mode = ANY (ARRAY['optional'::text, 'compulsory'::text]))));
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_qa_spine_lane_check" CHECK (((qa_spine_lane IS NULL) OR ((qa_spine_lane >= 1) AND (qa_spine_lane <= 11))));
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_abuse_events"
    ADD CONSTRAINT "communication_abuse_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_channel_check" CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'in_app'::text, 'feedback'::text, 'system'::text])));
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['recorded'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'suppressed'::text])));
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text])));
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_satisfaction_score_check" CHECK (((satisfaction_score >= 1) AND (satisfaction_score <= 5)));
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_sensitivity_check" CHECK ((sensitivity = ANY (ARRAY['standard'::text, 'complaint'::text, 'privacy'::text, 'safeguarding'::text, 'fraud'::text])));
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'reopened'::text, 'pending_customer'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_conversation_meta"
    ADD CONSTRAINT "communication_conversation_meta_reminder_count_check" CHECK ((reminder_count >= 0));
ALTER TABLE ONLY "public"."communication_conversation_meta"
    ADD CONSTRAINT "communication_conversation_meta_pkey" PRIMARY KEY (conversation_id);
ALTER TABLE ONLY "public"."communication_customer_identities"
    ADD CONSTRAINT "communication_customer_identities_identity_type_check" CHECK ((identity_type = ANY (ARRAY['portal_user'::text, 'email'::text, 'phone'::text])));
ALTER TABLE ONLY "public"."communication_customer_identities"
    ADD CONSTRAINT "communication_customer_identities_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_customer_identities"
    ADD CONSTRAINT "communication_customer_identit_identity_type_identity_value_key" UNIQUE (identity_type, identity_value);
ALTER TABLE ONLY "public"."communication_delivery_log"
    ADD CONSTRAINT "communication_delivery_log_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'in_app'::text, 'sms'::text, 'push'::text])));
ALTER TABLE ONLY "public"."communication_delivery_log"
    ADD CONSTRAINT "communication_delivery_log_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'suppressed'::text])));
ALTER TABLE ONLY "public"."communication_delivery_log"
    ADD CONSTRAINT "communication_delivery_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_escalations"
    ADD CONSTRAINT "communication_escalations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_rate_limits"
    ADD CONSTRAINT "communication_rate_limits_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_reports"
    ADD CONSTRAINT "communication_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_test_status_check" CHECK ((test_status = ANY (ARRAY['untested'::text, 'passed'::text, 'failed'::text])));
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_version_number_check" CHECK ((version_number > 0));
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_template_id_version_number_key" UNIQUE (template_id, version_number);
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'in_app'::text, 'sms'::text])));
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'retired'::text])));
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_template_key_check" CHECK ((template_key ~ '^[a-z0-9_]+$'::text));
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_template_key_key" UNIQUE (template_key);
ALTER TABLE ONLY "public"."consent_forms"
    ADD CONSTRAINT "consent_forms_form_type_check" CHECK ((form_type = ANY (ARRAY['registration'::text, 'assessment'::text, 'general'::text])));
ALTER TABLE ONLY "public"."consent_forms"
    ADD CONSTRAINT "consent_forms_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."consent_responses"
    ADD CONSTRAINT "consent_responses_pkey" PRIMARY KEY (form_id, parent_id);
ALTER TABLE ONLY "public"."consent_submission_throttle"
    ADD CONSTRAINT "consent_submission_throttle_expiry_check" CHECK ((expires_at > submitted_at));
ALTER TABLE ONLY "public"."consent_submission_throttle"
    ADD CONSTRAINT "consent_submission_throttle_ip_hmac_check" CHECK ((ip_hmac ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE ONLY "public"."consent_submission_throttle"
    ADD CONSTRAINT "consent_submission_throttle_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_content_type_check" CHECK ((content_type = ANY (ARRAY['video'::text, 'document'::text, 'quiz'::text, 'presentation'::text, 'interactive'::text])));
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_content_id_portal_user_id_key" UNIQUE (content_id, portal_user_id);
ALTER TABLE ONLY "public"."course_curricula"
    ADD CONSTRAINT "course_curricula_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."course_curricula"
    ADD CONSTRAINT "course_curricula_course_id_school_id_key" UNIQUE (course_id, school_id);
ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_file_type_check" CHECK ((file_type = ANY (ARRAY['pdf'::text, 'video'::text, 'image'::text, 'document'::text, 'link'::text])));
ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."crm_attachments"
    ADD CONSTRAINT "crm_attachments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."crm_interactions"
    ADD CONSTRAINT "crm_interactions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."crm_opportunities"
    ADD CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_contact_id_key" UNIQUE (contact_id);
ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."cron_job_health"
    ADD CONSTRAINT "cron_job_health_expected_interval_minutes_check" CHECK ((expected_interval_minutes > 0));
ALTER TABLE ONLY "public"."cron_job_health"
    ADD CONSTRAINT "cron_job_health_pkey" PRIMARY KEY (job_name);
ALTER TABLE ONLY "public"."cron_run_history"
    ADD CONSTRAINT "cron_run_history_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_difficulty_level_check" CHECK (((difficulty_level >= 1) AND (difficulty_level <= 10)));
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_estimated_minutes_check" CHECK (((estimated_minutes IS NULL) OR (estimated_minutes > 0)));
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_track_check" CHECK ((track = ANY (ARRAY['young_innovator'::text, 'scratch'::text, 'python'::text, 'html_css'::text, 'intro_ai_tools'::text, 'jss_web_app'::text, 'jss_python'::text, 'ss_uiux_mobile'::text, 'mixed'::text])));
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_project_key_key" UNIQUE (project_key);
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_term_number_check" CHECK (((term_number >= 1) AND (term_number <= 3)));
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_week_number_check" CHECK ((week_number >= 1));
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_year_number_check" CHECK (((year_number >= 1) AND (year_number <= 10)));
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_completion_seconds_check" CHECK ((completion_seconds >= 0));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_practical_score_check" CHECK (((practical_score >= (0)::numeric) AND (practical_score <= (100)::numeric)));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_retry_count_check" CHECK ((retry_count >= 0));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_term_number_check" CHECK (((term_number >= 1) AND (term_number <= 3)));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_week_number_check" CHECK ((week_number >= 1));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_year_number_check" CHECK (((year_number >= 1) AND (year_number <= 10)));
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_student_id_lesson_plan_id_year__key" UNIQUE (student_id, lesson_plan_id, year_number, term_number, week_number);
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])));
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_term_number_check" CHECK ((term_number >= 1));
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_week_number_check" CHECK ((week_number >= 1));
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."customer_contact_book"
    ADD CONSTRAINT "customer_contact_book_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_outcome_type_check" CHECK ((outcome_type = ANY (ARRAY['resolved'::text, 'helpful'::text, 'not_helpful'::text, 'converted'::text, 'retained'::text, 'churned'::text])));
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_score_check" CHECK (((score >= 1) AND (score <= 5)));
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_platform_check" CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text])));
ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_token_key" UNIQUE (token);
ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."dismissed_duplicate_pairs"
    ADD CONSTRAINT "dismissed_duplicate_pairs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."dismissed_duplicate_pairs"
    ADD CONSTRAINT "dismissed_duplicate_pairs_pair_key_key" UNIQUE (pair_key);
ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."email_thread_links"
    ADD CONSTRAINT "email_thread_links_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."engage_posts"
    ADD CONSTRAINT "engage_posts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."enrollment_term_grades"
    ADD CONSTRAINT "enrollment_term_grades_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."enrollment_term_grades"
    ADD CONSTRAINT "enrollment_term_grades_enrollment_id_term_id_key" UNIQUE (enrollment_id, term_id);
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_role_check" CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text])));
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'dropped'::text, 'suspended'::text])));
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_program_id_role_key" UNIQUE (user_id, program_id, role);
ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'graded'::text, 'abandoned'::text])));
ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_question_type_check" CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'short_answer'::text, 'essay'::text, 'matching'::text, 'fill_in_blank'::text])));
ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_satisfaction_score_check" CHECK (((satisfaction_score >= 1) AND (satisfaction_score <= 5)));
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'reopened'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_type_check" CHECK ((type = ANY (ARRAY['suggestion'::text, 'complaint'::text, 'praise'::text, 'question'::text])));
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_storage_provider_check" CHECK ((storage_provider = ANY (ARRAY['s3'::text, 'r2'::text, 'cloudinary'::text])));
ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."finance_automation_log"
    ADD CONSTRAINT "finance_automation_log_attempt_check" CHECK ((attempt >= 1));
ALTER TABLE ONLY "public"."finance_automation_log"
    ADD CONSTRAINT "finance_automation_log_status_check" CHECK ((lower(status) = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text, 'skipped'::text])));
ALTER TABLE ONLY "public"."finance_automation_log"
    ADD CONSTRAINT "finance_automation_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_content_type_check" CHECK ((content_type = ANY (ARRAY['topic'::text, 'reply'::text])));
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'removed'::text])));
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flashcard_card_statistics"
    ADD CONSTRAINT "flashcard_card_statistics_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flashcard_card_statistics"
    ADD CONSTRAINT "flashcard_card_statistics_card_id_key" UNIQUE (card_id);
ALTER TABLE ONLY "public"."flashcard_cards"
    ADD CONSTRAINT "flashcard_cards_difficulty_level_check" CHECK ((difficulty_level = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])));
ALTER TABLE ONLY "public"."flashcard_cards"
    ADD CONSTRAINT "flashcard_cards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_curriculum_week_number_check" CHECK (((curriculum_week_number >= 1) AND (curriculum_week_number <= 53)));
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_progression_delivery_mode_check" CHECK (((progression_delivery_mode IS NULL) OR (progression_delivery_mode = ANY (ARRAY['optional'::text, 'compulsory'::text]))));
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_progression_track_check" CHECK (((progression_track IS NULL) OR (progression_track = ANY (ARRAY['young_innovator'::text, 'scratch'::text, 'python'::text, 'html'::text, 'html_css'::text, 'jss_web_app'::text, 'jss_python'::text, 'ss_uiux_mobile'::text]))));
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_progression_weekly_frequency_check" CHECK (((progression_weekly_frequency IS NULL) OR (progression_weekly_frequency = ANY (ARRAY[1, 2]))));
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_confidence_level_check" CHECK (((confidence_level >= 1) AND (confidence_level <= 5)));
ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_card_id_student_id_key" UNIQUE (card_id, student_id);
ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_child_index_check" CHECK ((child_index >= 0));
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_linked_metadata_check" CHECK ((((status = ANY (ARRAY['approved'::text, 'onboarded'::text])) AND (linked_at IS NOT NULL)) OR (status = ANY (ARRAY['candidate'::text, 'unlinked'::text, 'reverted'::text]))));
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text));
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_source_check" CHECK ((btrim(source) <> ''::text));
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_status_check" CHECK ((status = ANY (ARRAY['candidate'::text, 'approved'::text, 'onboarded'::text, 'unlinked'::text, 'reverted'::text])));
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "uq_form_lead_child_links_lead_index" UNIQUE (lead_id, child_index);
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "uq_form_lead_child_links_lead_student" UNIQUE (lead_id, student_portal_user_id);
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_match_status_check" CHECK ((match_status = ANY (ARRAY['unreviewed'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'new_prospect'::text])));
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'enrolled'::text, 'lost'::text])));
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_holder_type_check" CHECK ((holder_type = ANY (ARRAY['student'::text, 'parent'::text, 'teacher'::text])));
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_status_check" CHECK ((status = ANY (ARRAY['issued'::text, 'active'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_template_type_check" CHECK ((template_type = ANY (ARRAY['student'::text, 'parent'::text, 'teacher'::text])));
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_card_number_key" UNIQUE (card_number);
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_verification_code_key" UNIQUE (verification_code);
ALTER TABLE ONLY "public"."instalment_items"
    ADD CONSTRAINT "instalment_items_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text])));
ALTER TABLE ONLY "public"."instalment_items"
    ADD CONSTRAINT "instalment_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."instalment_plans"
    ADD CONSTRAINT "instalment_plans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."instalment_plans"
    ADD CONSTRAINT "instalment_plans_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."instalment_plans"
    ADD CONSTRAINT "instalment_plans_invoice_id_parent_id_key" UNIQUE (invoice_id, parent_id);
ALTER TABLE ONLY "public"."invoice_automation_logs"
    ADD CONSTRAINT "invoice_automation_logs_triggered_by_check" CHECK ((triggered_by = ANY (ARRAY['cron'::text, 'manual'::text])));
ALTER TABLE ONLY "public"."invoice_automation_logs"
    ADD CONSTRAINT "invoice_automation_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."invoice_payment_proofs"
    ADD CONSTRAINT "invoice_payment_proofs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'request_more'::text])));
ALTER TABLE ONLY "public"."invoice_payment_proofs"
    ADD CONSTRAINT "invoice_payment_proofs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_balance_adds_up" CHECK ((abs(((amount_paid + amount_remaining) - original_amount)) <= 0.01));
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_balance_nonneg" CHECK (((amount_paid >= (0)::numeric) AND (amount_remaining >= (0)::numeric) AND (original_amount >= (0)::numeric)));
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_status_allowed" CHECK (((status IS NULL) OR (lower(status) = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text, 'void'::text, 'cancelled'::text]))));
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_stream_check" CHECK ((stream = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE (invoice_number);
ALTER TABLE ONLY "public"."lab_projects"
    ADD CONSTRAINT "lab_projects_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "term_dates_valid" CHECK (((term_end IS NULL) OR (term_start IS NULL) OR (term_end > term_start)));
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_lesson_id_unique" UNIQUE (lesson_id);
ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_status_check" CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_portal_user_id_key" UNIQUE (lesson_id, portal_user_id);
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_curriculum_week_number_check" CHECK (((curriculum_week_number >= 1) AND (curriculum_week_number <= 53)));
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_lesson_type_check" CHECK ((lesson_type = ANY (ARRAY['lesson'::text, 'video'::text, 'interactive'::text, 'hands-on'::text, 'hands_on'::text, 'workshop'::text, 'coding'::text, 'reading'::text, 'quiz'::text, 'assignment'::text, 'article'::text, 'project'::text, 'lab'::text, 'live'::text, 'practice'::text, 'checkpoint'::text, 'robotics'::text, 'electronics'::text, 'mechanics'::text, 'design'::text, 'iot'::text, 'ai'::text])));
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'scheduled'::text, 'completed'::text])));
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_session_id_portal_user_id_key" UNIQUE (session_id, portal_user_id);
ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_poll_options"
    ADD CONSTRAINT "live_session_poll_options_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_poll_type_check" CHECK ((poll_type = ANY (ARRAY['poll'::text, 'quiz'::text])));
ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_session_questions"
    ADD CONSTRAINT "live_session_questions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_platform_check" CHECK ((platform = ANY (ARRAY['zoom'::text, 'google_meet'::text, 'teams'::text, 'discord'::text, 'other'::text])));
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_purpose_check" CHECK ((purpose = ANY (ARRAY['marketing'::text, 'service'::text, 'retention'::text])));
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'scheduled'::text, 'running'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_campaign_key_key" UNIQUE (campaign_key);
ALTER TABLE ONLY "public"."marketing_events"
    ADD CONSTRAINT "marketing_events_event_type_check" CHECK ((event_type = ANY (ARRAY['targeted'::text, 'suppressed'::text, 'sent'::text, 'delivered'::text, 'viewed'::text, 'responded'::text, 'converted'::text, 'unsubscribed'::text, 'failed'::text])));
ALTER TABLE ONLY "public"."marketing_events"
    ADD CONSTRAINT "marketing_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."marketing_suppressions"
    ADD CONSTRAINT "marketing_suppressions_channel_check" CHECK ((channel = ANY (ARRAY['all'::text, 'email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text, 'in_app'::text])));
ALTER TABLE ONLY "public"."marketing_suppressions"
    ADD CONSTRAINT "marketing_suppressions_identity_type_check" CHECK ((identity_type = ANY (ARRAY['portal_user'::text, 'email'::text, 'phone'::text])));
ALTER TABLE ONLY "public"."marketing_suppressions"
    ADD CONSTRAINT "marketing_suppressions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."marketing_suppressions"
    ADD CONSTRAINT "marketing_suppressions_identity_type_identity_value_channel_key" UNIQUE (identity_type, identity_value, channel);
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."newsletter_delivery"
    ADD CONSTRAINT "newsletter_delivery_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."newsletter_delivery"
    ADD CONSTRAINT "newsletter_delivery_newsletter_id_user_id_key" UNIQUE (newsletter_id, user_id);
ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_purpose_check" CHECK ((purpose = ANY (ARRAY['marketing'::text, 'service'::text, 'retention'::text])));
ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."notification_dead_letters"
    ADD CONSTRAINT "notification_dead_letters_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'retrying'::text, 'resolved'::text, 'ignored'::text])));
ALTER TABLE ONLY "public"."notification_dead_letters"
    ADD CONSTRAINT "notification_dead_letters_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_portal_user_id_key" UNIQUE (portal_user_id);
ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_type_check" CHECK ((type = ANY (ARRAY['email'::text, 'push'::text, 'sms'::text, 'in_app'::text])));
ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_name_type_key" UNIQUE (name, type);
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'bounced'::text])));
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_notification_channel_check" CHECK ((notification_channel = ANY (ARRAY['email'::text, 'sms'::text, 'in_app'::text, 'push'::text])));
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_type_check" CHECK ((type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text, 'achievement'::text, 'streak'::text, 'celebration'::text, 'announcement'::text, 'feedback'::text, 'email_sent'::text])));
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_check" CHECK ((ends_at > starts_at));
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_duty_kind_check" CHECK ((duty_kind = ANY (ARRAY['general_service'::text, 'academic_support'::text, 'admissions'::text, 'technical_support'::text])));
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_staff_id_duty_kind_starts_at_ends_at_key" UNIQUE (staff_id, duty_kind, starts_at, ends_at);
ALTER TABLE ONLY "public"."operations_staff_settings"
    ADD CONSTRAINT "operations_staff_settings_max_active_cases_check" CHECK (((max_active_cases >= 1) AND (max_active_cases <= 50)));
ALTER TABLE ONLY "public"."operations_staff_settings"
    ADD CONSTRAINT "operations_staff_settings_pkey" PRIMARY KEY (user_id);
ALTER TABLE ONLY "public"."parent_claim_audit"
    ADD CONSTRAINT "parent_claim_audit_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_claim_otps"
    ADD CONSTRAINT "parent_claim_otps_child_age_check" CHECK (((child_age IS NULL) OR ((child_age >= 3) AND (child_age <= 25))));
ALTER TABLE ONLY "public"."parent_claim_otps"
    ADD CONSTRAINT "parent_claim_otps_child_gender_check" CHECK (((child_gender IS NULL) OR (child_gender = ANY (ARRAY['male'::text, 'female'::text]))));
ALTER TABLE ONLY "public"."parent_claim_otps"
    ADD CONSTRAINT "parent_claim_otps_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_feedback"
    ADD CONSTRAINT "parent_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ONLY "public"."parent_feedback"
    ADD CONSTRAINT "parent_feedback_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'actioned'::text])));
ALTER TABLE ONLY "public"."parent_feedback"
    ADD CONSTRAINT "parent_feedback_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_student_id_key" UNIQUE (parent_id, student_id);
ALTER TABLE ONLY "public"."parent_teacher_messages"
    ADD CONSTRAINT "parent_teacher_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_teacher_threads"
    ADD CONSTRAINT "parent_teacher_threads_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."parent_teacher_threads"
    ADD CONSTRAINT "parent_teacher_threads_parent_id_teacher_id_student_id_key" UNIQUE (parent_id, teacher_id, student_id);
ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_txn_invoice_unique" UNIQUE (payment_transaction_id, invoice_id);
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_payment_method_check" CHECK ((payment_method = ANY (ARRAY['stripe'::text, 'paystack'::text, 'bank_transfer'::text, 'cash'::text, 'pos'::text, 'cheque'::text, 'mobile_money'::text, 'manual'::text, 'card'::text, 'online'::text, 'other'::text])));
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'refunded'::text])));
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_transaction_reference_key" UNIQUE (transaction_reference);
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "uq_payment_transactions_reference" UNIQUE (transaction_reference);
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payment_method_check" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'card'::text, 'online'::text])));
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text])));
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_lane_index_check" CHECK (((lane_index >= 1) AND (lane_index <= 14)));
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_term_number_check" CHECK (((term_number >= 1) AND (term_number <= 3)));
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_week_index_check" CHECK (((week_index >= 1) AND (week_index <= 108)));
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_week_number_check" CHECK (((week_number >= 1) AND (week_number <= 12)));
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_year_number_check" CHECK (((year_number >= 1) AND (year_number <= 6)));
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_templa_catalog_version_program_id_la_key" UNIQUE (catalog_version, program_id, lane_index, week_index);
ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "uq_pt_user_activity_ref" UNIQUE (portal_user_id, activity_type, reference_id);
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_class_arm_check" CHECK (((class_arm IS NULL) OR (class_arm ~ '^[A-Z0-9]{1,4}$'::text)));
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_enrollment_type_check" CHECK (((enrollment_type IS NULL) OR (enrollment_type = ANY (ARRAY['school'::text, 'online'::text, 'in_person'::text, 'special'::text]))));
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text, 'school'::text, 'parent'::text])));
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_email_key" UNIQUE (email);
ALTER TABLE ONLY "public"."portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_delivery_type_check" CHECK ((delivery_type = ANY (ARRAY['compulsory'::text, 'optional'::text])));
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_difficulty_level_check" CHECK ((difficulty_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])));
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_program_scope_check" CHECK ((program_scope = ANY (ARRAY['regular_school'::text, 'online'::text, 'special'::text])));
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_session_frequency_per_week_check" CHECK ((session_frequency_per_week = ANY (ARRAY[1, 2])));
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_name_key" UNIQUE (name);
ALTER TABLE ONLY "public"."progression_override_audit"
    ADD CONSTRAINT "progression_override_audit_action_type_check" CHECK ((action_type = ANY (ARRAY['override_unlock'::text, 'week_edit_while_locked'::text, 'term_status_change'::text])));
ALTER TABLE ONLY "public"."progression_override_audit"
    ADD CONSTRAINT "progression_override_audit_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."project_engagement"
    ADD CONSTRAINT "project_engagement_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."project_group_members"
    ADD CONSTRAINT "project_group_members_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."project_group_members"
    ADD CONSTRAINT "project_group_members_group_id_student_id_key" UNIQUE (group_id, student_id);
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_evaluation_type_check" CHECK ((evaluation_type = ANY (ARRAY['individual'::text, 'group'::text])));
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."prospective_students"
    ADD CONSTRAINT "prospective_students_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_stream_check" CHECK ((stream = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_receipt_number_key" UNIQUE (receipt_number);
ALTER TABLE ONLY "public"."registration_batches"
    ADD CONSTRAINT "registration_batches_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."registration_results"
    ADD CONSTRAINT "registration_results_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_template_type_check" CHECK ((template_type = ANY (ARRAY['student_progress'::text, 'financial'::text, 'attendance'::text, 'performance'::text])));
ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_format" CHECK ((access_code ~ '^RC-[A-Z0-9]{8}$'::text));
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_access_code_unique" UNIQUE (access_code);
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_student_unique" UNIQUE (student_id);
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_incident_type_check" CHECK ((incident_type = ANY (ARRAY['child_safety'::text, 'privacy'::text, 'fraud'::text, 'complaint'::text])));
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_risk_level_check" CHECK ((risk_level = ANY (ARRAY['medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'contained'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_case_id_key" UNIQUE (case_id);
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_check" CHECK ((period_end >= period_start));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_check1" CHECK ((((curriculum_end_term * 100) + curriculum_end_week) >= ((curriculum_start_term * 100) + curriculum_start_week)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_curriculum_end_term_check" CHECK (((curriculum_end_term >= 1) AND (curriculum_end_term <= 20)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_curriculum_end_week_check" CHECK (((curriculum_end_week >= 1) AND (curriculum_end_week <= 60)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_curriculum_start_term_check" CHECK (((curriculum_start_term >= 1) AND (curriculum_start_term <= 20)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_curriculum_start_week_check" CHECK (((curriculum_start_week >= 1) AND (curriculum_start_week <= 60)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_title_check" CHECK (((char_length(title) >= 3) AND (char_length(title) <= 180)));
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_report_comments"
    ADD CONSTRAINT "school_report_comments_body_check" CHECK ((char_length(TRIM(BOTH FROM body)) >= 2));
ALTER TABLE ONLY "public"."school_report_comments"
    ADD CONSTRAINT "school_report_comments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_report_events"
    ADD CONSTRAINT "school_report_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_report_readiness_log"
    ADD CONSTRAINT "school_report_readiness_log_status_check" CHECK ((status = ANY (ARRAY['ready'::text, 'blocked'::text])));
ALTER TABLE ONLY "public"."school_report_readiness_log"
    ADD CONSTRAINT "school_report_readiness_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_revision_number_check" CHECK ((revision_number >= 1));
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_status_check" CHECK ((status = ANY (ARRAY['working'::text, 'published'::text, 'withdrawn'::text])));
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_report_id_revision_number_key" UNIQUE (report_id, revision_number);
ALTER TABLE ONLY "public"."school_settlements"
    ADD CONSTRAINT "school_settlements_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'void'::text])));
ALTER TABLE ONLY "public"."school_settlements"
    ADD CONSTRAINT "school_settlements_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_teacher_conversations"
    ADD CONSTRAINT "school_teacher_conversations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_teacher_conversations"
    ADD CONSTRAINT "school_teacher_conversations_school_id_teacher_id_key" UNIQUE (school_id, teacher_id);
ALTER TABLE ONLY "public"."school_teacher_messages"
    ADD CONSTRAINT "school_teacher_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."school_whatsapp_settings"
    ADD CONSTRAINT "school_whatsapp_settings_pkey" PRIMARY KEY (school_id);
ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_commission_rate_check" CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric)));
ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."session_recordings"
    ADD CONSTRAINT "session_recordings_status_check" CHECK ((status = ANY (ARRAY['recording'::text, 'processing'::text, 'ready'::text, 'failed'::text])));
ALTER TABLE ONLY "public"."session_recordings"
    ADD CONSTRAINT "session_recordings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."showcase_items"
    ADD CONSTRAINT "showcase_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."special_program_pages"
    ADD CONSTRAINT "special_program_pages_deposit_pct" CHECK (((deposit_percent > (0)::numeric) AND (deposit_percent <= (100)::numeric)));
ALTER TABLE ONLY "public"."special_program_pages"
    ADD CONSTRAINT "special_program_pages_slug_format" CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));
ALTER TABLE ONLY "public"."special_program_pages"
    ADD CONSTRAINT "special_program_pages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_assignment_engagement"
    ADD CONSTRAINT "student_assignment_engagement_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_assignment_engagement"
    ADD CONSTRAINT "student_assignment_engagement_student_id_course_id_term_num_key" UNIQUE (student_id, course_id, term_number, academic_year);
ALTER TABLE ONLY "public"."student_badges"
    ADD CONSTRAINT "student_badges_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_badges"
    ADD CONSTRAINT "student_badges_student_id_badge_key_key" UNIQUE (student_id, badge_key);
ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'dropped'::text, 'suspended'::text])));
ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_student_id_program_id_key" UNIQUE (student_id, program_id);
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'promoted'::text, 'repeated'::text, 'completed'::text, 'withdrawn'::text])));
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])));
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_verification_code_key" UNIQUE (verification_code);
ALTER TABLE ONLY "public"."student_streaks"
    ADD CONSTRAINT "student_streaks_pkey" PRIMARY KEY (student_id);
ALTER TABLE ONLY "public"."student_teacher_messages"
    ADD CONSTRAINT "student_teacher_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_teacher_threads"
    ADD CONSTRAINT "student_teacher_threads_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_teacher_threads"
    ADD CONSTRAINT "student_teacher_threads_student_id_teacher_id_key" UNIQUE (student_id, teacher_id);
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_check" CHECK ((from_class_id <> to_class_id));
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_reason_check" CHECK ((length(btrim(reason)) >= 10));
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_xp_ledger"
    ADD CONSTRAINT "student_xp_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_xp_summary"
    ADD CONSTRAINT "student_xp_summary_pkey" PRIMARY KEY (student_id);
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_class_arm_check" CHECK (((class_arm IS NULL) OR (class_arm ~ '^[A-Z0-9]{1,4}$'::text)));
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_enrollment_type_check" CHECK (((enrollment_type IS NULL) OR (enrollment_type = ANY (ARRAY['school'::text, 'online'::text, 'in_person'::text, 'special'::text]))));
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_partner_program_track_check" CHECK (((partner_program_track IS NULL) OR (partner_program_track = ANY (ARRAY['term'::text, 'holiday'::text]))));
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_payment_plan_check" CHECK ((payment_plan = ANY (ARRAY['full'::text, 'instalment'::text])));
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_pkey" PRIMARY KEY (group_id, user_id);
ALTER TABLE ONLY "public"."study_group_messages"
    ADD CONSTRAINT "study_group_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_billing_cycle_check" CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])));
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_owner_type_check" CHECK ((owner_type = ANY (ARRAY['school'::text, 'individual'::text])));
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pricing_model_check" CHECK ((pricing_model = ANY (ARRAY['fixed_school'::text, 'per_student'::text, 'individual_personal'::text, 'individual_online'::text])));
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'suspended'::text])));
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_category_check" CHECK ((category = ANY (ARRAY['general'::text, 'billing'::text, 'technical'::text, 'academic'::text, 'payment_proof'::text])));
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'reopened'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE (setting_key);
ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_teacher_id_school_id_key" UNIQUE (teacher_id, school_id);
ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_email_key" UNIQUE (email);
ALTER TABLE ONLY "public"."term_schedules"
    ADD CONSTRAINT "term_schedules_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_topic_id_user_id_key" UNIQUE (topic_id, user_id);
ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_portal_user_id_badge_id_key" UNIQUE (portal_user_id, badge_id);
ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_achievement_level_check" CHECK ((achievement_level = ANY (ARRAY['Bronze'::text, 'Silver'::text, 'Gold'::text, 'Platinum'::text])));
ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_portal_user_id_key" UNIQUE (portal_user_id);
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])));
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE (user_id);
ALTER TABLE ONLY "public"."vault_items"
    ADD CONSTRAINT "vault_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_endpoint_key" UNIQUE (endpoint);
ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_phone_number_key" UNIQUE (phone_number);
ALTER TABLE ONLY "public"."whatsapp_group_broadcasts"
    ADD CONSTRAINT "whatsapp_group_broadcasts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_meta_message_id_key" UNIQUE (meta_message_id);
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_max_attempts_check" CHECK (((max_attempts >= 1) AND (max_attempts <= 10)));
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'retry'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_idempotency_key_key" UNIQUE (idempotency_key);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS account_deletion_requests_email_idx ON public.account_deletion_requests USING btree (lower(email));
CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx ON public.account_deletion_requests USING btree (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_requests_user_idx ON public.account_deletion_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads USING btree (announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements USING btree (target_audience);
CREATE INDEX IF NOT EXISTS idx_announcements_class_id ON public.announcements USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON public.announcements USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_announcements_school_id ON public.announcements USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements USING btree (status);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_status ON public.assignment_submissions USING btree (assignment_id, status, grade) WHERE (grade IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_user ON public.assignment_submissions USING btree (assignment_id, portal_user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status_graded_at ON public.assignment_submissions USING btree (status, graded_at DESC) WHERE (status = 'graded'::text);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_id_status ON public.assignment_submissions USING btree (user_id, status, submitted_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_status ON public.assignment_submissions USING btree (portal_user_id, status, submitted_at DESC) WHERE (portal_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_portal_user ON public.assignment_submissions USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_portal_user_status ON public.assignment_submissions USING btree (portal_user_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.assignment_submissions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.assignment_submissions USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON public.assignment_submissions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_lesson_id ON public.assignments USING btree (lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_due_date ON public.assignments USING btree (class_id, due_date) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON public.assignments USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_active ON public.assignments USING btree (course_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON public.assignments USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id ON public.assignments USING btree (lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_program_id ON public.assignments USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_assignments_school ON public.assignments USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_term_id ON public.assignments USING btree (term_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_progression_marker ON public.assignments USING btree (((metadata ->> 'marker'::text))) WHERE (metadata ? 'marker'::text);
CREATE INDEX IF NOT EXISTS idx_attendance_class_term_roster ON public.attendance USING btree (class_term_roster_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_date ON public.attendance USING btree (session_id, created_at DESC) WHERE (session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance USING btree (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_term ON public.attendance USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON public.attendance USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_contacts_owner_type ON public.billing_contacts USING btree (owner_type);
CREATE INDEX IF NOT EXISTS idx_billing_contacts_owner_user_id ON public.billing_contacts USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_contacts_individual_owner ON public.billing_contacts USING btree (owner_user_id) WHERE ((owner_type = 'individual'::text) AND (owner_user_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_contacts_school_owner ON public.billing_contacts USING btree (school_id) WHERE ((owner_type = 'school'::text) AND (school_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_active_school_term_unique ON public.billing_cycles USING btree (owner_school_id, academic_term_id) WHERE ((owner_type = 'school'::text) AND (owner_school_id IS NOT NULL) AND (academic_term_id IS NOT NULL) AND (archived_at IS NULL) AND (status <> 'cancelled'::text));
CREATE INDEX IF NOT EXISTS idx_billing_cycles_academic_term_id ON public.billing_cycles USING btree (academic_term_id) WHERE (academic_term_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_active ON public.billing_cycles USING btree (status, due_date) WHERE (archived_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_owner_school ON public.billing_cycles USING btree (owner_school_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_owner_user ON public.billing_cycles USING btree (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_status_due ON public.billing_cycles USING btree (status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS billing_document_archive_doc_ref_uidx ON public.billing_document_archive USING btree (doc_ref);
CREATE INDEX IF NOT EXISTS billing_document_archive_school_created_idx ON public.billing_document_archive USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_notices_open ON public.billing_notices USING btree (is_resolved, due_date);
CREATE INDEX IF NOT EXISTS idx_billing_logs_cycle_week ON public.billing_reminder_logs USING btree (billing_cycle_id, week_number);
CREATE INDEX IF NOT EXISTS idx_card_audit_logs_actor ON public.card_audit_logs USING btree (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_audit_logs_card ON public.card_audit_logs USING btree (card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_scan_logs_card ON public.card_scan_logs USING btree (card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_active ON public.cbt_exams USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_class_term ON public.cbt_exams USING btree (class_id, term_id) WHERE (class_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_created_by ON public.cbt_exams USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_lesson ON public.cbt_exams USING btree (lesson_id) WHERE (lesson_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_lesson_plan ON public.cbt_exams USING btree (lesson_plan_id) WHERE (lesson_plan_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_program ON public.cbt_exams USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_school ON public.cbt_exams USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_term_id ON public.cbt_exams USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_exam ON public.cbt_questions USING btree (exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam ON public.cbt_sessions USING btree (exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam_status ON public.cbt_sessions USING btree (exam_id, status, score) WHERE (score IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_needs_grading ON public.cbt_sessions USING btree (needs_grading) WHERE (needs_grading = true);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user ON public.cbt_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user_status ON public.cbt_sessions USING btree (user_id, status, end_time DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_metadata_school_id ON public.certificates USING btree (((metadata ->> 'school_id'::text)));
CREATE INDEX IF NOT EXISTS class_lesson_delivery_scope_idx ON public.class_lesson_delivery USING btree (class_id, academic_term_id, course_id, week_number);
CREATE UNIQUE INDEX IF NOT EXISTS class_lesson_delivery_week_placeholder_unique ON public.class_lesson_delivery USING btree (lesson_plan_id, week_number) WHERE (lesson_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_class_sessions_term ON public.class_sessions USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON public.class_sessions USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.class_sessions USING btree (session_date);
CREATE UNIQUE INDEX IF NOT EXISTS class_term_rosters_unique_no_term ON public.class_term_rosters USING btree (class_id, student_id) WHERE (term_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS class_term_rosters_unique_term ON public.class_term_rosters USING btree (class_id, student_id, term_id) WHERE (term_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_billing_cycle ON public.class_term_rosters USING btree (billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_billing_status ON public.class_term_rosters USING btree (billing_status);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_class_status ON public.class_term_rosters USING btree (class_id, status);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_invoice ON public.class_term_rosters USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_student ON public.class_term_rosters USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_subscription_status ON public.class_term_rosters USING btree (subscription_status);
CREATE INDEX IF NOT EXISTS idx_class_term_rosters_term ON public.class_term_rosters USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_classes_placement ON public.classes USING btree (school_id, band_lvl, band_low, band_high);
CREATE INDEX IF NOT EXISTS idx_classes_program ON public.classes USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_classes_school ON public.classes USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON public.classes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON public.classes USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_school ON public.classes USING btree (teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_classes_term_id ON public.classes USING btree (term_id);
CREATE INDEX IF NOT EXISTS communication_abuse_events_sender_idx ON public.communication_abuse_events USING btree (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_abuse_events_type_idx ON public.communication_abuse_events USING btree (event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS communication_case_event_source_idx ON public.communication_case_events USING btree (source_type, source_id) WHERE ((source_type IS NOT NULL) AND (source_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS communication_case_events_case_idx ON public.communication_case_events USING btree (case_id, created_at);
CREATE INDEX IF NOT EXISTS communication_case_events_provider_message_id_idx ON public.communication_case_events USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS communication_case_events_provider_message_unique ON public.communication_case_events USING btree (provider, provider_message_id) WHERE ((provider IS NOT NULL) AND (provider_message_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS communication_cases_owner_status_idx ON public.communication_cases USING btree (assigned_to, status, first_response_due_at);
CREATE INDEX IF NOT EXISTS communication_cases_requester_idx ON public.communication_cases USING btree (requester_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS communication_conversation_meta_followup_idx ON public.communication_conversation_meta USING btree (status, sla_due_at, last_reminder_at) WHERE (status = ANY (ARRAY['open'::text, 'pending'::text]));
CREATE INDEX IF NOT EXISTS communication_conversation_meta_sla_idx ON public.communication_conversation_meta USING btree (status, priority, sla_due_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_conv_meta_conversation ON public.communication_conversation_meta USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS communication_customer_identities_customer_idx ON public.communication_customer_identities USING btree (customer_key);
CREATE INDEX IF NOT EXISTS communication_delivery_case_idx ON public.communication_delivery_log USING btree (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_delivery_log_provider_message_id_idx ON public.communication_delivery_log USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS communication_delivery_provider_unique ON public.communication_delivery_log USING btree (provider, provider_message_id) WHERE ((provider IS NOT NULL) AND (provider_message_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS communication_escalations_status_idx ON public.communication_escalations USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_rate_limits_day_idx ON public.communication_rate_limits USING btree (day_bucket DESC);
CREATE UNIQUE INDEX IF NOT EXISTS communication_rate_limits_sender_day_uidx ON public.communication_rate_limits USING btree (sender_id, day_bucket);
CREATE INDEX IF NOT EXISTS communication_reports_conversation_idx ON public.communication_reports USING btree (target_conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_reports_status_idx ON public.communication_reports USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_templates_status_channel_idx ON public.communication_templates USING btree (status, channel, category);
CREATE INDEX IF NOT EXISTS idx_consent_forms_created_by ON public.consent_forms USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_consent_forms_due_date ON public.consent_forms USING btree (due_date) WHERE (due_date IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_consent_forms_school_id ON public.consent_forms USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_consent_responses_form_id ON public.consent_responses USING btree (form_id);
CREATE INDEX IF NOT EXISTS idx_consent_responses_parent_id ON public.consent_responses USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_consent_submission_throttle_expiry ON public.consent_submission_throttle USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_consent_submission_throttle_lookup ON public.consent_submission_throttle USING btree (form_id, ip_hmac, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_library_program_id ON public.content_library USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_course_curricula_course_id ON public.course_curricula USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_course_curricula_created_by ON public.course_curricula USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_course_curricula_school_id ON public.course_curricula USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_courses_active ON public.courses USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_courses_metadata_grade_levels ON public.courses USING gin (((metadata -> 'grade_levels'::text)));
CREATE INDEX IF NOT EXISTS idx_courses_next ON public.courses USING btree (next_course_id);
CREATE INDEX IF NOT EXISTS idx_courses_program ON public.courses USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_courses_school ON public.courses USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_courses_teacher ON public.courses USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS crm_attachments_contact_idx ON public.crm_attachments USING btree (contact_id);
CREATE INDEX IF NOT EXISTS crm_interactions_contact_idx ON public.crm_interactions USING btree (contact_id);
CREATE INDEX IF NOT EXISTS crm_interactions_created_idx ON public.crm_interactions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_opportunities_stage_idx ON public.crm_opportunities USING btree (stage, expected_close_at);
CREATE INDEX IF NOT EXISTS crm_pipeline_contact_idx ON public.crm_pipeline USING btree (contact_id);
CREATE INDEX IF NOT EXISTS crm_pipeline_stage_idx ON public.crm_pipeline USING btree (stage);
CREATE INDEX IF NOT EXISTS crm_tasks_status_due_idx ON public.crm_tasks USING btree (status, due_at);
CREATE INDEX IF NOT EXISTS cron_run_history_job_created_idx ON public.cron_run_history USING btree (job_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curriculum_project_registry_school ON public.curriculum_project_registry USING btree (school_id, track);
CREATE INDEX IF NOT EXISTS idx_curriculum_project_registry_scope ON public.curriculum_project_registry USING btree (program_id, course_id, track, is_active);
CREATE INDEX IF NOT EXISTS idx_curriculum_project_usage_recent ON public.curriculum_project_usage USING btree (school_id, project_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_curriculum_project_usage_term ON public.curriculum_project_usage USING btree (school_id, year_number, term_number, week_number);
CREATE INDEX IF NOT EXISTS idx_curriculum_week_performance_scope ON public.curriculum_week_performance USING btree (school_id, lesson_plan_id, week_number);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_tracking_global_idx ON public.curriculum_week_tracking USING btree (curriculum_id, term_number, week_number) WHERE (school_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_tracking_school_idx ON public.curriculum_week_tracking USING btree (curriculum_id, school_id, term_number, week_number) WHERE (school_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_week_tracking_unique_class_week ON public.curriculum_week_tracking USING btree (curriculum_id, school_id, class_id, term_number, week_number) WHERE ((school_id IS NOT NULL) AND (class_id IS NOT NULL) AND (lesson_plan_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_week_tracking_unique_plan_week ON public.curriculum_week_tracking USING btree (curriculum_id, school_id, class_id, lesson_plan_id, term_number, week_number) WHERE ((school_id IS NOT NULL) AND (class_id IS NOT NULL) AND (lesson_plan_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_curriculum_week_tracking_class ON public.curriculum_week_tracking USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_week_tracking_lesson_plan ON public.curriculum_week_tracking USING btree (lesson_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_book_email_uidx ON public.customer_contact_book USING btree (lower(btrim(email))) WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_book_phone_uidx ON public.customer_contact_book USING btree (phone) WHERE ((phone IS NOT NULL) AND (btrim(phone) <> ''::text));
CREATE INDEX IF NOT EXISTS customer_contact_book_role_idx ON public.customer_contact_book USING btree (role, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS customer_contact_book_school_class_idx ON public.customer_contact_book USING btree (school_name, class_name);
CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_book_user_uidx ON public.customer_contact_book USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dpt_platform ON public.device_push_tokens USING btree (platform);
CREATE INDEX IF NOT EXISTS idx_dpt_portal_user ON public.device_push_tokens USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS email_thread_case_idx ON public.email_thread_links USING btree (case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS email_thread_internet_message_unique ON public.email_thread_links USING btree (internet_message_id) WHERE (internet_message_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS email_thread_provider_message_unique ON public.email_thread_links USING btree (provider, provider_message_id) WHERE ((provider IS NOT NULL) AND (provider_message_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_engage_posts_created ON public.engage_posts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engage_posts_user ON public.engage_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_term_grades_enrollment ON public.enrollment_term_grades USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_term_grades_term ON public.enrollment_term_grades USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_program ON public.enrollments USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_program_status ON public.enrollments USING btree (program_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.enrollments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status ON public.enrollments USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS feedback_assigned_status_idx ON public.feedback USING btree (assigned_to, status, first_response_due_at);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.feedback USING btree (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback USING btree (status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback USING btree (type);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_automation_log_success_dedup ON public.finance_automation_log USING btree (stream, entity_id, COALESCE(stage, ''::text), channel) WHERE (lower(status) = 'success'::text);
CREATE INDEX IF NOT EXISTS idx_finance_automation_log_entity ON public.finance_automation_log USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_automation_log_failed ON public.finance_automation_log USING btree (status, created_at DESC) WHERE (lower(status) = 'failed'::text);
CREATE INDEX IF NOT EXISTS idx_flagged_content_type_id ON public.flagged_content USING btree (content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_flagged_status ON public.flagged_content USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cards_difficulty ON public.flashcard_cards USING btree (difficulty_level);
CREATE INDEX IF NOT EXISTS idx_cards_starred ON public.flashcard_cards USING btree (is_starred) WHERE (is_starred = true);
CREATE INDEX IF NOT EXISTS idx_cards_tags ON public.flashcard_cards USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_flashcard_cards_deck_id ON public.flashcard_cards USING btree (deck_id);
CREATE INDEX IF NOT EXISTS idx_decks_tags ON public.flashcard_decks USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_class_term ON public.flashcard_decks USING btree (class_id, term_id) WHERE (class_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_course_id ON public.flashcard_decks USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_created_by ON public.flashcard_decks USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_lesson_id ON public.flashcard_decks USING btree (lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_lesson_plan ON public.flashcard_decks USING btree (lesson_plan_id) WHERE (lesson_plan_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_school_id ON public.flashcard_decks USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_term_id ON public.flashcard_decks USING btree (term_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcard_decks_owner_title_scope ON public.flashcard_decks USING btree (created_by, lower(btrim(title)), COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcard_decks_progression_marker ON public.flashcard_decks USING btree (((progression_policy_snapshot ->> 'marker'::text))) WHERE (progression_policy_snapshot ? 'marker'::text);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card_id ON public.flashcard_reviews USING btree (card_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_next_review_at ON public.flashcard_reviews USING btree (next_review_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_student_id ON public.flashcard_reviews USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_fr_student_review ON public.flashcard_reviews USING btree (student_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_reviews_next_review ON public.flashcard_reviews USING btree (student_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_study_sessions_deck ON public.flashcard_study_sessions USING btree (deck_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_student ON public.flashcard_study_sessions USING btree (student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_lead_child_links_lead_status ON public.form_lead_child_links USING btree (lead_id, status);
CREATE INDEX IF NOT EXISTS idx_form_lead_child_links_student ON public.form_lead_child_links USING btree (student_portal_user_id);
CREATE INDEX IF NOT EXISTS idx_form_leads_match_status ON public.form_leads USING btree (match_status) WHERE (match_status = 'pending_review'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_leads_approved_matched_student ON public.form_leads USING btree (form_id, matched_student_id) WHERE ((matched_student_id IS NOT NULL) AND (match_status = 'approved'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_leads_form_contact_child ON public.form_leads USING btree (form_id, COALESCE(NULLIF(lower(btrim(COALESCE(email, (response_data ->> 'parent_email'::text), ''::text))), ''::text), NULLIF(regexp_replace(COALESCE((response_data ->> 'parent_whatsapp'::text), ''::text), '\D'::text, ''::text, 'g'::text), ''::text)), lower(regexp_replace(btrim(COALESCE((response_data ->> 'child_name'::text), ''::text)), '\s+'::text, ' '::text, 'g'::text))) WHERE ((COALESCE(NULLIF(lower(btrim(COALESCE(email, (response_data ->> 'parent_email'::text), ''::text))), ''::text), NULLIF(regexp_replace(COALESCE((response_data ->> 'parent_whatsapp'::text), ''::text), '\D'::text, ''::text, 'g'::text), ''::text)) IS NOT NULL) AND (btrim(COALESCE((response_data ->> 'child_name'::text), ''::text)) <> ''::text));
CREATE INDEX IF NOT EXISTS idx_grade_reports_portal_user ON public.grade_reports USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_grade_reports_student ON public.grade_reports USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_identity_cards_holder ON public.identity_cards USING btree (holder_type, holder_id);
CREATE INDEX IF NOT EXISTS idx_identity_cards_school ON public.identity_cards USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_identity_cards_status ON public.identity_cards USING btree (status);
CREATE INDEX IF NOT EXISTS idx_instalment_items_due ON public.instalment_items USING btree (due_date) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_instalment_items_due_date ON public.instalment_items USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_instalment_items_plan ON public.instalment_items USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_instalment_items_plan_id ON public.instalment_items USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_instalment_items_status ON public.instalment_items USING btree (status);
CREATE INDEX IF NOT EXISTS idx_instalment_plans_invoice_id ON public.instalment_plans USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_instalment_plans_parent_id ON public.instalment_plans USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_instalment_plans_status ON public.instalment_plans USING btree (status);
CREATE INDEX IF NOT EXISTS idx_invoice_automation_logs_created_at ON public.invoice_automation_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_proofs_invoice_id ON public.invoice_payment_proofs USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_proofs_submitted_by ON public.invoice_payment_proofs USING btree (submitted_by);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_cycle_id ON public.invoices USING btree (billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices USING btree (due_date) WHERE (status <> 'paid'::text);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_tx ON public.invoices USING btree (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoices_portal_user_id ON public.invoices USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_school_id ON public.invoices USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_school_status ON public.invoices USING btree (school_id, status) WHERE (school_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_invoices_stream_status ON public.invoices USING btree (stream, status);
CREATE INDEX IF NOT EXISTS idx_invoices_student_status ON public.invoices USING btree (portal_user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_unpaid ON public.invoices USING btree (portal_user_id, school_id, due_date) WHERE (status <> 'paid'::text);
CREATE INDEX IF NOT EXISTS invoices_school_academic_term_metadata_idx ON public.invoices USING btree (school_id, ((metadata ->> 'academic_term_id'::text))) WHERE ((school_id IS NOT NULL) AND (COALESCE(stream, 'school'::text) = 'school'::text) AND (status <> ALL (ARRAY['cancelled'::text, 'void'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS invoices_school_term_active_uidx ON public.invoices USING btree (school_id, ((metadata ->> 'academic_year'::text)), ((metadata ->> 'term_number'::text))) WHERE ((stream = 'school'::text) AND (school_id IS NOT NULL) AND (status IS DISTINCT FROM 'cancelled'::text) AND (status IS DISTINCT FROM 'void'::text) AND ((metadata ->> 'academic_year'::text) IS NOT NULL) AND ((metadata ->> 'term_number'::text) IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_lesson_plans_class_id ON public.lesson_plans USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_course_id ON public.lesson_plans USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_created_by ON public.lesson_plans USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_curriculum_version_id ON public.lesson_plans USING btree (curriculum_version_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_school_id ON public.lesson_plans USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_term_id ON public.lesson_plans USING btree (term_id);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_plans_active_class_term_course_unique ON public.lesson_plans USING btree (class_id, term_id, course_id) WHERE ((class_id IS NOT NULL) AND (term_id IS NOT NULL) AND (course_id IS NOT NULL) AND (status <> 'archived'::text));
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON public.lesson_progress USING btree (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_portal_user ON public.lesson_progress USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_status ON public.lesson_progress USING btree (status);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_accessed ON public.lesson_progress USING btree (portal_user_id, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson ON public.lesson_progress USING btree (portal_user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_status ON public.lesson_progress USING btree (portal_user_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON public.lessons USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_status ON public.lessons USING btree (course_id, status);
CREATE INDEX IF NOT EXISTS idx_lessons_created_by ON public.lessons USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_lessons_metadata_lesson_plan_id ON public.lessons USING btree (((metadata ->> 'lesson_plan_id'::text))) WHERE (metadata IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lessons_school ON public.lessons USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON public.lessons USING btree (status);
CREATE INDEX IF NOT EXISTS lessons_class_term_idx ON public.lessons USING btree (class_id, academic_term_id) WHERE ((class_id IS NOT NULL) AND (academic_term_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS lessons_lesson_plan_id_idx ON public.lessons USING btree (lesson_plan_id) WHERE (lesson_plan_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_live_session_attendance_session ON public.live_session_attendance USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_attendance_user ON public.live_session_attendance USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_room ON public.live_session_breakout_participants USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_breakout_participants_user ON public.live_session_breakout_participants USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_breakout_rooms_session ON public.live_session_breakout_rooms USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.live_session_poll_options USING btree (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON public.live_session_poll_responses USING btree (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user ON public.live_session_poll_responses USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_live_session_polls_session ON public.live_session_polls USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_polls_session ON public.live_session_polls USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_questions_session ON public.live_session_questions USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host ON public.live_sessions USING btree (host_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled ON public.live_sessions USING btree (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_live_sessions_school ON public.live_sessions USING btree (school_id);
CREATE INDEX IF NOT EXISTS marketing_events_campaign_idx ON public.marketing_events USING btree (campaign_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON public.messages USING btree (is_read);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages USING btree (recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON public.messages USING btree (recipient_id, is_read) WHERE (is_read = false);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages USING btree (sender_id);
CREATE UNIQUE INDEX IF NOT EXISTS notification_dead_letters_original_job_unique ON public.notification_dead_letters USING btree (source, original_job_id) WHERE ((original_job_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'retrying'::text])));
CREATE INDEX IF NOT EXISTS notification_dead_letters_status_created_idx ON public.notification_dead_letters USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications USING btree (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (is_read = false);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications USING btree (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS operations_duty_rota_active_idx ON public.operations_duty_rota USING btree (duty_kind, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS operations_duty_rota_staff_idx ON public.operations_duty_rota USING btree (staff_id, starts_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS operations_one_primary_admin_idx ON public.operations_staff_settings USING btree (is_primary_admin) WHERE (is_primary_admin = true);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_action ON public.parent_claim_audit USING btree (action);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_created ON public.parent_claim_audit USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_email ON public.parent_claim_audit USING btree (email);
CREATE INDEX IF NOT EXISTS idx_parent_claim_audit_student ON public.parent_claim_audit USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_expires ON public.parent_claim_otps USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_parent_claim_otps_student ON public.parent_claim_otps USING btree (student_id);
CREATE INDEX IF NOT EXISTS parent_feedback_created_at_idx ON public.parent_feedback USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS parent_feedback_portal_user_id_idx ON public.parent_feedback USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS parent_feedback_status_idx ON public.parent_feedback USING btree (status);
CREATE INDEX IF NOT EXISTS idx_psl_parent_id ON public.parent_student_links USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_psl_student_id ON public.parent_student_links USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_student_links_student_id ON public.parent_student_links USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_messages_sender_id ON public.parent_teacher_messages USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_messages_sent_at ON public.parent_teacher_messages USING btree (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_messages_thread_id ON public.parent_teacher_messages USING btree (thread_id);
CREATE INDEX IF NOT EXISTS idx_ptm_thread_sent ON public.parent_teacher_messages USING btree (thread_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_threads_parent_id ON public.parent_teacher_threads USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_threads_student_id ON public.parent_teacher_threads USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_teacher_threads_teacher_id ON public.parent_teacher_threads USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_school ON public.payment_accounts USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_type ON public.payment_accounts USING btree (owner_type);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON public.payment_allocations USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_txn ON public.payment_allocations USING btree (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON public.payment_transactions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id ON public.payment_transactions USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_portal_user_id ON public.payment_transactions USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_school_id ON public.payment_transactions USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions USING btree (payment_status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_program ON public.payments USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments USING btree (user_id);
CREATE INDEX IF NOT EXISTS platform_syllabus_week_template_grade_track_idx ON public.platform_syllabus_week_template USING btree (program_id, grade_key, track, year_number, term_number, week_number);
CREATE INDEX IF NOT EXISTS platform_syllabus_week_template_program_lane_idx ON public.platform_syllabus_week_template USING btree (program_id, lane_index, week_index);
CREATE INDEX IF NOT EXISTS idx_portal_users_active ON public.portal_users USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_portal_users_active_students ON public.portal_users USING btree (id, school_id, last_login) WHERE ((role = 'student'::text) AND (is_active = true) AND (is_deleted = false));
CREATE INDEX IF NOT EXISTS idx_portal_users_class_id ON public.portal_users USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON public.portal_users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_portal_users_primary_teacher ON public.portal_users USING btree (primary_teacher_id) WHERE (primary_teacher_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_portal_users_role ON public.portal_users USING btree (role);
CREATE INDEX IF NOT EXISTS idx_portal_users_role_active ON public.portal_users USING btree (role, is_active, school_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_portal_users_role_school ON public.portal_users USING btree (role, school_id) WHERE (is_deleted = false);
CREATE INDEX IF NOT EXISTS idx_portal_users_school ON public.portal_users USING btree (school_id, role) WHERE (school_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_portal_users_school_class ON public.portal_users USING btree (school_id, class_id) WHERE ((role = 'student'::text) AND (is_deleted = false));
CREATE INDEX IF NOT EXISTS idx_portal_users_school_id ON public.portal_users USING btree (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_student_email_unique ON public.portal_users USING btree (lower(email)) WHERE ((role = 'student'::text) AND (is_deleted = false));
CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in ON public.portal_users USING btree (whatsapp_opt_in) WHERE (whatsapp_opt_in = true);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_user ON public.portfolio_projects USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_programs_active ON public.programs USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_programs_difficulty ON public.programs USING btree (difficulty_level);
CREATE INDEX IF NOT EXISTS idx_progression_override_audit_plan ON public.progression_override_audit USING btree (lesson_plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progression_override_audit_school ON public.progression_override_audit USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proj_eng_school_idx ON public.project_engagement USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proj_eng_showcase_idx ON public.project_engagement USING btree (is_showcase) WHERE (is_showcase = true);
CREATE INDEX IF NOT EXISTS proj_eng_student_idx ON public.project_engagement USING btree (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_members_group ON public.project_group_members USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_pg_members_student ON public.project_group_members USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_assignment ON public.project_groups USING btree (assignment_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_class ON public.project_groups USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_ps_email ON public.prospective_students USING btree (email);
CREATE INDEX IF NOT EXISTS idx_ps_status ON public.prospective_students USING btree (status);
CREATE INDEX IF NOT EXISTS idx_receipts_school_id ON public.receipts USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_receipts_stream_issued ON public.receipts USING btree (stream, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_student_id ON public.receipts USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON public.receipts USING btree (transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_transaction_id_unique ON public.receipts USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_result_access_codes_school_id ON public.result_access_codes USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_result_access_codes_updated_at ON public.result_access_codes USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_performance_reports_school_status ON public.school_performance_reports USING btree (school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_performance_reports_term ON public.school_performance_reports USING btree (academic_term_id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_performance_reports_verification_code ON public.school_performance_reports USING btree (verification_code) WHERE (verification_code IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS school_performance_reports_active_term_uidx ON public.school_performance_reports USING btree (school_id, academic_term_id) WHERE ((status = ANY (ARRAY['draft'::text, 'published'::text])) AND (academic_term_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS school_report_comments_report_idx ON public.school_report_comments USING btree (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_report_events_report_idx ON public.school_report_events USING btree (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS school_report_readiness_log_report_idx ON public.school_report_readiness_log USING btree (report_id, checked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS school_report_one_working_revision_idx ON public.school_report_revisions USING btree (report_id) WHERE (status = 'working'::text);
CREATE INDEX IF NOT EXISTS school_report_revisions_report_status_idx ON public.school_report_revisions USING btree (report_id, status, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_school_settlements_billing_cycle_id ON public.school_settlements USING btree (billing_cycle_id) WHERE (billing_cycle_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_school_settlements_cycle ON public.school_settlements USING btree (billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_school_settlements_paid_by ON public.school_settlements USING btree (paid_by) WHERE (paid_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_school_settlements_school_id ON public.school_settlements USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_school_settlements_school_status ON public.school_settlements USING btree (school_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS school_settlements_active_cycle_unique ON public.school_settlements USING btree (billing_cycle_id) WHERE ((billing_cycle_id IS NOT NULL) AND (lower(COALESCE(status, ''::text)) <> 'void'::text));
CREATE INDEX IF NOT EXISTS idx_st_conversations_school ON public.school_teacher_conversations USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_st_conversations_teacher ON public.school_teacher_conversations USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_st_conversations_updated ON public.school_teacher_conversations USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_st_messages_conversation ON public.school_teacher_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_st_messages_created ON public.school_teacher_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_st_messages_sender ON public.school_teacher_messages USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_st_messages_unread ON public.school_teacher_messages USING btree (conversation_id, is_read) WHERE (is_read = false);
CREATE INDEX IF NOT EXISTS idx_schools_public_enrollment_open ON public.schools USING btree (public_enrollment_open) WHERE (public_enrollment_open = true);
CREATE UNIQUE INDEX IF NOT EXISTS schools_normalized_name_unique ON public.schools USING btree (lower(regexp_replace(btrim(name), '\s+'::text, ' '::text, 'g'::text)));
CREATE INDEX IF NOT EXISTS idx_session_recordings_lesson ON public.session_recordings USING btree (lesson_id) WHERE (lesson_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_session_recordings_program ON public.session_recordings USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_school ON public.session_recordings USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_session ON public.session_recordings USING btree (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_recordings_egress ON public.session_recordings USING btree (egress_id) WHERE (egress_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS showcase_published_idx ON public.showcase_items USING btree (is_published, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS showcase_school_idx ON public.showcase_items USING btree (school_id, is_published);
CREATE INDEX IF NOT EXISTS showcase_student_idx ON public.showcase_items USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS special_program_pages_one_featured_uidx ON public.special_program_pages USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX IF NOT EXISTS special_program_pages_published_idx ON public.special_program_pages USING btree (is_published, is_featured);
CREATE UNIQUE INDEX IF NOT EXISTS special_program_pages_slug_uidx ON public.special_program_pages USING btree (slug);
CREATE INDEX IF NOT EXISTS asgn_eng_pct_idx ON public.student_assignment_engagement USING btree (submission_pct);
CREATE INDEX IF NOT EXISTS asgn_eng_school_idx ON public.student_assignment_engagement USING btree (school_id);
CREATE INDEX IF NOT EXISTS asgn_eng_student_idx ON public.student_assignment_engagement USING btree (student_id);
CREATE INDEX IF NOT EXISTS badges_school_idx ON public.student_badges USING btree (school_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS badges_student_idx ON public.student_badges USING btree (student_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_program ON public.student_enrollments USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_status ON public.student_enrollments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON public.student_enrollments USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_sle_course ON public.student_level_enrollments USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_sle_school ON public.student_level_enrollments USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_sle_status ON public.student_level_enrollments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_sle_student ON public.student_level_enrollments USING btree (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sle_unique_active ON public.student_level_enrollments USING btree (student_id, course_id, term_label) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS idx_progress_course ON public.student_progress USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_progress_portal_user ON public.student_progress USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_progress_student ON public.student_progress USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_reports_term_id ON public.student_progress_reports USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_spr_published_at ON public.student_progress_reports USING btree (published_at) WHERE (published_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_spr_school ON public.student_progress_reports USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_spr_school_id ON public.student_progress_reports USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_spr_student ON public.student_progress_reports USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_spr_student_id ON public.student_progress_reports USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_spr_teacher ON public.student_progress_reports USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_spr_teacher_id ON public.student_progress_reports USING btree (teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_canonical_term_course ON public.student_progress_reports USING btree (student_id, term_id, lower(btrim(COALESCE(course_name, ''::text)))) WHERE ((student_id IS NOT NULL) AND (term_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_legacy_term_course ON public.student_progress_reports USING btree (student_id, lower(btrim(COALESCE(report_term, ''::text))), lower(btrim(COALESCE(report_period, ''::text))), lower(btrim(COALESCE(course_name, ''::text)))) WHERE ((student_id IS NOT NULL) AND (term_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_transfer_requests_from_teacher ON public.student_transfer_requests USING btree (from_teacher_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_requester ON public.student_transfer_requests USING btree (requested_by, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_student_transfer ON public.student_transfer_requests USING btree (student_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS xp_ledger_event_idx ON public.student_xp_ledger USING btree (event_key);
CREATE INDEX IF NOT EXISTS xp_ledger_school_idx ON public.student_xp_ledger USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xp_ledger_student_idx ON public.student_xp_ledger USING btree (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_approved_by ON public.students USING btree (approved_by);
CREATE INDEX IF NOT EXISTS idx_students_enrollment_type ON public.students USING btree (enrollment_type);
CREATE INDEX IF NOT EXISTS idx_students_parent_email ON public.students USING btree (parent_email);
CREATE INDEX IF NOT EXISTS idx_students_partner_program_track ON public.students USING btree (partner_program_track) WHERE (partner_program_track IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_students_rc_code ON public.students USING btree (rc_code) WHERE (rc_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_students_school_lookup ON public.students USING btree (school_id, user_id) WHERE (school_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_student_number ON public.students USING btree (student_number) WHERE (student_number IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_school_name_parent ON public.students USING btree (school_id, lower(btrim(COALESCE(full_name, ''::text))), lower(btrim(parent_email))) WHERE ((school_id IS NOT NULL) AND (parent_email IS NOT NULL) AND (COALESCE(is_deleted, false) = false));
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id ON public.students USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_group_id ON public.study_group_members USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_study_group_members_user_id ON public.study_group_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sgm_group_created ON public.study_group_messages USING btree (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_group_messages_created_at ON public.study_group_messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_group_messages_group_id ON public.study_group_messages USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_study_group_messages_sender_id ON public.study_group_messages USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_study_groups_course_id ON public.study_groups USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_study_groups_created_by ON public.study_groups USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_study_groups_school_id ON public.study_groups USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_study_groups_status ON public.study_groups USING btree (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_id ON public.subscriptions USING btree (school_id) WHERE (school_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_status ON public.subscriptions USING btree (school_id, status) WHERE (school_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS support_tickets_invoice_id_idx ON public.support_tickets USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_settings_category ON public.system_settings USING btree (category);
CREATE INDEX IF NOT EXISTS idx_settings_key ON public.system_settings USING btree (setting_key);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_school ON public.teacher_schools USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_schools_teacher ON public.teacher_schools USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_term_schedules_is_active ON public.term_schedules USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_term_schedules_lesson_plan_id ON public.term_schedules USING btree (lesson_plan_id);
CREATE INDEX IF NOT EXISTS idx_term_schedules_school_id ON public.term_schedules USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_ts_active ON public.term_schedules USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher ON public.timetable_slots USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_timetable ON public.timetable_slots USING btree (timetable_id);
CREATE INDEX IF NOT EXISTS idx_timetables_school ON public.timetables USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_timetables_term_id ON public.timetables USING btree (term_id);
CREATE INDEX IF NOT EXISTS idx_topic_subs_topic ON public.topic_subscriptions USING btree (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_subs_user ON public.topic_subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_leaderboard ON public.user_points USING btree (total_points DESC, portal_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON public.user_profiles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_created ON public.vault_items USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_items_user ON public.vault_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_wps_portal_user ON public.web_push_subscriptions USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON public.whatsapp_conversations USING btree (phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_staff ON public.whatsapp_conversations USING btree (assigned_staff_id) WHERE (assigned_staff_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_message_at ON public.whatsapp_conversations USING btree (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out ON public.whatsapp_conversations USING btree (opted_out) WHERE (opted_out = true);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_portal_user_id ON public.whatsapp_conversations USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_school_name ON public.whatsapp_conversations USING btree (school_name) WHERE (school_name IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_group ON public.whatsapp_group_broadcasts USING btree (group_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_school ON public.whatsapp_group_broadcasts USING btree (school_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_sender ON public.whatsapp_group_broadcasts USING btree (sent_by, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_class ON public.whatsapp_groups USING btree (class_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_owner ON public.whatsapp_groups USING btree (owner_teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_meta_id ON public.whatsapp_messages USING btree (meta_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON public.whatsapp_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_class ON public.whatsapp_outbox USING btree (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_meta ON public.whatsapp_outbox USING btree (meta_message_id) WHERE (meta_message_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_ready ON public.whatsapp_outbox USING btree (status, next_attempt_at, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'retry'::text]));

-- ============================================================================
-- VIEWS & MATERIALIZED VIEWS
-- ============================================================================

CREATE MATERIALIZED VIEW "public"."admin_dashboard_stats" AS
SELECT ( SELECT count(*) AS count
           FROM public.schools) AS total_schools,
    ( SELECT count(*) AS count
           FROM public.schools
          WHERE schools.status = 'active'::text) AS active_schools,
    ( SELECT count(*) AS count
           FROM public.portal_users
          WHERE portal_users.role = 'teacher'::text AND portal_users.is_active = true) AS total_teachers,
    ( SELECT count(*) AS count
           FROM public.students) AS total_students,
    ( SELECT count(*) AS count
           FROM public.portal_users
          WHERE portal_users.role = 'school'::text AND portal_users.is_active = true) AS total_partners,
    ( SELECT count(*) AS count
           FROM public.assignment_submissions
          WHERE assignment_submissions.grade IS NOT NULL) AS graded_assignments,
    ( SELECT count(*) AS count
           FROM public.cbt_sessions
          WHERE cbt_sessions.score IS NOT NULL) AS graded_cbt,
    now() AS last_updated;
ALTER MATERIALIZED VIEW "public"."admin_dashboard_stats" OWNER TO "postgres";

CREATE VIEW "public"."class_term_teaching_progress" AS
SELECT p.id AS lesson_plan_id,
    p.class_id,
    p.term_id AS academic_term_id,
    p.course_id,
    p.curriculum_version_id,
    count(DISTINCT l.id)::integer AS lesson_count,
    count(DISTINCT d.id) FILTER (WHERE d.status = 'delivered'::text)::integer AS delivered_count,
    count(DISTINCT d.week_number) FILTER (WHERE d.status = 'delivered'::text)::integer AS delivered_weeks,
    max(d.week_number) FILTER (WHERE d.status = 'delivered'::text) AS latest_delivered_week,
    max(d.delivered_at) FILTER (WHERE d.status = 'delivered'::text) AS last_delivered_at
   FROM public.lesson_plans p
     LEFT JOIN public.lessons l ON l.lesson_plan_id = p.id
     LEFT JOIN public.class_lesson_delivery d ON d.lesson_plan_id = p.id
  WHERE p.status <> 'archived'::text
  GROUP BY p.id, p.class_id, p.term_id, p.course_id, p.curriculum_version_id;
ALTER VIEW "public"."class_term_teaching_progress" OWNER TO "postgres";

CREATE VIEW "public"."finance_ledger" WITH (security_invoker=on) AS
SELECT t.id AS transaction_id,
    t.created_at AS transacted_at,
    t.paid_at,
    t.payment_status AS status,
    t.payment_method AS method,
    t.amount,
    t.currency,
    t.transaction_reference AS reference,
    t.receipt_url,
    t.school_id,
    t.portal_user_id,
    i.id AS invoice_id,
    i.invoice_number,
    i.stream,
    r.id AS receipt_id,
    r.receipt_number,
    COALESCE(s.commission_rate, 15::numeric) AS commission_rate
   FROM public.payment_transactions t
     LEFT JOIN public.invoices i ON i.id = t.invoice_id OR i.payment_transaction_id = t.id
     LEFT JOIN public.receipts r ON r.transaction_id = t.id
     LEFT JOIN public.schools s ON s.id = t.school_id;
ALTER VIEW "public"."finance_ledger" OWNER TO "postgres";

CREATE VIEW "public"."student_performance_summary" WITH (security_invoker=on) AS
SELECT p.id AS student_id,
    p.full_name,
    p.school_id,
    count(DISTINCT e.program_id) AS enrolled_programs,
    COALESCE(avg(cs.score), 0::numeric) AS avg_exam_score,
    COALESCE(avg(asub.grade), 0::numeric) AS avg_assignment_grade,
    count(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'completed'::text) AS lessons_completed
   FROM public.portal_users p
     LEFT JOIN public.enrollments e ON p.id = e.user_id
     LEFT JOIN public.cbt_sessions cs ON p.id = cs.user_id AND (cs.status = ANY (ARRAY['passed'::text, 'failed'::text, 'completed'::text]))
     LEFT JOIN public.assignment_submissions asub ON p.id = asub.portal_user_id AND asub.status = 'graded'::text
     LEFT JOIN public.lesson_progress lp ON p.id = lp.portal_user_id
  WHERE p.role = 'student'::text
  GROUP BY p.id, p.full_name, p.school_id;
ALTER VIEW "public"."student_performance_summary" OWNER TO "postgres";

-- materialized view indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_dashboard_stats_unique ON public.admin_dashboard_stats USING btree ((1));


-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."announcement_reads"
    ADD CONSTRAINT "announcement_reads_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id);
ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY (graded_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_class_term_roster_id_fkey" FOREIGN KEY (class_term_roster_id) REFERENCES public.class_term_rosters(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "fk_audit_actor" FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."billing_contacts"
    ADD CONSTRAINT "billing_contacts_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_contacts"
    ADD CONSTRAINT "billing_contacts_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."billing_contacts"
    ADD CONSTRAINT "billing_contacts_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_academic_term_id_fkey" FOREIGN KEY (academic_term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_owner_school_id_fkey" FOREIGN KEY (owner_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_cycles"
    ADD CONSTRAINT "billing_cycles_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_document_archive"
    ADD CONSTRAINT "billing_document_archive_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_document_archive"
    ADD CONSTRAINT "billing_document_archive_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_notices"
    ADD CONSTRAINT "billing_notices_owner_school_id_fkey" FOREIGN KEY (owner_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_notices"
    ADD CONSTRAINT "billing_notices_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."billing_reminder_logs"
    ADD CONSTRAINT "billing_reminder_logs_billing_cycle_id_fkey" FOREIGN KEY (billing_cycle_id) REFERENCES public.billing_cycles(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."card_audit_logs"
    ADD CONSTRAINT "card_audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."card_audit_logs"
    ADD CONSTRAINT "card_audit_logs_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.identity_cards(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."card_audit_logs"
    ADD CONSTRAINT "card_audit_logs_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.identity_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_scanned_by_fkey" FOREIGN KEY (scanned_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."card_scan_logs"
    ADD CONSTRAINT "card_scan_logs_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."cbt_questions"
    ADD CONSTRAINT "cbt_questions_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.cbt_exams(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.cbt_exams(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_academic_term_id_fkey" FOREIGN KEY (academic_term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_class_session_id_fkey" FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_delivered_by_fkey" FOREIGN KEY (delivered_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_lesson_delivery"
    ADD CONSTRAINT "class_lesson_delivery_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_billing_cycle_id_fkey" FOREIGN KEY (billing_cycle_id) REFERENCES public.billing_cycles(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_term_rosters"
    ADD CONSTRAINT "class_term_rosters_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_current_course_id_fkey" FOREIGN KEY (current_course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."communication_abuse_events"
    ADD CONSTRAINT "communication_abuse_events_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_case_events"
    ADD CONSTRAINT "communication_case_events_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.communication_cases(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_cases"
    ADD CONSTRAINT "communication_cases_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_conversation_meta"
    ADD CONSTRAINT "communication_conversation_meta_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."communication_conversation_meta"
    ADD CONSTRAINT "communication_conversation_meta_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_customer_identities"
    ADD CONSTRAINT "communication_customer_identities_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_delivery_log"
    ADD CONSTRAINT "communication_delivery_log_case_event_id_fkey" FOREIGN KEY (case_event_id) REFERENCES public.communication_case_events(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_delivery_log"
    ADD CONSTRAINT "communication_delivery_log_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.communication_cases(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_escalations"
    ADD CONSTRAINT "communication_escalations_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_escalations"
    ADD CONSTRAINT "communication_escalations_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_rate_limits"
    ADD CONSTRAINT "communication_rate_limits_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."communication_reports"
    ADD CONSTRAINT "communication_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."communication_reports"
    ADD CONSTRAINT "communication_reports_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_template_versions"
    ADD CONSTRAINT "communication_template_versions_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.communication_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."communication_templates"
    ADD CONSTRAINT "communication_templates_current_version_id_fkey" FOREIGN KEY (current_version_id) REFERENCES public.communication_template_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."consent_forms"
    ADD CONSTRAINT "consent_forms_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."consent_forms"
    ADD CONSTRAINT "consent_forms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."consent_forms"
    ADD CONSTRAINT "consent_forms_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."consent_responses"
    ADD CONSTRAINT "consent_responses_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.consent_forms(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."consent_responses"
    ADD CONSTRAINT "consent_responses_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."consent_submission_throttle"
    ADD CONSTRAINT "consent_submission_throttle_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.consent_forms(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_file_id_fkey" FOREIGN KEY (file_id) REFERENCES public.files(id);
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_content_id_fkey" FOREIGN KEY (content_id) REFERENCES public.content_library(id);
ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."course_curricula"
    ADD CONSTRAINT "course_curricula_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."course_curricula"
    ADD CONSTRAINT "course_curricula_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."course_curricula"
    ADD CONSTRAINT "course_curricula_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_next_course_id_fkey" FOREIGN KEY (next_course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_attachments"
    ADD CONSTRAINT "crm_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_interactions"
    ADD CONSTRAINT "crm_interactions_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_opportunities"
    ADD CONSTRAINT "crm_opportunities_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_pipeline"
    ADD CONSTRAINT "crm_pipeline_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_project_registry"
    ADD CONSTRAINT "curriculum_project_registry_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.curriculum_project_registry(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_project_usage"
    ADD CONSTRAINT "curriculum_project_usage_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_week_performance"
    ADD CONSTRAINT "curriculum_week_performance_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."curriculum_week_tracking"
    ADD CONSTRAINT "curriculum_week_tracking_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."customer_contact_book"
    ADD CONSTRAINT "customer_contact_book_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.communication_cases(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_feedback_id_fkey" FOREIGN KEY (feedback_id) REFERENCES public.feedback(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customer_value_outcomes"
    ADD CONSTRAINT "customer_value_outcomes_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_file_id_fkey" FOREIGN KEY (file_id) REFERENCES public.files(id);
ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_reply_id_fkey" FOREIGN KEY (reply_id) REFERENCES public.discussion_replies(id);
ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.discussion_topics(id);
ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_parent_reply_id_fkey" FOREIGN KEY (parent_reply_id) REFERENCES public.discussion_replies(id);
ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.discussion_topics(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.student_progress_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."email_thread_links"
    ADD CONSTRAINT "email_thread_links_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.communication_cases(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."engage_posts"
    ADD CONSTRAINT "engage_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."enrollment_term_grades"
    ADD CONSTRAINT "enrollment_term_grades_enrollment_id_fkey" FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."enrollment_term_grades"
    ADD CONSTRAINT "enrollment_term_grades_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.exams(id);
ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_responded_by_fkey" FOREIGN KEY (responded_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_moderator_id_fkey" FOREIGN KEY (moderator_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."flashcard_card_statistics"
    ADD CONSTRAINT "flashcard_card_statistics_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.flashcard_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_cards"
    ADD CONSTRAINT "flashcard_cards_deck_id_fkey" FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id);
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."flashcard_decks"
    ADD CONSTRAINT "flashcard_decks_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.flashcard_cards(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_reviews"
    ADD CONSTRAINT "flashcard_reviews_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_deck_id_fkey" FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."flashcard_study_sessions"
    ADD CONSTRAINT "flashcard_study_sessions_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES public.form_leads(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_linked_by_fkey" FOREIGN KEY (linked_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_lead_child_links"
    ADD CONSTRAINT "form_lead_child_links_student_portal_user_id_fkey" FOREIGN KEY (student_portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.customer_contact_book(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.consent_forms(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_match_candidate_id_fkey" FOREIGN KEY (match_candidate_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_matched_parent_id_fkey" FOREIGN KEY (matched_parent_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_matched_school_id_fkey" FOREIGN KEY (matched_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_matched_student_id_fkey" FOREIGN KEY (matched_student_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_prospect_id_fkey" FOREIGN KEY (prospect_id) REFERENCES public.prospective_students(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."form_leads"
    ADD CONSTRAINT "form_leads_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.report_templates(id);
ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_holder_id_fkey" FOREIGN KEY (holder_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."identity_cards"
    ADD CONSTRAINT "identity_cards_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."instalment_items"
    ADD CONSTRAINT "instalment_items_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.instalment_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."instalment_plans"
    ADD CONSTRAINT "instalment_plans_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."instalment_plans"
    ADD CONSTRAINT "instalment_plans_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."invoice_payment_proofs"
    ADD CONSTRAINT "invoice_payment_proofs_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."invoice_payment_proofs"
    ADD CONSTRAINT "invoice_payment_proofs_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."invoice_payment_proofs"
    ADD CONSTRAINT "invoice_payment_proofs_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_billing_cycle_id_fkey" FOREIGN KEY (billing_cycle_id) REFERENCES public.billing_cycles(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_payment_transaction_id_fkey" FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_projects"
    ADD CONSTRAINT "lab_projects_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_projects"
    ADD CONSTRAINT "lab_projects_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_projects"
    ADD CONSTRAINT "lab_projects_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "fk_lesson_plans_curriculum" FOREIGN KEY (curriculum_version_id) REFERENCES public.course_curricula(id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_academic_term_id_fkey" FOREIGN KEY (academic_term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_room_id_fkey" FOREIGN KEY (room_id) REFERENCES public.live_session_breakout_rooms(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_poll_options"
    ADD CONSTRAINT "live_session_poll_options_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES public.live_session_polls(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_option_id_fkey" FOREIGN KEY (option_id) REFERENCES public.live_session_poll_options(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES public.live_session_polls(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_questions"
    ADD CONSTRAINT "live_session_questions_session_fkey" FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_session_questions"
    ADD CONSTRAINT "live_session_questions_user_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_host_id_fkey" FOREIGN KEY (host_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_events"
    ADD CONSTRAINT "marketing_events_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."marketing_events"
    ADD CONSTRAINT "marketing_events_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."marketing_suppressions"
    ADD CONSTRAINT "marketing_suppressions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."newsletter_delivery"
    ADD CONSTRAINT "newsletter_delivery_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."newsletter_delivery"
    ADD CONSTRAINT "newsletter_delivery_newsletter_id_fkey" FOREIGN KEY (newsletter_id) REFERENCES public.newsletters(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."newsletter_delivery"
    ADD CONSTRAINT "newsletter_delivery_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."notification_dead_letters"
    ADD CONSTRAINT "notification_dead_letters_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."notification_dead_letters"
    ADD CONSTRAINT "notification_dead_letters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."operations_duty_rota"
    ADD CONSTRAINT "operations_duty_rota_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."operations_staff_settings"
    ADD CONSTRAINT "operations_staff_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."operations_staff_settings"
    ADD CONSTRAINT "operations_staff_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_claim_otps"
    ADD CONSTRAINT "parent_claim_otps_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_feedback"
    ADD CONSTRAINT "parent_feedback_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_teacher_messages"
    ADD CONSTRAINT "parent_teacher_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."parent_teacher_messages"
    ADD CONSTRAINT "parent_teacher_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.parent_teacher_threads(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_teacher_threads"
    ADD CONSTRAINT "parent_teacher_threads_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."parent_teacher_threads"
    ADD CONSTRAINT "parent_teacher_threads_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."parent_teacher_threads"
    ADD CONSTRAINT "parent_teacher_threads_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_transaction_id_fkey" FOREIGN KEY (payment_transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."platform_syllabus_week_template"
    ADD CONSTRAINT "platform_syllabus_week_template_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_duplicate_name_exception_approved_by_fkey" FOREIGN KEY (duplicate_name_exception_approved_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_primary_teacher_id_fkey" FOREIGN KEY (primary_teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."progression_override_audit"
    ADD CONSTRAINT "progression_override_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."progression_override_audit"
    ADD CONSTRAINT "progression_override_audit_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."progression_override_audit"
    ADD CONSTRAINT "progression_override_audit_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_engagement"
    ADD CONSTRAINT "project_engagement_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_engagement"
    ADD CONSTRAINT "project_engagement_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_group_members"
    ADD CONSTRAINT "project_group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.project_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_group_members"
    ADD CONSTRAINT "project_group_members_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_groups"
    ADD CONSTRAINT "project_groups_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."prospective_students"
    ADD CONSTRAINT "prospective_students_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES public.payment_transactions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."registration_batches"
    ADD CONSTRAINT "registration_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."registration_results"
    ADD CONSTRAINT "registration_results_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.registration_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."result_access_codes"
    ADD CONSTRAINT "result_access_codes_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.communication_cases(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."safeguarding_incidents"
    ADD CONSTRAINT "safeguarding_incidents_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_academic_term_id_fkey" FOREIGN KEY (academic_term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_acknowledged_by_fkey" FOREIGN KEY (acknowledged_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_published_by_fkey" FOREIGN KEY (published_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_performance_reports"
    ADD CONSTRAINT "school_performance_reports_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_report_comments"
    ADD CONSTRAINT "school_report_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_report_comments"
    ADD CONSTRAINT "school_report_comments_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.school_performance_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_report_comments"
    ADD CONSTRAINT "school_report_comments_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES public.school_report_revisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_report_events"
    ADD CONSTRAINT "school_report_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_report_events"
    ADD CONSTRAINT "school_report_events_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.school_performance_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_report_events"
    ADD CONSTRAINT "school_report_events_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES public.school_report_revisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_report_readiness_log"
    ADD CONSTRAINT "school_report_readiness_log_academic_term_id_fkey" FOREIGN KEY (academic_term_id) REFERENCES public.academic_terms(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_report_readiness_log"
    ADD CONSTRAINT "school_report_readiness_log_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.school_performance_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_report_readiness_log"
    ADD CONSTRAINT "school_report_readiness_log_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_published_by_fkey" FOREIGN KEY (published_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_report_revisions"
    ADD CONSTRAINT "school_report_revisions_report_id_fkey" FOREIGN KEY (report_id) REFERENCES public.school_performance_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_settlements"
    ADD CONSTRAINT "school_settlements_billing_cycle_id_fkey" FOREIGN KEY (billing_cycle_id) REFERENCES public.billing_cycles(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_settlements"
    ADD CONSTRAINT "school_settlements_paid_by_fkey" FOREIGN KEY (paid_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."school_settlements"
    ADD CONSTRAINT "school_settlements_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_teacher_conversations"
    ADD CONSTRAINT "school_teacher_conversations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."school_teacher_conversations"
    ADD CONSTRAINT "school_teacher_conversations_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_teacher_conversations"
    ADD CONSTRAINT "school_teacher_conversations_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_teacher_messages"
    ADD CONSTRAINT "school_teacher_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.school_teacher_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_teacher_messages"
    ADD CONSTRAINT "school_teacher_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."school_whatsapp_settings"
    ADD CONSTRAINT "school_whatsapp_settings_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."session_recordings"
    ADD CONSTRAINT "session_recordings_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."session_recordings"
    ADD CONSTRAINT "session_recordings_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."session_recordings"
    ADD CONSTRAINT "session_recordings_started_by_fkey" FOREIGN KEY (started_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."showcase_items"
    ADD CONSTRAINT "showcase_items_pinned_by_fkey" FOREIGN KEY (pinned_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."showcase_items"
    ADD CONSTRAINT "showcase_items_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."showcase_items"
    ADD CONSTRAINT "showcase_items_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."special_program_pages"
    ADD CONSTRAINT "special_program_pages_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_assignment_engagement"
    ADD CONSTRAINT "student_assignment_engagement_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_assignment_engagement"
    ADD CONSTRAINT "student_assignment_engagement_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_badges"
    ADD CONSTRAINT "student_badges_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_badges"
    ADD CONSTRAINT "student_badges_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_program_id_fkey" FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_promoted_to_fkey" FOREIGN KEY (promoted_to) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_level_enrollments"
    ADD CONSTRAINT "student_level_enrollments_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."student_streaks"
    ADD CONSTRAINT "student_streaks_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_teacher_messages"
    ADD CONSTRAINT "student_teacher_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."student_teacher_messages"
    ADD CONSTRAINT "student_teacher_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.student_teacher_threads(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_teacher_threads"
    ADD CONSTRAINT "student_teacher_threads_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_teacher_threads"
    ADD CONSTRAINT "student_teacher_threads_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_from_class_id_fkey" FOREIGN KEY (from_class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_from_teacher_id_fkey" FOREIGN KEY (from_teacher_id) REFERENCES public.portal_users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES public.portal_users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_transfer_requests"
    ADD CONSTRAINT "student_transfer_requests_to_class_id_fkey" FOREIGN KEY (to_class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."student_xp_ledger"
    ADD CONSTRAINT "student_xp_ledger_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."student_xp_ledger"
    ADD CONSTRAINT "student_xp_ledger_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_xp_summary"
    ADD CONSTRAINT "student_xp_summary_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.study_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."study_group_messages"
    ADD CONSTRAINT "study_group_messages_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.study_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."study_group_messages"
    ADD CONSTRAINT "study_group_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id);
ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."term_schedules"
    ADD CONSTRAINT "term_schedules_lesson_plan_id_fkey" FOREIGN KEY (lesson_plan_id) REFERENCES public.lesson_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."term_schedules"
    ADD CONSTRAINT "term_schedules_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_timetable_id_fkey" FOREIGN KEY (timetable_id) REFERENCES public.timetables(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_term_id_fkey" FOREIGN KEY (term_id) REFERENCES public.academic_terms(id);
ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.discussion_topics(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES public.badges(id);
ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."vault_items"
    ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."web_push_subscriptions"
    ADD CONSTRAINT "web_push_subscriptions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_assigned_staff_id_fkey" FOREIGN KEY (assigned_staff_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."whatsapp_group_broadcasts"
    ADD CONSTRAINT "whatsapp_group_broadcasts_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."whatsapp_group_broadcasts"
    ADD CONSTRAINT "whatsapp_group_broadcasts_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_group_broadcasts"
    ADD CONSTRAINT "whatsapp_group_broadcasts_sent_by_fkey" FOREIGN KEY (sent_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_owner_teacher_id_fkey" FOREIGN KEY (owner_teacher_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES public.portal_users(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_school_id_fkey" FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_check_cert_assignment_submissions AFTER INSERT OR UPDATE ON public.assignment_submissions FOR EACH ROW WHEN (new.status = ANY (ARRAY['submitted'::text, 'graded'::text])) EXECUTE FUNCTION public.handle_certificate_trigger();
CREATE TRIGGER trg_prevent_student_submission_grade_tamper BEFORE UPDATE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.prevent_student_submission_grade_tamper();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sync_assignment_term_id BEFORE INSERT OR UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.sync_assignment_term_id();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_attendance_roster_context BEFORE INSERT OR UPDATE OF session_id, user_id, student_id, term_id, class_term_roster_id ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.set_attendance_roster_context();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cbt_exams_updated_at BEFORE UPDATE ON public.cbt_exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cbt_questions_updated_at BEFORE UPDATE ON public.cbt_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_check_cert_cbt_sessions AFTER INSERT OR UPDATE ON public.cbt_sessions FOR EACH ROW WHEN (new.status = ANY (ARRAY['completed'::text, 'passed'::text])) EXECUTE FUNCTION public.handle_certificate_trigger();
CREATE TRIGGER update_cbt_sessions_updated_at BEFORE UPDATE ON public.cbt_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_class_session_term_id BEFORE INSERT OR UPDATE OF class_id, session_date, term_id ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION public.set_class_session_term_id();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_class_term_rosters_updated_at BEFORE UPDATE ON public.class_term_rosters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_guard_class_primary_owner BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.classes FOR EACH ROW EXECUTE FUNCTION public.guard_class_primary_owner();
CREATE TRIGGER trg_sync_class_term_id BEFORE INSERT OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.sync_class_term_id();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_content_library_updated_at BEFORE UPDATE ON public.content_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_discussion_replies_updated_at BEFORE UPDATE ON public.discussion_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_discussion_topics_updated_at BEFORE UPDATE ON public.discussion_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sync_enrollment_live_grade AFTER INSERT OR UPDATE OF grade, notes, term_id ON public.enrollment_term_grades FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_live_grade();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER feedback_updated_at BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.update_feedback_updated_at();
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_flashcard_cards_updated_at BEFORE UPDATE ON public.flashcard_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_flashcard_decks_updated_at BEFORE UPDATE ON public.flashcard_decks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_flashcard_reviews_updated_at BEFORE UPDATE ON public.flashcard_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_update_flashcard_statistics AFTER INSERT OR UPDATE ON public.flashcard_reviews FOR EACH ROW EXECUTE FUNCTION public.update_flashcard_statistics();
CREATE TRIGGER trg_sync_form_lead_primary_child_cache AFTER INSERT OR DELETE OR UPDATE ON public.form_lead_child_links FOR EACH ROW EXECUTE FUNCTION public.sync_form_lead_primary_child_cache();
CREATE TRIGGER trg_validate_form_lead_child_link_roles BEFORE INSERT OR UPDATE ON public.form_lead_child_links FOR EACH ROW EXECUTE FUNCTION public.validate_form_lead_child_link_roles();
CREATE TRIGGER trg_enforce_canonical_consent_response_data BEFORE INSERT OR UPDATE OF response_data ON public.form_leads FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_consent_response_data();
CREATE TRIGGER instalment_item_insert_trigger AFTER INSERT ON public.instalment_items FOR EACH ROW WHEN (new.status = 'paid'::text) EXECUTE FUNCTION public.check_instalment_plan_completion();
CREATE TRIGGER instalment_item_paid_trigger AFTER UPDATE ON public.instalment_items FOR EACH ROW WHEN (new.status = 'paid'::text AND old.status <> 'paid'::text) EXECUTE FUNCTION public.check_instalment_plan_completion();
CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW WHEN (new.invoice_number IS NULL) EXECUTE FUNCTION public.generate_invoice_number();
CREATE TRIGGER trg_notify_parent_invoice_paid AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.notify_parent_on_invoice_paid();
CREATE TRIGGER trg_sync_invoice_amount BEFORE INSERT OR UPDATE OF original_amount, amount, amount_paid, amount_remaining ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_amount_from_original();
CREATE TRIGGER trg_sync_lesson_plan_term_id BEFORE INSERT OR UPDATE ON public.lesson_plans FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_plan_term_id();
CREATE TRIGGER tr_check_cert_lesson_progress AFTER INSERT OR UPDATE ON public.lesson_progress FOR EACH ROW WHEN (new.status = 'completed'::text) EXECUTE FUNCTION public.handle_certificate_trigger();
CREATE TRIGGER update_lesson_progress_updated_at BEFORE UPDATE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_live_session_breakout_rooms_updated_at BEFORE UPDATE ON public.live_session_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_live_session_polls_updated_at BEFORE UPDATE ON public.live_session_polls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_live_sessions_updated_at BEFORE UPDATE ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.update_live_sessions_updated_at();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER parent_feedback_updated_at BEFORE UPDATE ON public.parent_feedback FOR EACH ROW EXECUTE FUNCTION public.update_parent_feedback_updated_at();
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER guard_student_class_division BEFORE UPDATE OF class_id ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.guard_student_class_division();
CREATE TRIGGER portal_users_fill_grade BEFORE INSERT OR UPDATE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.trg_portal_users_fill_grade();
CREATE TRIGGER trg_block_duplicate_active_student_name BEFORE INSERT OR UPDATE OF full_name, school_id, role, is_deleted, duplicate_name_exception_reason, duplicate_name_exception_key, duplicate_name_exception_approved_by, duplicate_name_exception_approved_at ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_active_student_name();
CREATE TRIGGER trg_cascade_portal_user_to_student AFTER UPDATE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.cascade_portal_user_to_student();
CREATE TRIGGER trg_ensure_student_shadow_row AFTER INSERT ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.ensure_student_shadow_row();
CREATE TRIGGER trg_fix_portal_user_enrollment_type BEFORE INSERT OR UPDATE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.fix_portal_user_enrollment_type();
CREATE TRIGGER trg_purge_registration_archive BEFORE DELETE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.purge_registration_archive_on_user_delete();
CREATE TRIGGER trg_require_portal_structure BEFORE INSERT OR UPDATE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.require_portal_structure();
CREATE TRIGGER trg_sync_parent_email AFTER UPDATE OF email ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.sync_parent_email_on_update();
CREATE TRIGGER trg_sync_portal_student_placement BEFORE INSERT OR UPDATE OF school_id, school_name, class_id, section_class, grade ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.sync_portal_student_placement();
CREATE TRIGGER trg_sync_school_name_pu BEFORE INSERT OR UPDATE OF school_id ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.sync_school_name_from_fk();
CREATE TRIGGER update_portal_users_updated_at BEFORE UPDATE ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_guard_summer_prospect_active BEFORE INSERT OR UPDATE ON public.prospective_students FOR EACH ROW EXECUTE FUNCTION public.guard_summer_prospect_active();
CREATE TRIGGER trg_generate_receipt_number BEFORE INSERT ON public.receipts FOR EACH ROW WHEN (new.receipt_number IS NULL) EXECUTE FUNCTION public.generate_receipt_number();
CREATE TRIGGER set_report_settings_updated_at BEFORE UPDATE ON public.report_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_report_templates_updated_at BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_update_conversation_timestamp AFTER INSERT ON public.school_teacher_messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();
CREATE TRIGGER tr_new_school_wa_settings AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION public.handle_new_school_wa_settings();
CREATE TRIGGER trg_cascade_school_rename AFTER UPDATE OF name ON public.schools FOR EACH ROW EXECUTE FUNCTION public.cascade_school_rename();
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_touch_session_recordings BEFORE UPDATE ON public.session_recordings FOR EACH ROW EXECUTE FUNCTION public.touch_session_recordings_updated_at();
CREATE TRIGGER update_student_enrollments_updated_at BEFORE UPDATE ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER sle_updated_at BEFORE UPDATE ON public.student_level_enrollments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER update_progress_updated_at BEFORE UPDATE ON public.student_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_student_progress_reports_updated_at BEFORE UPDATE ON public.student_progress_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_report_publish_notify AFTER UPDATE ON public.student_progress_reports FOR EACH ROW EXECUTE FUNCTION public.notify_parent_on_report_publish();
CREATE TRIGGER trg_sync_progress_report_term_id BEFORE INSERT OR UPDATE OF report_period, report_term ON public.student_progress_reports FOR EACH ROW EXECUTE FUNCTION public.sync_progress_report_term_id();
CREATE TRIGGER trg_sync_report_term_id BEFORE INSERT OR UPDATE ON public.student_progress_reports FOR EACH ROW EXECUTE FUNCTION public.sync_report_term_id();
CREATE TRIGGER trg_update_xp_summary AFTER INSERT ON public.student_xp_ledger FOR EACH ROW EXECUTE FUNCTION public.update_xp_summary();
CREATE TRIGGER trg_fix_student_enrollment_type BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.fix_student_enrollment_type();
CREATE TRIGGER trg_sync_school_name_stu BEFORE INSERT OR UPDATE OF school_id ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_school_name_from_fk();
CREATE TRIGGER trg_sync_student_registry_placement BEFORE INSERT OR UPDATE OF school_id, school_name, section, current_class, grade_level ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_student_registry_placement();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_support_tickets_updated_at();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER class_ownership_on_teacher_school_del AFTER DELETE ON public.teacher_schools FOR EACH ROW EXECUTE FUNCTION public.sync_class_ownership_from_teacher_schools();
CREATE TRIGGER class_ownership_on_teacher_school_ins AFTER INSERT ON public.teacher_schools FOR EACH ROW EXECUTE FUNCTION public.sync_class_ownership_from_teacher_schools();
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sync_timetable_term_id BEFORE INSERT OR UPDATE ON public.timetables FOR EACH ROW EXECUTE FUNCTION public.sync_timetable_term_id();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sync_wa_conv_school BEFORE INSERT OR UPDATE OF portal_user_id ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.sync_whatsapp_conversation_school();
CREATE TRIGGER trg_guard_whatsapp_group_class_owner BEFORE INSERT OR UPDATE OF class_id, group_type ON public.whatsapp_groups FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_group_class_owner();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE "public"."academic_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_deletion_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."announcement_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignment_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."balance_reminder_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_document_archive" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_reminder_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."card_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."card_scan_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cbt_exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cbt_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cbt_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."class_lesson_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."class_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."class_term_rosters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_abuse_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_case_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_conversation_meta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_customer_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_delivery_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_escalations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."communication_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."consent_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."consent_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."consent_submission_throttle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."content_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."content_ratings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."course_curricula" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."course_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."crm_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cron_job_health" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cron_run_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."curriculum_project_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."curriculum_project_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."curriculum_week_performance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."curriculum_week_tracking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_contact_book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_value_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."device_push_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."discussion_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."discussion_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."discussion_topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."email_thread_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."engage_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."enrollment_term_grades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."exam_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."exam_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."finance_automation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flagged_content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flashcard_card_statistics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flashcard_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flashcard_decks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flashcard_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."flashcard_study_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_lead_child_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."form_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grade_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."identity_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."instalment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."instalment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoice_automation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoice_payment_proofs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leaderboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lesson_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lesson_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_breakout_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_breakout_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_poll_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_poll_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_polls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_session_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketing_suppressions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."newsletter_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."newsletters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_dead_letters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."operations_duty_rota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."operations_staff_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_claim_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_claim_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_student_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_teacher_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."parent_teacher_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_syllabus_week_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."portal_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."portfolio_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."progression_override_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_engagement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prospective_students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."registration_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."registration_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."result_access_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."safeguarding_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_performance_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_report_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_report_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_report_readiness_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_report_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_teacher_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_teacher_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."school_whatsapp_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."session_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."showcase_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."special_program_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_assignment_engagement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_level_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_progress_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_streaks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_teacher_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_teacher_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_transfer_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_xp_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_xp_summary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."study_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."study_group_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."study_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."teacher_schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."term_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timetable_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timetables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."topic_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vault_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."web_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_group_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whatsapp_outbox" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

CREATE POLICY "academic_terms_select_all" ON "public"."academic_terms" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Admins can view all logs" ON "public"."activity_logs" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Users can view their own logs" ON "public"."activity_logs" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "announcement_reads_insert_own" ON "public"."announcement_reads" FOR INSERT TO authenticated
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "announcement_reads_select_own" ON "public"."announcement_reads" FOR SELECT TO authenticated
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "announcement_reads_update_own" ON "public"."announcement_reads" FOR UPDATE TO authenticated
    USING ((portal_user_id = auth.uid()))
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Admins can manage announcements" ON "public"."announcements" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Staff can manage announcements" ON "public"."announcements" FOR ALL TO PUBLIC
    USING (public.is_staff());
CREATE POLICY "Users can view relevant announcements" ON "public"."announcements" FOR SELECT TO authenticated
    USING (((is_active = true) AND ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = announcements.author_id) AND (portal_users.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND ((EXISTS ( SELECT 1
           FROM public.portal_users author
          WHERE ((author.id = announcements.author_id) AND (author.school_id = u.school_id)))) OR (announcements.school_id = u.school_id))))))));
CREATE POLICY "Authenticated read app_settings" ON "public"."app_settings" FOR SELECT TO PUBLIC
    USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Staff write app_settings" ON "public"."app_settings" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "submissions_insert_own" ON "public"."assignment_submissions" FOR INSERT TO authenticated
    WITH CHECK ((((portal_user_id = auth.uid()) OR (user_id = auth.uid())) AND (grade IS NULL) AND (weighted_score IS NULL) AND (graded_by IS NULL) AND (graded_at IS NULL) AND ((status IS NULL) OR (status = ANY (ARRAY['submitted'::text, 'late'::text, 'missing'::text])))));
CREATE POLICY "submissions_select_own" ON "public"."assignment_submissions" FOR SELECT TO authenticated
    USING (((portal_user_id = auth.uid()) OR (user_id = auth.uid())));
CREATE POLICY "submissions_select_parent" ON "public"."assignment_submissions" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (portal_user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids))));
CREATE POLICY "submissions_select_staff" ON "public"."assignment_submissions" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = assignment_submissions.assignment_id) AND public.staff_can_access_assignment(a.*)))));
CREATE POLICY "submissions_update_own" ON "public"."assignment_submissions" FOR UPDATE TO authenticated
    USING (((portal_user_id = auth.uid()) OR (user_id = auth.uid())))
    WITH CHECK (((portal_user_id = auth.uid()) OR (user_id = auth.uid())));
CREATE POLICY "submissions_write_staff" ON "public"."assignment_submissions" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = assignment_submissions.assignment_id) AND public.staff_can_access_assignment(a.*)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = assignment_submissions.assignment_id) AND public.staff_can_access_assignment(a.*)))));
CREATE POLICY "Admins can manage assignments" ON "public"."assignments" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "assignments_delete_own_teacher" ON "public"."assignments" FOR DELETE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.created_by = pu.id)))));
CREATE POLICY "assignments_insert_teacher" ON "public"."assignments" FOR INSERT TO authenticated
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.created_by = pu.id) AND ((pu.school_id IS NULL) OR (pu.school_id = pu.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = pu.id) AND (ts.school_id = assignments.school_id)))))))));
CREATE POLICY "assignments_select_staff_scoped" ON "public"."assignments" FOR SELECT TO authenticated
    USING (public.staff_can_access_assignment(assignments.*));
CREATE POLICY "assignments_select_student_scoped" ON "public"."assignments" FOR SELECT TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM (public.enrollments e
     JOIN public.portal_users pu ON ((pu.id = e.user_id)))
  WHERE ((e.user_id = auth.uid()) AND (e.status = 'active'::text) AND ((e.program_id = assignments.program_id) OR (EXISTS ( SELECT 1
           FROM public.courses c
          WHERE ((c.id = assignments.course_id) AND (c.program_id = e.program_id) AND ((c.school_id IS NULL) OR (pu.school_id = c.school_id)))))) AND ((assignments.school_id IS NULL) OR (pu.school_id = assignments.school_id)) AND ((assignments.class_id IS NULL) OR (pu.class_id = assignments.class_id))))) OR ((program_id IS NULL) AND (course_id IS NULL) AND ((metadata ->> 'visibility'::text) = 'all'::text))));
CREATE POLICY "assignments_update_own_teacher" ON "public"."assignments" FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.created_by = pu.id)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.created_by = pu.id)))));
CREATE POLICY "assignments_write_admin" ON "public"."assignments" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "parent_read_assignments" ON "public"."assignments" FOR SELECT TO authenticated
    USING (public.is_parent());
CREATE POLICY "Admins can manage attendance" ON "public"."attendance" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Students can view own attendance" ON "public"."attendance" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Teachers can manage attendance" ON "public"."attendance" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "manage_attendance_staff_and_admin" ON "public"."attendance" FOR ALL TO PUBLIC
    USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.class_sessions s
     JOIN public.classes c ON ((c.id = s.class_id)))
  WHERE ((s.id = attendance.session_id) AND ((c.teacher_id = auth.uid()) OR (c.school_id = public.get_my_school_id())))))));
CREATE POLICY "parent_read_child_attendance" ON "public"."attendance" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (student_id IN ( SELECT public.get_parent_student_ids() AS get_parent_student_ids))));
CREATE POLICY "select_attendance_all" ON "public"."attendance" FOR SELECT TO PUBLIC
    USING ((public.is_staff() OR (user_id = auth.uid())));
CREATE POLICY "Admins can view audit logs" ON "public"."audit_logs" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "school_admin select payment audit logs" ON "public"."audit_logs" FOR SELECT TO PUBLIC
    USING (((resource_type = 'payment_transaction'::text) AND (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = ( SELECT pt.school_id
           FROM public.payment_transactions pt
          WHERE (pt.id = (audit_logs.resource_id)::uuid)
         LIMIT 1)))))));
CREATE POLICY "Everyone can view badges" ON "public"."badges" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "staff_manage_billing_contacts" ON "public"."billing_contacts" FOR ALL TO authenticated
    USING ((public.is_staff() OR public.is_admin()))
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_insert_billing_cycles" ON "public"."billing_cycles" FOR INSERT TO authenticated
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_update_billing_cycles" ON "public"."billing_cycles" FOR UPDATE TO authenticated
    USING ((public.is_staff() OR public.is_admin()))
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_view_billing_cycles" ON "public"."billing_cycles" FOR SELECT TO authenticated
    USING ((public.is_staff() OR public.is_admin()));
CREATE POLICY "billing_document_archive_admin_all" ON "public"."billing_document_archive" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "billing_document_archive_school_read" ON "public"."billing_document_archive" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'school'::text) AND (pu.school_id IS NOT NULL) AND (pu.school_id = billing_document_archive.school_id)))));
CREATE POLICY "staff_manage_billing_notices" ON "public"."billing_notices" FOR ALL TO authenticated
    USING ((public.is_staff() OR public.is_admin()))
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_view_billing_notices" ON "public"."billing_notices" FOR SELECT TO authenticated
    USING ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_insert_card_audit_logs" ON "public"."card_audit_logs" FOR INSERT TO authenticated
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_view_card_audit_logs" ON "public"."card_audit_logs" FOR SELECT TO authenticated
    USING ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_insert_card_scan_logs" ON "public"."card_scan_logs" FOR INSERT TO authenticated
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "staff_view_card_scan_logs" ON "public"."card_scan_logs" FOR SELECT TO authenticated
    USING ((public.is_staff() OR public.is_admin()));
CREATE POLICY "Admins can manage CBT" ON "public"."cbt_exams" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Authenticated users can view active CBT exams" ON "public"."cbt_exams" FOR SELECT TO PUBLIC
    USING (((auth.role() = 'authenticated'::text) AND ((is_active = true) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))))));
CREATE POLICY "Staff can manage exams" ON "public"."cbt_exams" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Teachers can manage CBT exams" ON "public"."cbt_exams" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'teacher'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'teacher'::text)))));
CREATE POLICY "parent_read_cbt_exams" ON "public"."cbt_exams" FOR SELECT TO authenticated
    USING (public.is_parent());
CREATE POLICY "Admins can manage CBT questions" ON "public"."cbt_questions" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Staff can manage questions" ON "public"."cbt_questions" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Staff can view CBT questions" ON "public"."cbt_questions" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Teachers can manage CBT questions" ON "public"."cbt_questions" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff can manage CBT sessions" ON "public"."cbt_sessions" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Staff can view all CBT sessions" ON "public"."cbt_sessions" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Students start CBT sessions" ON "public"."cbt_sessions" FOR INSERT TO authenticated
    WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Students update own CBT sessions" ON "public"."cbt_sessions" FOR UPDATE TO authenticated
    USING (((user_id = auth.uid()) OR public.is_staff()));
CREATE POLICY "Students view own CBT sessions" ON "public"."cbt_sessions" FOR SELECT TO authenticated
    USING (((user_id = auth.uid()) OR public.is_staff()));
CREATE POLICY "parent_read_child_cbt_sessions" ON "public"."cbt_sessions" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids))));
CREATE POLICY "Users can view their own certificates" ON "public"."certificates" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "parent_read_child_certificates" ON "public"."certificates" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (portal_user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids))));
CREATE POLICY "class_lesson_delivery_read" ON "public"."class_lesson_delivery" FOR SELECT TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_lesson_delivery.class_id) AND (c.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'school'::text) AND (u.school_id = ( SELECT c.school_id
           FROM public.classes c
          WHERE (c.id = u.class_id))))))));
CREATE POLICY "Staff can manage class sessions" ON "public"."class_sessions" FOR ALL TO authenticated
    USING (public.is_staff());
CREATE POLICY "manage_sessions_staff_and_admin" ON "public"."class_sessions" FOR ALL TO PUBLIC
    USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_sessions.class_id) AND ((c.teacher_id = auth.uid()) OR (c.school_id = public.get_my_school_id())))))));
CREATE POLICY "parent_read_class_sessions" ON "public"."class_sessions" FOR SELECT TO authenticated
    USING (public.is_parent());
CREATE POLICY "select_sessions_all" ON "public"."class_sessions" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "class_term_rosters_staff_select" ON "public"."class_term_rosters" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND ((u.role = 'admin'::text) OR ((u.role = 'school'::text) AND (u.school_id = class_term_rosters.school_id)) OR ((u.role = 'teacher'::text) AND ((EXISTS ( SELECT 1
           FROM public.classes c
          WHERE ((c.id = class_term_rosters.class_id) AND (c.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = class_term_rosters.school_id)))))))))));
CREATE POLICY "class_term_rosters_staff_write" ON "public"."class_term_rosters" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND ((u.role = 'admin'::text) OR ((u.role = 'teacher'::text) AND (EXISTS ( SELECT 1
           FROM public.classes c
          WHERE ((c.id = class_term_rosters.class_id) AND (c.teacher_id = auth.uid()))))))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND ((u.role = 'admin'::text) OR ((u.role = 'teacher'::text) AND (EXISTS ( SELECT 1
           FROM public.classes c
          WHERE ((c.id = class_term_rosters.class_id) AND (c.teacher_id = auth.uid()))))))))));
CREATE POLICY "class_term_rosters_student_select_own" ON "public"."class_term_rosters" FOR SELECT TO authenticated
    USING ((student_id = auth.uid()));
CREATE POLICY "Admins can manage classes" ON "public"."classes" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Public can view classes" ON "public"."classes" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Staff can manage classes" ON "public"."classes" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Teachers can manage classes" ON "public"."classes" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "parent_read_classes" ON "public"."classes" FOR SELECT TO authenticated
    USING (public.is_parent());
CREATE POLICY "active participants can view case events" ON "public"."communication_case_events" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.communication_cases communication_case
  WHERE ((communication_case.id = communication_case_events.case_id) AND ((communication_case.requester_id = auth.uid()) OR public.is_active_admin() OR ((communication_case.assigned_to = auth.uid()) AND (communication_case.restricted = false) AND (EXISTS ( SELECT 1
           FROM public.portal_users pu
          WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.is_active = true) AND (COALESCE(pu.is_deleted, false) = false))))))))));
CREATE POLICY "active participants can view cases" ON "public"."communication_cases" FOR SELECT TO authenticated
    USING (((requester_id = auth.uid()) OR public.is_active_admin() OR ((assigned_to = auth.uid()) AND (restricted = false) AND (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.is_active = true) AND (COALESCE(pu.is_deleted, false) = false)))))));
CREATE POLICY "office_admin_identities" ON "public"."communication_customer_identities" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "office_admin_delivery" ON "public"."communication_delivery_log" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "communication_template_versions_admin_manage" ON "public"."communication_template_versions" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "communication_template_versions_staff_select" ON "public"."communication_template_versions" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "communication_templates_admin_manage" ON "public"."communication_templates" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "communication_templates_staff_select" ON "public"."communication_templates" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "admins teachers insert forms in their school" ON "public"."consent_forms" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (pu.school_id = consent_forms.school_id)))));
CREATE POLICY "admins teachers select forms in their school" ON "public"."consent_forms" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (pu.school_id = consent_forms.school_id)))));
CREATE POLICY "admins teachers update forms in their school" ON "public"."consent_forms" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (pu.school_id = consent_forms.school_id)))));
CREATE POLICY "consent_forms_parent_select" ON "public"."consent_forms" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'parent'::text) AND (portal_users.school_id = consent_forms.school_id)))));
CREATE POLICY "consent_forms_staff_delete" ON "public"."consent_forms" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((portal_users.role = 'admin'::text) OR (portal_users.school_id = consent_forms.school_id))))));
CREATE POLICY "consent_forms_staff_insert" ON "public"."consent_forms" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((portal_users.role = 'admin'::text) OR (portal_users.school_id = consent_forms.school_id))))));
CREATE POLICY "consent_forms_staff_select" ON "public"."consent_forms" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((portal_users.role = 'admin'::text) OR (portal_users.school_id = consent_forms.school_id))))));
CREATE POLICY "consent_forms_staff_update" ON "public"."consent_forms" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((portal_users.role = 'admin'::text) OR (portal_users.school_id = consent_forms.school_id))))));
CREATE POLICY "parents select forms in their school" ON "public"."consent_forms" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'parent'::text) AND (pu.school_id = consent_forms.school_id)))));
CREATE POLICY "admins teachers select responses in their school" ON "public"."consent_responses" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users pu
     JOIN public.consent_forms cf ON ((cf.id = consent_responses.form_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (pu.school_id = cf.school_id)))));
CREATE POLICY "parents insert own responses" ON "public"."consent_responses" FOR INSERT TO PUBLIC
    WITH CHECK ((parent_id = auth.uid()));
CREATE POLICY "parents select own responses" ON "public"."consent_responses" FOR SELECT TO PUBLIC
    USING ((parent_id = auth.uid()));
CREATE POLICY "Staff can manage content library" ON "public"."content_library" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Users can insert content" ON "public"."content_library" FOR INSERT TO authenticated
    WITH CHECK (((auth.uid() = created_by) OR public.is_staff()));
CREATE POLICY "Users can view content" ON "public"."content_library" FOR SELECT TO authenticated
    USING ((((is_approved = true) AND ((school_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.school_id = content_library.school_id))))) AND ((program_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.user_id = auth.uid()) AND (e.status = 'active'::text) AND (e.program_id = content_library.program_id)))))) OR public.is_staff() OR (auth.uid() = created_by)));
CREATE POLICY "Users can manage own ratings" ON "public"."content_ratings" FOR ALL TO authenticated
    USING (((portal_user_id = auth.uid()) OR public.is_staff()))
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "delete_curricula" ON "public"."course_curricula" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "insert_curricula" ON "public"."course_curricula" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (course_curricula.school_id IS NULL) OR (pu.school_id = course_curricula.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = course_curricula.school_id)))))))));
CREATE POLICY "school admins insert curricula for their school" ON "public"."course_curricula" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = course_curricula.school_id)))));
CREATE POLICY "school admins select curricula for their school" ON "public"."course_curricula" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = course_curricula.school_id)))));
CREATE POLICY "school admins update curricula for their school" ON "public"."course_curricula" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = course_curricula.school_id)))));
CREATE POLICY "select_curricula" ON "public"."course_curricula" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (course_curricula.school_id IS NULL) OR (pu.school_id = course_curricula.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = course_curricula.school_id)))))))));
CREATE POLICY "teachers select curricula for their school" ON "public"."course_curricula" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.school_id = course_curricula.school_id)))));
CREATE POLICY "update_curricula" ON "public"."course_curricula" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (course_curricula.school_id IS NULL) OR (pu.school_id = course_curricula.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = course_curricula.school_id)))))))));
CREATE POLICY "Admins can manage materials" ON "public"."course_materials" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Authenticated users can view materials" ON "public"."course_materials" FOR SELECT TO PUBLIC
    USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Admins can manage courses" ON "public"."courses" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "courses_select_public" ON "public"."courses" FOR SELECT TO PUBLIC
    USING (((auth.uid() IS NULL) AND (is_active = true) AND (school_id IS NULL)));
CREATE POLICY "courses_select_staff_parent" ON "public"."courses" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text, 'parent'::text]))))));
CREATE POLICY "courses_select_student" ON "public"."courses" FOR SELECT TO authenticated
    USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM (public.enrollments e
     JOIN public.portal_users pu ON ((pu.id = e.user_id)))
  WHERE ((e.user_id = auth.uid()) AND (e.status = 'active'::text) AND (e.program_id = courses.program_id) AND ((courses.school_id IS NULL) OR (pu.school_id = courses.school_id)))))));
CREATE POLICY "parent_read_courses" ON "public"."courses" FOR SELECT TO authenticated
    USING (public.is_parent());
CREATE POLICY "Staff can manage crm_attachments" ON "public"."crm_attachments" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))));
CREATE POLICY "Staff can manage crm_interactions" ON "public"."crm_interactions" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))));
CREATE POLICY "Staff can manage crm_pipeline" ON "public"."crm_pipeline" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (portal_users.is_active = true)))));
CREATE POLICY "cron_job_health_admin_select" ON "public"."cron_job_health" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "cron_run_history_admin_select" ON "public"."cron_run_history" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "school staff manage curriculum project registry" ON "public"."curriculum_project_registry" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((curriculum_project_registry.school_id IS NULL) OR (pu.school_id = curriculum_project_registry.school_id) OR (pu.role = 'admin'::text))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((curriculum_project_registry.school_id IS NULL) OR (pu.school_id = curriculum_project_registry.school_id) OR (pu.role = 'admin'::text))))));
CREATE POLICY "school staff insert project usage" ON "public"."curriculum_project_usage" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.school_id = curriculum_project_usage.school_id) OR (pu.role = 'admin'::text))))));
CREATE POLICY "school staff read project usage" ON "public"."curriculum_project_usage" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.school_id = curriculum_project_usage.school_id) OR (pu.role = 'admin'::text))))));
CREATE POLICY "school staff manage week performance" ON "public"."curriculum_week_performance" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.school_id = curriculum_week_performance.school_id) OR (pu.role = 'admin'::text))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.school_id = curriculum_week_performance.school_id) OR (pu.role = 'admin'::text))))));
CREATE POLICY "Staff can insert tracking" ON "public"."curriculum_week_tracking" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Staff can read tracking" ON "public"."curriculum_week_tracking" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Staff can update tracking" ON "public"."curriculum_week_tracking" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "customer_owned_outcomes" ON "public"."customer_value_outcomes" FOR INSERT TO authenticated
    WITH CHECK (((portal_user_id = auth.uid()) AND ((case_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.communication_cases communication_case
  WHERE ((communication_case.id = customer_value_outcomes.case_id) AND (communication_case.requester_id = auth.uid()))))) AND ((feedback_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.feedback feedback_row
  WHERE ((feedback_row.id = customer_value_outcomes.feedback_id) AND (feedback_row.user_id = auth.uid())))))));
CREATE POLICY "office_admin_outcomes" ON "public"."customer_value_outcomes" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "service role all device tokens" ON "public"."device_push_tokens" FOR ALL TO PUBLIC
    USING ((auth.role() = 'service_role'::text));
CREATE POLICY "users delete own device tokens" ON "public"."device_push_tokens" FOR DELETE TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "users read own device tokens" ON "public"."device_push_tokens" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Everyone can view replies" ON "public"."discussion_replies" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Provide access to replies" ON "public"."discussion_replies" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.discussion_topics dt
  WHERE (dt.id = discussion_replies.topic_id))));
CREATE POLICY "Users can create replies" ON "public"."discussion_replies" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can manage own replies" ON "public"."discussion_replies" FOR ALL TO PUBLIC
    USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])))))));
CREATE POLICY "Anyone enrolled can view topics" ON "public"."discussion_topics" FOR SELECT TO PUBLIC
    USING (((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.enrollments e
     JOIN public.courses c ON ((c.program_id = e.program_id)))
  WHERE ((c.id = discussion_topics.course_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "Everyone can view discussions" ON "public"."discussion_topics" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Users can create discussions" ON "public"."discussion_topics" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can manage own topics" ON "public"."discussion_topics" FOR ALL TO PUBLIC
    USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])))))));
CREATE POLICY "office_admin_email_threads" ON "public"."email_thread_links" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "engage_posts_delete" ON "public"."engage_posts" FOR DELETE TO PUBLIC
    USING ((auth.uid() = user_id));
CREATE POLICY "engage_posts_insert" ON "public"."engage_posts" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "engage_posts_select" ON "public"."engage_posts" FOR SELECT TO PUBLIC
    USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "engage_posts_update" ON "public"."engage_posts" FOR UPDATE TO PUBLIC
    USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "enrollment_term_grades_select" ON "public"."enrollment_term_grades" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.enrollments e
  WHERE ((e.id = enrollment_term_grades.enrollment_id) AND ((e.user_id = auth.uid()) OR public.is_staff())))));
CREATE POLICY "enrollment_term_grades_write_staff" ON "public"."enrollment_term_grades" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Admins can manage enrollments" ON "public"."enrollments" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "School can view own enrollments" ON "public"."enrollments" FOR SELECT TO authenticated
    USING ((public.is_staff() OR (user_id = auth.uid())));
CREATE POLICY "Staff can manage enrollments" ON "public"."enrollments" FOR ALL TO authenticated
    USING (public.is_staff());
CREATE POLICY "Students can view own enrollments" ON "public"."enrollments" FOR SELECT TO authenticated
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their enrollments" ON "public"."enrollments" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert their own exam attempts" ON "public"."exam_attempts" FOR INSERT TO PUBLIC
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Users can view their own exam attempts" ON "public"."exam_attempts" FOR SELECT TO PUBLIC
    USING (((portal_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))))));
CREATE POLICY "Exams are viewable by enrolled students or school staff" ON "public"."exams" FOR SELECT TO PUBLIC
    USING (((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.enrollments e
     JOIN public.courses c ON ((c.program_id = e.program_id)))
  WHERE ((c.id = exams.course_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "admins_update_feedback" ON "public"."feedback" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "admins_view_all_feedback" ON "public"."feedback" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "users_insert_own_feedback" ON "public"."feedback" FOR INSERT TO PUBLIC
    WITH CHECK (((auth.uid() = user_id) OR (user_id IS NULL)));
CREATE POLICY "users_view_own_feedback" ON "public"."feedback" FOR SELECT TO PUBLIC
    USING ((auth.uid() = user_id));
CREATE POLICY "Files are viewable within the same school" ON "public"."files" FOR SELECT TO PUBLIC
    USING (((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text))))));
CREATE POLICY "Staff can manage files" ON "public"."files" FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Users can insert and delete own files" ON "public"."files" FOR ALL TO PUBLIC
    USING (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text))))));
CREATE POLICY "Users can insert files" ON "public"."files" FOR INSERT TO authenticated
    WITH CHECK (((auth.uid() = uploaded_by) OR public.is_staff()));
CREATE POLICY "Users can view files" ON "public"."files" FOR SELECT TO authenticated
    USING (((school_id IS NULL) OR (school_id = ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))) OR (uploaded_by = auth.uid()) OR public.is_staff()));
CREATE POLICY "admin_select_finance_automation_log" ON "public"."finance_automation_log" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "service_all_finance_automation_log" ON "public"."finance_automation_log" FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
CREATE POLICY "Staff can view all flags" ON "public"."flagged_content" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Users can flag content" ON "public"."flagged_content" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "teachers view card stats" ON "public"."flashcard_card_statistics" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM ((public.flashcard_cards fc
     JOIN public.flashcard_decks fd ON ((fd.id = fc.deck_id)))
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((fc.id = flashcard_card_statistics.card_id) AND (fd.school_id = pu.school_id) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text]))))));
CREATE POLICY "select flashcard cards" ON "public"."flashcard_cards" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.flashcard_decks fd
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((fd.id = flashcard_cards.deck_id) AND ((pu.role = 'admin'::text) OR ((pu.role = ANY (ARRAY['teacher'::text, 'school'::text, 'student'::text])) AND ((fd.school_id IS NULL) OR (pu.school_id = fd.school_id))))))));
CREATE POLICY "teachers delete cards for own decks" ON "public"."flashcard_cards" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.flashcard_decks fd
  WHERE ((fd.id = flashcard_cards.deck_id) AND (fd.created_by = auth.uid())))));
CREATE POLICY "teachers insert cards for own decks" ON "public"."flashcard_cards" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.flashcard_decks fd
  WHERE ((fd.id = flashcard_cards.deck_id) AND (fd.created_by = auth.uid())))));
CREATE POLICY "teachers update cards for own decks" ON "public"."flashcard_cards" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.flashcard_decks fd
  WHERE ((fd.id = flashcard_cards.deck_id) AND (fd.created_by = auth.uid())))));
CREATE POLICY "delete flashcard decks" ON "public"."flashcard_decks" FOR DELETE TO PUBLIC
    USING ((created_by = auth.uid()));
CREATE POLICY "insert flashcard decks" ON "public"."flashcard_decks" FOR INSERT TO PUBLIC
    WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (flashcard_decks.school_id IS NULL) OR (pu.school_id = flashcard_decks.school_id)))))));
CREATE POLICY "select flashcard decks" ON "public"."flashcard_decks" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND ((pu.role = 'admin'::text) OR ((pu.role = ANY (ARRAY['teacher'::text, 'school'::text, 'student'::text])) AND ((flashcard_decks.school_id IS NULL) OR (pu.school_id = flashcard_decks.school_id))))))));
CREATE POLICY "update flashcard decks" ON "public"."flashcard_decks" FOR UPDATE TO PUBLIC
    USING ((created_by = auth.uid()));
CREATE POLICY "students insert own reviews" ON "public"."flashcard_reviews" FOR INSERT TO PUBLIC
    WITH CHECK ((student_id = auth.uid()));
CREATE POLICY "students select own reviews" ON "public"."flashcard_reviews" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "students update own reviews" ON "public"."flashcard_reviews" FOR UPDATE TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "students insert own sessions" ON "public"."flashcard_study_sessions" FOR INSERT TO PUBLIC
    WITH CHECK ((student_id = auth.uid()));
CREATE POLICY "students view own sessions" ON "public"."flashcard_study_sessions" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "teachers view school sessions" ON "public"."flashcard_study_sessions" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.flashcard_decks fd
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((fd.id = flashcard_study_sessions.deck_id) AND (fd.school_id = pu.school_id) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text]))))));
CREATE POLICY "form_lead_child_links_staff_select" ON "public"."form_lead_child_links" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM ((public.portal_users staff
     JOIN public.form_leads lead ON ((lead.id = form_lead_child_links.lead_id)))
     JOIN public.consent_forms form ON ((form.id = lead.form_id)))
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((staff.role = 'admin'::text) OR (form.school_id = staff.school_id) OR (lead.school_id = staff.school_id) OR ((staff.role = 'teacher'::text) AND (EXISTS ( SELECT 1
           FROM public.teacher_schools assignment
          WHERE ((assignment.teacher_id = staff.id) AND (assignment.school_id = COALESCE(form.school_id, lead.school_id)))))))))));
CREATE POLICY "form_leads_staff_delete" ON "public"."form_leads" FOR DELETE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users p
     JOIN public.consent_forms cf ON ((cf.id = form_leads.form_id)))
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((p.role = 'admin'::text) OR (cf.school_id = p.school_id) OR (form_leads.school_id = p.school_id))))));
CREATE POLICY "form_leads_staff_select" ON "public"."form_leads" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users p
     JOIN public.consent_forms cf ON ((cf.id = form_leads.form_id)))
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((p.role = 'admin'::text) OR (cf.school_id = p.school_id) OR (form_leads.school_id = p.school_id))))));
CREATE POLICY "form_leads_staff_update" ON "public"."form_leads" FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users p
     JOIN public.consent_forms cf ON ((cf.id = form_leads.form_id)))
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((p.role = 'admin'::text) OR (cf.school_id = p.school_id) OR (form_leads.school_id = p.school_id))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.portal_users p
     JOIN public.consent_forms cf ON ((cf.id = form_leads.form_id)))
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND ((p.role = 'admin'::text) OR (cf.school_id = p.school_id) OR (form_leads.school_id = p.school_id))))));
CREATE POLICY "Admins can manage generated reports" ON "public"."generated_reports" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "grade_reports_select" ON "public"."grade_reports" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "grade_reports_write_staff" ON "public"."grade_reports" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "staff_manage_identity_cards" ON "public"."identity_cards" FOR ALL TO authenticated
    USING ((public.is_staff() OR public.is_admin()))
    WITH CHECK ((public.is_staff() OR public.is_admin()));
CREATE POLICY "plan owner access items" ON "public"."instalment_items" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.instalment_plans ip
  WHERE ((ip.id = instalment_items.plan_id) AND (ip.parent_id = auth.uid())))));
CREATE POLICY "parents manage own plans" ON "public"."instalment_plans" FOR ALL TO PUBLIC
    USING ((parent_id = auth.uid()));
CREATE POLICY "staff view plans" ON "public"."instalment_plans" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school'::text, 'teacher'::text]))))));
CREATE POLICY "invoice_payment_proofs_insert_by_payer" ON "public"."invoice_payment_proofs" FOR INSERT TO authenticated
    WITH CHECK (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_payment_proofs.invoice_id) AND ((i.portal_user_id = auth.uid()) OR (public.is_parent() AND (i.portal_user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids)))))))));
CREATE POLICY "invoice_payment_proofs_select_admin" ON "public"."invoice_payment_proofs" FOR SELECT TO authenticated
    USING (public.is_admin());
CREATE POLICY "invoice_payment_proofs_select_own" ON "public"."invoice_payment_proofs" FOR SELECT TO authenticated
    USING ((submitted_by = auth.uid()));
CREATE POLICY "invoice_payment_proofs_select_school_staff" ON "public"."invoice_payment_proofs" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM (public.invoices inv
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((inv.id = invoice_payment_proofs.invoice_id) AND (inv.school_id IS NOT NULL) AND (pu.school_id = inv.school_id) AND (pu.role = ANY (ARRAY['school'::text, 'teacher'::text]))))));
CREATE POLICY "Admins can do everything on invoices" ON "public"."invoices" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Schools can manage their own invoices" ON "public"."invoices" FOR ALL TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))));
CREATE POLICY "Students can view their own invoices" ON "public"."invoices" FOR SELECT TO authenticated
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "parent_read_child_invoices" ON "public"."invoices" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (portal_user_id IN ( SELECT public.get_parent_child_user_ids() AS get_parent_child_user_ids))));
CREATE POLICY "Access projects" ON "public"."lab_projects" FOR ALL TO authenticated
    USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))))));
CREATE POLICY "Public projects are viewable by all" ON "public"."lab_projects" FOR SELECT TO PUBLIC
    USING ((is_public = true));
CREATE POLICY "Everyone can view leaderboards" ON "public"."leaderboards" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "read_public_materials" ON "public"."lesson_materials" FOR SELECT TO PUBLIC
    USING (((is_public = true) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text])))))));
CREATE POLICY "staff_write_materials" ON "public"."lesson_materials" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "staff_read_plans" ON "public"."lesson_plans" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "staff_write_plans" ON "public"."lesson_plans" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff can manage lesson progress" ON "public"."lesson_progress" FOR ALL TO PUBLIC
    USING (public.is_staff())
    WITH CHECK (public.is_staff());
CREATE POLICY "Staff can view all lesson progress" ON "public"."lesson_progress" FOR SELECT TO PUBLIC
    USING (public.is_staff());
CREATE POLICY "Users can update their own progress" ON "public"."lesson_progress" FOR ALL TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Users can view their own progress" ON "public"."lesson_progress" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Staff can manage lessons" ON "public"."lessons" FOR ALL TO PUBLIC
    USING (public.is_staff());
CREATE POLICY "lessons_select_scoped" ON "public"."lessons" FOR SELECT TO PUBLIC
    USING (((status = 'active'::text) AND (((auth.uid() IS NULL) AND (school_id IS NULL)) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text, 'parent'::text]))))) OR (EXISTS ( SELECT 1
   FROM ((public.enrollments e
     JOIN public.courses c ON ((c.program_id = e.program_id)))
     JOIN public.portal_users pu ON ((pu.id = e.user_id)))
  WHERE ((e.user_id = auth.uid()) AND (e.status = 'active'::text) AND (c.id = lessons.course_id) AND ((c.school_id IS NULL) OR (pu.school_id = c.school_id)) AND ((lessons.school_id IS NULL) OR (pu.school_id = lessons.school_id))))))));
CREATE POLICY "lessons_write_staff" ON "public"."lessons" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff manage live session attendance" ON "public"."live_session_attendance" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users pu
     JOIN public.live_sessions ls ON ((ls.id = live_session_attendance.session_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = ls.school_id))))));
CREATE POLICY "Users insert own attendance" ON "public"."live_session_attendance" FOR INSERT TO PUBLIC
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Users update own attendance" ON "public"."live_session_attendance" FOR UPDATE TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Users view own attendance" ON "public"."live_session_attendance" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Authenticated users view breakout participants" ON "public"."live_session_breakout_participants" FOR SELECT TO PUBLIC
    USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Staff manage breakout participants" ON "public"."live_session_breakout_participants" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM ((public.portal_users pu
     JOIN public.live_session_breakout_rooms br ON ((br.id = live_session_breakout_participants.room_id)))
     JOIN public.live_sessions ls ON ((ls.id = br.session_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = ls.school_id))))));
CREATE POLICY "Users join breakout room" ON "public"."live_session_breakout_participants" FOR INSERT TO PUBLIC
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Users update own breakout participation" ON "public"."live_session_breakout_participants" FOR UPDATE TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Staff manage breakout rooms" ON "public"."live_session_breakout_rooms" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff manage poll options" ON "public"."live_session_poll_options" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff view poll responses" ON "public"."live_session_poll_responses" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM ((public.portal_users pu
     JOIN public.live_session_polls lp ON ((lp.id = live_session_poll_responses.poll_id)))
     JOIN public.live_sessions ls ON ((ls.id = lp.session_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = ls.school_id))))));
CREATE POLICY "Users respond to polls" ON "public"."live_session_poll_responses" FOR INSERT TO PUBLIC
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Users view own poll responses" ON "public"."live_session_poll_responses" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Staff manage polls" ON "public"."live_session_polls" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Authenticated users view questions" ON "public"."live_session_questions" FOR SELECT TO PUBLIC
    USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Staff manage all questions" ON "public"."live_session_questions" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Users manage own questions" ON "public"."live_session_questions" FOR UPDATE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users post questions" ON "public"."live_session_questions" FOR INSERT TO PUBLIC
    WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "live_sessions_delete" ON "public"."live_sessions" FOR DELETE TO PUBLIC
    USING (((host_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))));
CREATE POLICY "live_sessions_insert" ON "public"."live_sessions" FOR INSERT TO PUBLIC
    WITH CHECK (((host_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text])))))));
CREATE POLICY "live_sessions_select" ON "public"."live_sessions" FOR SELECT TO PUBLIC
    USING ((auth.uid() IS NOT NULL));
CREATE POLICY "live_sessions_update" ON "public"."live_sessions" FOR UPDATE TO PUBLIC
    USING (((host_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))));
CREATE POLICY "office_admin_campaigns" ON "public"."marketing_campaigns" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "office_admin_marketing_events" ON "public"."marketing_events" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "office_admin_suppressions" ON "public"."marketing_suppressions" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "Admins can manage messages" ON "public"."messages" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Admins can view all messages" ON "public"."messages" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Recipients can mark read" ON "public"."messages" FOR UPDATE TO PUBLIC
    USING ((recipient_id = auth.uid()));
CREATE POLICY "Recipients can update read status" ON "public"."messages" FOR UPDATE TO PUBLIC
    USING ((recipient_id = auth.uid()));
CREATE POLICY "Users can send messages" ON "public"."messages" FOR INSERT TO PUBLIC
    WITH CHECK ((sender_id = auth.uid()));
CREATE POLICY "Users can update own messages (read status)" ON "public"."messages" FOR UPDATE TO PUBLIC
    USING ((recipient_id = auth.uid()))
    WITH CHECK ((recipient_id = auth.uid()));
CREATE POLICY "Users can view own messages" ON "public"."messages" FOR SELECT TO PUBLIC
    USING (((sender_id = auth.uid()) OR (recipient_id = auth.uid())));
CREATE POLICY "Users can view their messages" ON "public"."messages" FOR SELECT TO PUBLIC
    USING (((sender_id = auth.uid()) OR (recipient_id = auth.uid())));
CREATE POLICY "Admins can manage delivery" ON "public"."newsletter_delivery" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Users can view/update their delivery status" ON "public"."newsletter_delivery" FOR ALL TO authenticated
    USING ((user_id = auth.uid()));
CREATE POLICY "Staff can manage newsletters" ON "public"."newsletters" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND ((portal_users.role = 'admin'::text) OR ((portal_users.role = 'school'::text) AND ((portal_users.id = newsletters.author_id) OR (portal_users.school_id = newsletters.school_id))))))));
CREATE POLICY "Users can view their newsletters" ON "public"."newsletters" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.newsletter_delivery
  WHERE ((newsletter_delivery.newsletter_id = newsletters.id) AND (newsletter_delivery.user_id = auth.uid())))));
CREATE POLICY "notification_dead_letters_admin_select" ON "public"."notification_dead_letters" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "notification_dead_letters_admin_update" ON "public"."notification_dead_letters" FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "Admins can manage templates" ON "public"."notification_templates" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Authenticated users can read active templates" ON "public"."notification_templates" FOR SELECT TO authenticated
    USING ((is_active = true));
CREATE POLICY "Admins can manage notifications" ON "public"."notifications" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can update their notifications" ON "public"."notifications" FOR UPDATE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their notifications" ON "public"."notifications" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "notifications_admin_insert" ON "public"."notifications" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "notifications_own" ON "public"."notifications" FOR ALL TO PUBLIC
    USING ((user_id = auth.uid()))
    WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "parent_read_own_notifications" ON "public"."notifications" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (user_id = auth.uid())));
CREATE POLICY "parent_update_own_notifications" ON "public"."notifications" FOR UPDATE TO authenticated
    USING ((public.is_parent() AND (user_id = auth.uid())));
CREATE POLICY "admins can manage duty rota" ON "public"."operations_duty_rota" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "operations staff can view duty rota" ON "public"."operations_duty_rota" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])) AND COALESCE(pu.is_active, true)))));
CREATE POLICY "admins can manage all operations settings" ON "public"."operations_staff_settings" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "operations staff can view staff settings" ON "public"."operations_staff_settings" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])) AND COALESCE(pu.is_active, true) AND (NOT COALESCE(pu.is_deleted, false))))));
CREATE POLICY "staff_read_parent_claim_audit" ON "public"."parent_claim_audit" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Parents can insert own feedback" ON "public"."parent_feedback" FOR INSERT TO authenticated
    WITH CHECK ((portal_user_id = auth.uid()));
CREATE POLICY "Parents can view own feedback" ON "public"."parent_feedback" FOR SELECT TO authenticated
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Staff can update feedback status" ON "public"."parent_feedback" FOR UPDATE TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Staff can view all feedback" ON "public"."parent_feedback" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "parent_read_own_links" ON "public"."parent_student_links" FOR SELECT TO authenticated
    USING ((parent_id = auth.uid()));
CREATE POLICY "staff_read_parent_links" ON "public"."parent_student_links" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "staff_write_parent_links" ON "public"."parent_student_links" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "participants insert messages" ON "public"."parent_teacher_messages" FOR INSERT TO PUBLIC
    WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.parent_teacher_threads t
  WHERE ((t.id = parent_teacher_messages.thread_id) AND ((t.parent_id = auth.uid()) OR (t.teacher_id = auth.uid())))))));
CREATE POLICY "participants select messages" ON "public"."parent_teacher_messages" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.parent_teacher_threads t
  WHERE ((t.id = parent_teacher_messages.thread_id) AND ((t.parent_id = auth.uid()) OR (t.teacher_id = auth.uid()))))));
CREATE POLICY "participants update is_read" ON "public"."parent_teacher_messages" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.parent_teacher_threads t
  WHERE ((t.id = parent_teacher_messages.thread_id) AND ((t.parent_id = auth.uid()) OR (t.teacher_id = auth.uid()))))));
CREATE POLICY "participants insert threads" ON "public"."parent_teacher_threads" FOR INSERT TO PUBLIC
    WITH CHECK (((parent_id = auth.uid()) OR (teacher_id = auth.uid())));
CREATE POLICY "participants select own threads" ON "public"."parent_teacher_threads" FOR SELECT TO PUBLIC
    USING (((parent_id = auth.uid()) OR (teacher_id = auth.uid())));
CREATE POLICY "admin_all_payment_accounts" ON "public"."payment_accounts" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "parent_read_payment_accounts" ON "public"."payment_accounts" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (is_active = true)));
CREATE POLICY "school_manage_own_payment_accounts" ON "public"."payment_accounts" FOR ALL TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))));
CREATE POLICY "users_read_active_payment_accounts" ON "public"."payment_accounts" FOR SELECT TO authenticated
    USING (((is_active = true) AND ((owner_type = 'rillcod'::text) OR (school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))))));
CREATE POLICY "service_all_payment_allocations" ON "public"."payment_allocations" FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
CREATE POLICY "staff_select_payment_allocations" ON "public"."payment_allocations" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school'::text, 'teacher'::text]))))));
CREATE POLICY "Staff can view school transactions" ON "public"."payment_transactions" FOR SELECT TO authenticated
    USING ((public.is_admin() OR (school_id = public.get_my_school_id())));
CREATE POLICY "Users can view their own transactions" ON "public"."payment_transactions" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "parent_insert_payment_transactions" ON "public"."payment_transactions" FOR INSERT TO authenticated
    WITH CHECK ((public.is_parent() AND (portal_user_id = auth.uid())));
CREATE POLICY "parent_read_own_payment_transactions" ON "public"."payment_transactions" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (portal_user_id = auth.uid())));
CREATE POLICY "payment_transactions_select_finance_staff" ON "public"."payment_transactions" FOR SELECT TO authenticated
    USING ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))));
CREATE POLICY "payment_transactions_update_finance_staff" ON "public"."payment_transactions" FOR UPDATE TO authenticated
    USING ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))))
    WITH CHECK ((public.is_admin() OR ((public.get_my_role() = 'school'::text) AND (public.get_my_school_id() IS NOT NULL) AND (school_id IS NOT NULL) AND (school_id = public.get_my_school_id()))));
CREATE POLICY "Admins can manage payments" ON "public"."payments" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Users can view their payments" ON "public"."payments" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "parent_read_child_payments" ON "public"."payments" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (student_id IN ( SELECT public.get_parent_student_ids() AS get_parent_student_ids))));
CREATE POLICY "staff read platform syllabus template" ON "public"."platform_syllabus_week_template" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "admin_delete_parent_accounts" ON "public"."portal_users" FOR DELETE TO authenticated
    USING (((role = 'parent'::text) AND public.is_admin()));
CREATE POLICY "admin_insert_parent_accounts" ON "public"."portal_users" FOR INSERT TO authenticated
    WITH CHECK (((role = 'parent'::text) AND public.is_admin()));
CREATE POLICY "admin_update_parent_accounts" ON "public"."portal_users" FOR UPDATE TO authenticated
    USING (((role = 'parent'::text) AND public.is_admin()));
CREATE POLICY "parent_read_own_profile" ON "public"."portal_users" FOR SELECT TO authenticated
    USING (((id = auth.uid()) AND (role = 'parent'::text)));
CREATE POLICY "portal_users_admin_delete" ON "public"."portal_users" FOR DELETE TO PUBLIC
    USING ((public.get_my_role() = 'admin'::text));
CREATE POLICY "portal_users_admin_insert" ON "public"."portal_users" FOR INSERT TO PUBLIC
    WITH CHECK ((public.get_my_role() = 'admin'::text));
CREATE POLICY "portal_users_admin_update" ON "public"."portal_users" FOR UPDATE TO PUBLIC
    USING ((public.get_my_role() = 'admin'::text));
CREATE POLICY "portal_users_self_select" ON "public"."portal_users" FOR SELECT TO PUBLIC
    USING ((id = auth.uid()));
CREATE POLICY "portal_users_self_update" ON "public"."portal_users" FOR UPDATE TO PUBLIC
    USING ((id = auth.uid()));
CREATE POLICY "portal_users_staff_select" ON "public"."portal_users" FOR SELECT TO PUBLIC
    USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])));
CREATE POLICY "portal_users_staff_update_limited" ON "public"."portal_users" FOR UPDATE TO PUBLIC
    USING ((public.is_admin() OR (public.is_staff() AND (school_id = public.get_my_school_id()))))
    WITH CHECK ((public.is_admin() OR (public.is_staff() AND (school_id = public.get_my_school_id()))));
CREATE POLICY "staff_can_view_portal_users" ON "public"."portal_users" FOR SELECT TO PUBLIC
    USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])));
CREATE POLICY "staff_read_parent_accounts" ON "public"."portal_users" FOR SELECT TO authenticated
    USING (((role = 'parent'::text) AND public.is_admin_or_teacher()));
CREATE POLICY "teacher_update_parent_accounts" ON "public"."portal_users" FOR UPDATE TO authenticated
    USING (((role = 'parent'::text) AND public.is_admin_or_teacher()));
CREATE POLICY "portfolio_own_delete" ON "public"."portfolio_projects" FOR DELETE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "portfolio_own_insert" ON "public"."portfolio_projects" FOR INSERT TO PUBLIC
    WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "portfolio_own_select" ON "public"."portfolio_projects" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "portfolio_own_update" ON "public"."portfolio_projects" FOR UPDATE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "portfolio_staff_select" ON "public"."portfolio_projects" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Admins can manage programs" ON "public"."programs" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Public can view programs" ON "public"."programs" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "staff insert progression override audit" ON "public"."progression_override_audit" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = progression_override_audit.school_id))))));
CREATE POLICY "staff read progression override audit" ON "public"."progression_override_audit" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = progression_override_audit.school_id))))));
CREATE POLICY "Staff sees all project engagement" ON "public"."project_engagement" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own project engagement" ON "public"."project_engagement" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "staff_all_group_members" ON "public"."project_group_members" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "student_read_own_group_members" ON "public"."project_group_members" FOR SELECT TO PUBLIC
    USING ((group_id IN ( SELECT project_group_members_1.group_id
   FROM public.project_group_members project_group_members_1
  WHERE (project_group_members_1.student_id = auth.uid()))));
CREATE POLICY "staff_all_project_groups" ON "public"."project_groups" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "student_read_own_groups" ON "public"."project_groups" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.project_group_members
  WHERE ((project_group_members.group_id = project_groups.id) AND (project_group_members.student_id = auth.uid())))));
CREATE POLICY "Allow authenticated read" ON "public"."prospective_students" FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Allow authenticated update" ON "public"."prospective_students" FOR UPDATE TO authenticated
    USING (true);
CREATE POLICY "Allow public insert" ON "public"."prospective_students" FOR INSERT TO anon, authenticated
    WITH CHECK (true);
CREATE POLICY "Public can insert prospective students" ON "public"."prospective_students" FOR INSERT TO PUBLIC
    WITH CHECK (true);
CREATE POLICY "Staff can manage prospective students" ON "public"."prospective_students" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Admins can view all receipts" ON "public"."receipts" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Schools can view their own receipts" ON "public"."receipts" FOR SELECT TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))));
CREATE POLICY "Students can view their own receipts" ON "public"."receipts" FOR SELECT TO authenticated
    USING ((student_id = auth.uid()));
CREATE POLICY "Admins and teachers can insert batches" ON "public"."registration_batches" FOR INSERT TO PUBLIC
    WITH CHECK ((public.current_user_role() = ANY (ARRAY['admin'::text, 'teacher'::text])));
CREATE POLICY "Users can view their own batches or admin can view all" ON "public"."registration_batches" FOR SELECT TO PUBLIC
    USING (((auth.uid() = created_by) OR (public.current_user_role() = 'admin'::text)));
CREATE POLICY "Admins and teachers can insert results" ON "public"."registration_results" FOR INSERT TO PUBLIC
    WITH CHECK ((public.current_user_role() = ANY (ARRAY['admin'::text, 'teacher'::text])));
CREATE POLICY "Users can view results for batches they can see" ON "public"."registration_results" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.registration_batches
  WHERE ((registration_batches.id = registration_results.batch_id) AND ((registration_batches.created_by = auth.uid()) OR (public.current_user_role() = 'admin'::text))))));
CREATE POLICY "All authenticated can read report settings" ON "public"."report_settings" FOR SELECT TO PUBLIC
    USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Public read for report settings" ON "public"."report_settings" FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Staff can manage their own report settings" ON "public"."report_settings" FOR ALL TO authenticated
    USING (((auth.uid() = teacher_id) OR (( SELECT portal_users.role
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid())) = 'admin'::text)));
CREATE POLICY "Teachers manage own report settings" ON "public"."report_settings" FOR ALL TO PUBLIC
    USING (((teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text))))));
CREATE POLICY "Admins can manage reports" ON "public"."report_templates" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "service role manages result access codes" ON "public"."result_access_codes" FOR ALL TO PUBLIC
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "office_admin_incidents" ON "public"."safeguarding_incidents" FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());
CREATE POLICY "school_report_read_access" ON "public"."school_performance_reports" FOR SELECT TO authenticated
    USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.is_active = true) AND (COALESCE(pu.is_deleted, false) = false) AND (((pu.role = 'school'::text) AND (pu.school_id = pu.school_id) AND (school_performance_reports.status = 'published'::text)) OR ((pu.role = 'teacher'::text) AND ((pu.school_id = pu.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = pu.id) AND (ts.school_id = ts.school_id)))) OR (EXISTS ( SELECT 1
           FROM public.classes c
          WHERE ((c.teacher_id = pu.id) AND (c.school_id = c.school_id))))))))))));
CREATE POLICY "school_report_comment_read" ON "public"."school_report_comments" FOR SELECT TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.school_performance_reports r
  WHERE ((r.id = school_report_comments.report_id) AND ((EXISTS ( SELECT 1
           FROM public.portal_users u
          WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = r.school_id)))) OR ((r.status = 'published'::text) AND (EXISTS ( SELECT 1
           FROM public.portal_users u
          WHERE ((u.id = auth.uid()) AND (u.role = 'school'::text) AND (u.school_id = r.school_id))))))))));
CREATE POLICY "school_report_event_read" ON "public"."school_report_events" FOR SELECT TO authenticated
    USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM (public.school_performance_reports r
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((r.id = school_report_events.report_id) AND (pu.is_active = true) AND (NOT COALESCE(pu.is_deleted, false)) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text])) AND ((pu.role = 'admin'::text) OR (pu.school_id = r.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = pu.id) AND (ts.school_id = r.school_id))))))))));
CREATE POLICY "school_report_readiness_log_read" ON "public"."school_report_readiness_log" FOR SELECT TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM public.teacher_schools ts
  WHERE ((ts.teacher_id = auth.uid()) AND (ts.school_id = school_report_readiness_log.school_id))))));
CREATE POLICY "school_report_revision_read" ON "public"."school_report_revisions" FOR SELECT TO authenticated
    USING ((public.is_active_admin() OR (EXISTS ( SELECT 1
   FROM (public.school_performance_reports r
     JOIN public.portal_users pu ON ((pu.id = auth.uid())))
  WHERE ((r.id = school_report_revisions.report_id) AND (pu.is_active = true) AND (NOT COALESCE(pu.is_deleted, false)) AND (((pu.role = 'school'::text) AND (pu.school_id = r.school_id) AND (r.status = 'published'::text)) OR ((pu.role = 'teacher'::text) AND ((pu.school_id = r.school_id) OR (EXISTS ( SELECT 1
           FROM public.teacher_schools ts
          WHERE ((ts.teacher_id = pu.id) AND (ts.school_id = r.school_id)))) OR (EXISTS ( SELECT 1
           FROM public.classes c
          WHERE ((c.teacher_id = pu.id) AND (c.school_id = r.school_id))))))))))));
CREATE POLICY "admin_all_school_settlements" ON "public"."school_settlements" FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
CREATE POLICY "school_teacher_conversations_insert" ON "public"."school_teacher_conversations" FOR INSERT TO PUBLIC
    WITH CHECK (((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))));
CREATE POLICY "school_teacher_conversations_select" ON "public"."school_teacher_conversations" FOR SELECT TO PUBLIC
    USING (((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))));
CREATE POLICY "school_teacher_conversations_update" ON "public"."school_teacher_conversations" FOR UPDATE TO PUBLIC
    USING (((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))));
CREATE POLICY "school_teacher_messages_insert" ON "public"."school_teacher_messages" FOR INSERT TO PUBLIC
    WITH CHECK (((conversation_id IN ( SELECT school_teacher_conversations.id
   FROM public.school_teacher_conversations
  WHERE ((school_teacher_conversations.school_id IN ( SELECT portal_users.school_id
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (school_teacher_conversations.teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))))) AND (sender_id = auth.uid())));
CREATE POLICY "school_teacher_messages_select" ON "public"."school_teacher_messages" FOR SELECT TO PUBLIC
    USING ((conversation_id IN ( SELECT school_teacher_conversations.id
   FROM public.school_teacher_conversations
  WHERE ((school_teacher_conversations.school_id IN ( SELECT portal_users.school_id
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (school_teacher_conversations.teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))))));
CREATE POLICY "school_teacher_messages_update" ON "public"."school_teacher_messages" FOR UPDATE TO PUBLIC
    USING ((conversation_id IN ( SELECT school_teacher_conversations.id
   FROM public.school_teacher_conversations
  WHERE ((school_teacher_conversations.school_id IN ( SELECT portal_users.school_id
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))) OR (school_teacher_conversations.teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.portal_users
          WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text))))))));
CREATE POLICY "Admins/Teachers can manage school WA settings" ON "public"."school_whatsapp_settings" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text])) AND ((portal_users.school_id = school_whatsapp_settings.school_id) OR (portal_users.role = 'admin'::text))))));
CREATE POLICY "Admins can manage schools" ON "public"."schools" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Public can insert schools" ON "public"."schools" FOR INSERT TO PUBLIC
    WITH CHECK (true);
CREATE POLICY "Public can view schools" ON "public"."schools" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "schools_select_all" ON "public"."schools" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "schools_write_admin" ON "public"."schools" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text)))));
CREATE POLICY "staff_can_view_schools" ON "public"."schools" FOR SELECT TO PUBLIC
    USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])));
CREATE POLICY "Published showcase visible to school parents" ON "public"."showcase_items" FOR SELECT TO PUBLIC
    USING ((is_published = true));
CREATE POLICY "Staff manages showcase" ON "public"."showcase_items" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own showcase items" ON "public"."showcase_items" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "special_program_pages_public_read" ON "public"."special_program_pages" FOR SELECT TO anon, authenticated
    USING ((is_published = true));
CREATE POLICY "Staff sees assignment engagement" ON "public"."student_assignment_engagement" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own assignment engagement" ON "public"."student_assignment_engagement" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "Staff sees badges" ON "public"."student_badges" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own badges" ON "public"."student_badges" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "Admins can manage student enrollments" ON "public"."student_enrollments" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Teachers can view student enrollments" ON "public"."student_enrollments" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "sle_school_read" ON "public"."student_level_enrollments" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'school'::text) AND (u.school_id = student_level_enrollments.school_id)))));
CREATE POLICY "sle_staff_read" ON "public"."student_level_enrollments" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "sle_staff_write" ON "public"."student_level_enrollments" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "sle_student_read" ON "public"."student_level_enrollments" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "progress_select_all" ON "public"."student_progress" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "progress_write_staff" ON "public"."student_progress" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Schools view own student reports" ON "public"."student_progress_reports" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users manager
     LEFT JOIN public.portal_users student ON ((student.id = student_progress_reports.student_id)))
  WHERE ((manager.id = auth.uid()) AND (manager.role = 'school'::text) AND ((student_progress_reports.school_id = manager.school_id) OR (student_progress_reports.school_name = manager.school_name) OR (student.school_id = manager.school_id) OR (student.school_name = manager.school_name))))));
CREATE POLICY "Staff can manage all reports" ON "public"."student_progress_reports" FOR ALL TO authenticated
    USING (((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND ((portal_users.role = 'admin'::text) OR (portal_users.role = 'teacher'::text))))) OR (( SELECT portal_users.role
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid())) = 'admin'::text)));
CREATE POLICY "Students can view their own published reports" ON "public"."student_progress_reports" FOR SELECT TO authenticated
    USING (((auth.uid() = student_id) AND (is_published = true)));
CREATE POLICY "Students view own published reports" ON "public"."student_progress_reports" FOR SELECT TO PUBLIC
    USING (((student_id = auth.uid()) AND (is_published = true)));
CREATE POLICY "Teachers manage progress reports" ON "public"."student_progress_reports" FOR ALL TO PUBLIC
    USING (((teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'admin'::text))))));
CREATE POLICY "Teachers view school reports" ON "public"."student_progress_reports" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM ((public.portal_users teacher
     LEFT JOIN public.teacher_schools ts ON ((ts.teacher_id = teacher.id)))
     LEFT JOIN public.portal_users student ON ((student.id = student_progress_reports.student_id)))
  WHERE ((teacher.id = auth.uid()) AND (teacher.role = 'teacher'::text) AND ((student_progress_reports.school_id = ts.school_id) OR (student.school_id = ts.school_id) OR (student_progress_reports.teacher_id = teacher.id))))));
CREATE POLICY "parent_read_child_reports" ON "public"."student_progress_reports" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (is_published = true) AND (student_id IN ( SELECT public.get_parent_student_ids() AS get_parent_student_ids))));
CREATE POLICY "Staff sees streaks" ON "public"."student_streaks" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own streak" ON "public"."student_streaks" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "stm_insert" ON "public"."student_teacher_messages" FOR INSERT TO PUBLIC
    WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.student_teacher_threads t
  WHERE ((t.id = student_teacher_messages.thread_id) AND ((t.student_id = auth.uid()) OR (t.teacher_id = auth.uid())))))));
CREATE POLICY "stm_select" ON "public"."student_teacher_messages" FOR SELECT TO PUBLIC
    USING (((EXISTS ( SELECT 1
   FROM public.student_teacher_threads t
  WHERE ((t.id = student_teacher_messages.thread_id) AND ((t.student_id = auth.uid()) OR (t.teacher_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])))))));
CREATE POLICY "stm_update" ON "public"."student_teacher_messages" FOR UPDATE TO PUBLIC
    USING (((EXISTS ( SELECT 1
   FROM public.student_teacher_threads t
  WHERE ((t.id = student_teacher_messages.thread_id) AND ((t.student_id = auth.uid()) OR (t.teacher_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])))))));
CREATE POLICY "stt_delete" ON "public"."student_teacher_threads" FOR DELETE TO PUBLIC
    USING (((auth.uid() = student_id) OR (auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])))))));
CREATE POLICY "stt_insert" ON "public"."student_teacher_threads" FOR INSERT TO PUBLIC
    WITH CHECK (((auth.uid() = student_id) OR (auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])))))));
CREATE POLICY "stt_select" ON "public"."student_teacher_threads" FOR SELECT TO PUBLIC
    USING (((auth.uid() = student_id) OR (auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])))))));
CREATE POLICY "Staff can view xp" ON "public"."student_xp_ledger" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own xp" ON "public"."student_xp_ledger" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "Staff sees xp summary" ON "public"."student_xp_summary" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Student sees own xp summary" ON "public"."student_xp_summary" FOR SELECT TO PUBLIC
    USING ((student_id = auth.uid()));
CREATE POLICY "Admins can manage students" ON "public"."students" FOR ALL TO PUBLIC
    USING (public.is_admin());
CREATE POLICY "Public can insert students" ON "public"."students" FOR INSERT TO PUBLIC
    WITH CHECK (true);
CREATE POLICY "Schools can view their students" ON "public"."students" FOR SELECT TO PUBLIC
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))));
CREATE POLICY "Staff manage students legacy" ON "public"."students" FOR ALL TO authenticated
    USING ((public.is_staff() OR (auth.uid() = created_by)));
CREATE POLICY "parent_read_children" ON "public"."students" FOR SELECT TO authenticated
    USING ((public.is_parent() AND (id IN ( SELECT public.get_parent_student_ids() AS get_parent_student_ids))));
CREATE POLICY "staff_can_view_students" ON "public"."students" FOR SELECT TO PUBLIC
    USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])));
CREATE POLICY "staff_read_all_students_for_parent_link" ON "public"."students" FOR SELECT TO authenticated
    USING (public.is_staff());
CREATE POLICY "staff_update_student_parent_fields" ON "public"."students" FOR UPDATE TO authenticated
    USING (public.is_admin_or_teacher())
    WITH CHECK (public.is_admin_or_teacher());
CREATE POLICY "student_can_view_own_record" ON "public"."students" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "authenticated users insert membership" ON "public"."study_group_members" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "members delete own row" ON "public"."study_group_members" FOR DELETE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "members select own rows" ON "public"."study_group_members" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "members insert messages" ON "public"."study_group_messages" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.study_group_members sgm
  WHERE ((sgm.group_id = study_group_messages.group_id) AND (sgm.user_id = auth.uid())))));
CREATE POLICY "members select messages in their groups" ON "public"."study_group_messages" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.study_group_members sgm
  WHERE ((sgm.group_id = study_group_messages.group_id) AND (sgm.user_id = auth.uid())))));
CREATE POLICY "teachers admins delete messages" ON "public"."study_group_messages" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users pu
     JOIN public.study_groups sg ON ((sg.id = study_group_messages.group_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND (pu.school_id = sg.school_id)))));
CREATE POLICY "teachers admins select messages in school" ON "public"."study_group_messages" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM (public.portal_users pu
     JOIN public.study_groups sg ON ((sg.id = study_group_messages.group_id)))
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND (pu.school_id = sg.school_id)))));
CREATE POLICY "creator deletes own group" ON "public"."study_groups" FOR DELETE TO PUBLIC
    USING ((created_by = auth.uid()));
CREATE POLICY "creator updates own group" ON "public"."study_groups" FOR UPDATE TO PUBLIC
    USING ((created_by = auth.uid()));
CREATE POLICY "students select groups in their school" ON "public"."study_groups" FOR SELECT TO PUBLIC
    USING (((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE (portal_users.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'student'::text))))));
CREATE POLICY "teacher admin delete groups" ON "public"."study_groups" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND (pu.school_id = study_groups.school_id)))));
CREATE POLICY "teacher admin update groups" ON "public"."study_groups" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text])) AND (pu.school_id = study_groups.school_id)))));
CREATE POLICY "teachers admins insert groups" ON "public"."study_groups" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['teacher'::text, 'admin'::text, 'school'::text]))))));
CREATE POLICY "Users can view their own subscriptions" ON "public"."subscriptions" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "support_tickets_insert" ON "public"."support_tickets" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "support_tickets_select" ON "public"."support_tickets" FOR SELECT TO PUBLIC
    USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))))));
CREATE POLICY "support_tickets_update" ON "public"."support_tickets" FOR UPDATE TO PUBLIC
    USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))))));
CREATE POLICY "Admins can manage settings" ON "public"."system_settings" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Public can view public settings" ON "public"."system_settings" FOR SELECT TO PUBLIC
    USING ((is_public = true));
CREATE POLICY "teacher_schools_admin_all" ON "public"."teacher_schools" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "teacher_schools_teacher_select" ON "public"."teacher_schools" FOR SELECT TO PUBLIC
    USING ((teacher_id = auth.uid()));
CREATE POLICY "Admins can manage teachers" ON "public"."teachers" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Public can view teachers" ON "public"."teachers" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Teachers can update their own profile" ON "public"."teachers" FOR UPDATE TO PUBLIC
    USING ((id = auth.uid()));
CREATE POLICY "school admins delete term schedules for their school" ON "public"."term_schedules" FOR DELETE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = term_schedules.school_id)))));
CREATE POLICY "school admins insert term schedules for their school" ON "public"."term_schedules" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = term_schedules.school_id)))));
CREATE POLICY "school admins select term schedules for their school" ON "public"."term_schedules" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = term_schedules.school_id)))));
CREATE POLICY "school admins update term schedules for their school" ON "public"."term_schedules" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = ANY (ARRAY['admin'::text, 'school_admin'::text, 'school'::text])) AND (pu.school_id = term_schedules.school_id)))));
CREATE POLICY "teachers select term schedules for their school" ON "public"."term_schedules" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'teacher'::text) AND (pu.school_id = term_schedules.school_id)))));
CREATE POLICY "admin_all_timetable_slots" ON "public"."timetable_slots" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "school_read_slots" ON "public"."timetable_slots" FOR SELECT TO authenticated
    USING ((timetable_id IN ( SELECT public.get_timetable_ids_by_school(pu.school_id) AS get_timetable_ids_by_school
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'school'::text)))));
CREATE POLICY "student_read_slots" ON "public"."timetable_slots" FOR SELECT TO authenticated
    USING ((timetable_id IN ( SELECT public.get_timetable_ids_by_school(pu.school_id) AS get_timetable_ids_by_school
   FROM public.portal_users pu
  WHERE ((pu.id = auth.uid()) AND (pu.role = 'student'::text)))));
CREATE POLICY "teacher_read_slots" ON "public"."timetable_slots" FOR SELECT TO authenticated
    USING ((teacher_id = auth.uid()));
CREATE POLICY "admin_all_timetables" ON "public"."timetables" FOR ALL TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "school_read_timetables" ON "public"."timetables" FOR SELECT TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'school'::text)))));
CREATE POLICY "student_read_timetables" ON "public"."timetables" FOR SELECT TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'student'::text)))));
CREATE POLICY "teacher_read_timetables" ON "public"."timetables" FOR SELECT TO authenticated
    USING ((school_id IN ( SELECT portal_users.school_id
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'teacher'::text)))));
CREATE POLICY "Users can manage their own subscriptions" ON "public"."topic_subscriptions" FOR ALL TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own subscriptions" ON "public"."topic_subscriptions" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own badges" ON "public"."user_badges" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Users can view their own points" ON "public"."user_points" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Admins can manage all profiles" ON "public"."user_profiles" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "vault_items_owner" ON "public"."vault_items" FOR ALL TO PUBLIC
    USING ((auth.uid() = user_id))
    WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "service role all" ON "public"."web_push_subscriptions" FOR ALL TO PUBLIC
    USING ((auth.role() = 'service_role'::text));
CREATE POLICY "users delete own" ON "public"."web_push_subscriptions" FOR DELETE TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "users read own" ON "public"."web_push_subscriptions" FOR SELECT TO PUBLIC
    USING ((portal_user_id = auth.uid()));
CREATE POLICY "Staff insert WA conversations" ON "public"."whatsapp_conversations" FOR INSERT TO PUBLIC
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Staff update WA conversations" ON "public"."whatsapp_conversations" FOR UPDATE TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));
CREATE POLICY "Staff view WA conversations" ON "public"."whatsapp_conversations" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND ((portal_users.role = ANY (ARRAY['admin'::text, 'school'::text])) OR ((portal_users.role = 'teacher'::text) AND ((whatsapp_conversations.assigned_staff_id = auth.uid()) OR (whatsapp_conversations.portal_user_id IS NULL))))))));
CREATE POLICY "staff can insert broadcasts" ON "public"."whatsapp_group_broadcasts" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))));
CREATE POLICY "staff can view broadcasts for their school" ON "public"."whatsapp_group_broadcasts" FOR SELECT TO PUBLIC
    USING ((auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE ((portal_users.role = 'admin'::text) OR ((portal_users.role = ANY (ARRAY['teacher'::text, 'school'::text])) AND (portal_users.school_id = whatsapp_group_broadcasts.school_id))))));
CREATE POLICY "creator or admin can delete" ON "public"."whatsapp_groups" FOR DELETE TO PUBLIC
    USING (((auth.uid() = created_by) OR (auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE (portal_users.role = 'admin'::text)))));
CREATE POLICY "creator or admin can update" ON "public"."whatsapp_groups" FOR UPDATE TO PUBLIC
    USING (((auth.uid() = created_by) OR (auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE (portal_users.role = 'admin'::text)))));
CREATE POLICY "staff can insert groups" ON "public"."whatsapp_groups" FOR INSERT TO PUBLIC
    WITH CHECK ((auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])))));
CREATE POLICY "staff can view their school groups" ON "public"."whatsapp_groups" FOR SELECT TO PUBLIC
    USING ((auth.uid() IN ( SELECT portal_users.id
   FROM public.portal_users
  WHERE ((portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])) AND ((portal_users.role = 'admin'::text) OR (portal_users.school_id = whatsapp_groups.school_id))))));
CREATE POLICY "Staff can view WA messages" ON "public"."whatsapp_messages" FOR SELECT TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text]))))));

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON TABLE "public"."academic_terms" TO "anon";
GRANT ALL ON TABLE "public"."academic_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_terms" TO "postgres";
GRANT ALL ON TABLE "public"."academic_terms" TO "service_role";
GRANT ALL ON TABLE "public"."account_deletion_requests" TO "postgres";
GRANT ALL ON TABLE "public"."account_deletion_requests" TO "service_role";
GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "postgres";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";
GRANT ALL ON TABLE "public"."admin_dashboard_stats" TO "anon";
GRANT ALL ON TABLE "public"."admin_dashboard_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_dashboard_stats" TO "postgres";
GRANT ALL ON TABLE "public"."admin_dashboard_stats" TO "service_role";
GRANT ALL ON TABLE "public"."announcement_reads" TO "anon";
GRANT ALL ON TABLE "public"."announcement_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_reads" TO "postgres";
GRANT ALL ON TABLE "public"."announcement_reads" TO "service_role";
GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "postgres";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";
GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "postgres";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "postgres";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "service_role";
GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "postgres";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";
GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "postgres";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";
GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "postgres";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "postgres";
GRANT ALL ON TABLE "public"."badges" TO "service_role";
GRANT ALL ON TABLE "public"."balance_reminder_settings" TO "anon";
GRANT ALL ON TABLE "public"."balance_reminder_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."balance_reminder_settings" TO "postgres";
GRANT ALL ON TABLE "public"."balance_reminder_settings" TO "service_role";
GRANT ALL ON TABLE "public"."billing_contacts" TO "anon";
GRANT ALL ON TABLE "public"."billing_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_contacts" TO "postgres";
GRANT ALL ON TABLE "public"."billing_contacts" TO "service_role";
GRANT ALL ON TABLE "public"."billing_cycles" TO "anon";
GRANT ALL ON TABLE "public"."billing_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_cycles" TO "postgres";
GRANT ALL ON TABLE "public"."billing_cycles" TO "service_role";
GRANT ALL ON TABLE "public"."billing_document_archive" TO "anon";
GRANT ALL ON TABLE "public"."billing_document_archive" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_document_archive" TO "postgres";
GRANT ALL ON TABLE "public"."billing_document_archive" TO "service_role";
GRANT ALL ON TABLE "public"."billing_notices" TO "anon";
GRANT ALL ON TABLE "public"."billing_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_notices" TO "postgres";
GRANT ALL ON TABLE "public"."billing_notices" TO "service_role";
GRANT ALL ON TABLE "public"."billing_reminder_logs" TO "anon";
GRANT ALL ON TABLE "public"."billing_reminder_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_reminder_logs" TO "postgres";
GRANT ALL ON TABLE "public"."billing_reminder_logs" TO "service_role";
GRANT ALL ON TABLE "public"."card_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."card_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."card_audit_logs" TO "postgres";
GRANT ALL ON TABLE "public"."card_audit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."card_scan_logs" TO "anon";
GRANT ALL ON TABLE "public"."card_scan_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."card_scan_logs" TO "postgres";
GRANT ALL ON TABLE "public"."card_scan_logs" TO "service_role";
GRANT ALL ON TABLE "public"."cbt_exams" TO "anon";
GRANT ALL ON TABLE "public"."cbt_exams" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_exams" TO "postgres";
GRANT ALL ON TABLE "public"."cbt_exams" TO "service_role";
GRANT ALL ON TABLE "public"."cbt_questions" TO "anon";
GRANT ALL ON TABLE "public"."cbt_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_questions" TO "postgres";
GRANT ALL ON TABLE "public"."cbt_questions" TO "service_role";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "postgres";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."certificates" TO "postgres";
GRANT ALL ON TABLE "public"."certificates" TO "service_role";
GRANT SELECT ON TABLE "public"."class_lesson_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."class_lesson_delivery" TO "postgres";
GRANT ALL ON TABLE "public"."class_lesson_delivery" TO "service_role";
GRANT ALL ON TABLE "public"."class_sessions" TO "anon";
GRANT ALL ON TABLE "public"."class_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."class_sessions" TO "postgres";
GRANT ALL ON TABLE "public"."class_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."class_term_rosters" TO "anon";
GRANT ALL ON TABLE "public"."class_term_rosters" TO "authenticated";
GRANT ALL ON TABLE "public"."class_term_rosters" TO "postgres";
GRANT ALL ON TABLE "public"."class_term_rosters" TO "service_role";
GRANT ALL ON TABLE "public"."class_term_teaching_progress" TO "anon";
GRANT ALL ON TABLE "public"."class_term_teaching_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."class_term_teaching_progress" TO "postgres";
GRANT ALL ON TABLE "public"."class_term_teaching_progress" TO "service_role";
GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "postgres";
GRANT ALL ON TABLE "public"."classes" TO "service_role";
GRANT ALL ON TABLE "public"."communication_abuse_events" TO "anon";
GRANT ALL ON TABLE "public"."communication_abuse_events" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_abuse_events" TO "postgres";
GRANT ALL ON TABLE "public"."communication_abuse_events" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."communication_case_events" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."communication_case_events" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_case_events" TO "postgres";
GRANT ALL ON TABLE "public"."communication_case_events" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."communication_cases" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."communication_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_cases" TO "postgres";
GRANT ALL ON TABLE "public"."communication_cases" TO "service_role";
GRANT ALL ON TABLE "public"."communication_conversation_meta" TO "anon";
GRANT ALL ON TABLE "public"."communication_conversation_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_conversation_meta" TO "postgres";
GRANT ALL ON TABLE "public"."communication_conversation_meta" TO "service_role";
GRANT ALL ON TABLE "public"."communication_customer_identities" TO "anon";
GRANT ALL ON TABLE "public"."communication_customer_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_customer_identities" TO "postgres";
GRANT ALL ON TABLE "public"."communication_customer_identities" TO "service_role";
GRANT ALL ON TABLE "public"."communication_delivery_log" TO "anon";
GRANT ALL ON TABLE "public"."communication_delivery_log" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_delivery_log" TO "postgres";
GRANT ALL ON TABLE "public"."communication_delivery_log" TO "service_role";
GRANT ALL ON TABLE "public"."communication_escalations" TO "anon";
GRANT ALL ON TABLE "public"."communication_escalations" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_escalations" TO "postgres";
GRANT ALL ON TABLE "public"."communication_escalations" TO "service_role";
GRANT ALL ON TABLE "public"."communication_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."communication_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_rate_limits" TO "postgres";
GRANT ALL ON TABLE "public"."communication_rate_limits" TO "service_role";
GRANT ALL ON TABLE "public"."communication_reports" TO "anon";
GRANT ALL ON TABLE "public"."communication_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_reports" TO "postgres";
GRANT ALL ON TABLE "public"."communication_reports" TO "service_role";
GRANT ALL ON TABLE "public"."communication_template_versions" TO "anon";
GRANT ALL ON TABLE "public"."communication_template_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_template_versions" TO "postgres";
GRANT ALL ON TABLE "public"."communication_template_versions" TO "service_role";
GRANT ALL ON TABLE "public"."communication_templates" TO "anon";
GRANT ALL ON TABLE "public"."communication_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_templates" TO "postgres";
GRANT ALL ON TABLE "public"."communication_templates" TO "service_role";
GRANT ALL ON TABLE "public"."consent_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_forms" TO "postgres";
GRANT ALL ON TABLE "public"."consent_forms" TO "service_role";
GRANT ALL ON TABLE "public"."consent_responses" TO "anon";
GRANT ALL ON TABLE "public"."consent_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_responses" TO "postgres";
GRANT ALL ON TABLE "public"."consent_responses" TO "service_role";
GRANT ALL ON TABLE "public"."consent_submission_throttle" TO "postgres";
GRANT ALL ON TABLE "public"."consent_submission_throttle" TO "service_role";
GRANT ALL ON TABLE "public"."content_library" TO "anon";
GRANT ALL ON TABLE "public"."content_library" TO "authenticated";
GRANT ALL ON TABLE "public"."content_library" TO "postgres";
GRANT ALL ON TABLE "public"."content_library" TO "service_role";
GRANT ALL ON TABLE "public"."content_ratings" TO "anon";
GRANT ALL ON TABLE "public"."content_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."content_ratings" TO "postgres";
GRANT ALL ON TABLE "public"."content_ratings" TO "service_role";
GRANT ALL ON TABLE "public"."course_curricula" TO "anon";
GRANT ALL ON TABLE "public"."course_curricula" TO "authenticated";
GRANT ALL ON TABLE "public"."course_curricula" TO "postgres";
GRANT ALL ON TABLE "public"."course_curricula" TO "service_role";
GRANT ALL ON TABLE "public"."course_materials" TO "anon";
GRANT ALL ON TABLE "public"."course_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."course_materials" TO "postgres";
GRANT ALL ON TABLE "public"."course_materials" TO "service_role";
GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "postgres";
GRANT ALL ON TABLE "public"."courses" TO "service_role";
GRANT ALL ON TABLE "public"."crm_attachments" TO "anon";
GRANT ALL ON TABLE "public"."crm_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_attachments" TO "postgres";
GRANT ALL ON TABLE "public"."crm_attachments" TO "service_role";
GRANT ALL ON TABLE "public"."crm_interactions" TO "anon";
GRANT ALL ON TABLE "public"."crm_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_interactions" TO "postgres";
GRANT ALL ON TABLE "public"."crm_interactions" TO "service_role";
GRANT ALL ON TABLE "public"."crm_opportunities" TO "anon";
GRANT ALL ON TABLE "public"."crm_opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_opportunities" TO "postgres";
GRANT ALL ON TABLE "public"."crm_opportunities" TO "service_role";
GRANT ALL ON TABLE "public"."crm_pipeline" TO "anon";
GRANT ALL ON TABLE "public"."crm_pipeline" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_pipeline" TO "postgres";
GRANT ALL ON TABLE "public"."crm_pipeline" TO "service_role";
GRANT ALL ON TABLE "public"."crm_tasks" TO "anon";
GRANT ALL ON TABLE "public"."crm_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_tasks" TO "postgres";
GRANT ALL ON TABLE "public"."crm_tasks" TO "service_role";
GRANT ALL ON TABLE "public"."cron_job_health" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_health" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_health" TO "postgres";
GRANT ALL ON TABLE "public"."cron_job_health" TO "service_role";
GRANT ALL ON TABLE "public"."cron_run_history" TO "anon";
GRANT ALL ON TABLE "public"."cron_run_history" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_run_history" TO "postgres";
GRANT ALL ON TABLE "public"."cron_run_history" TO "service_role";
GRANT ALL ON TABLE "public"."curriculum_project_registry" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_project_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_project_registry" TO "postgres";
GRANT ALL ON TABLE "public"."curriculum_project_registry" TO "service_role";
GRANT ALL ON TABLE "public"."curriculum_project_usage" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_project_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_project_usage" TO "postgres";
GRANT ALL ON TABLE "public"."curriculum_project_usage" TO "service_role";
GRANT ALL ON TABLE "public"."curriculum_week_performance" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_week_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_week_performance" TO "postgres";
GRANT ALL ON TABLE "public"."curriculum_week_performance" TO "service_role";
GRANT ALL ON TABLE "public"."curriculum_week_tracking" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_week_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_week_tracking" TO "postgres";
GRANT ALL ON TABLE "public"."curriculum_week_tracking" TO "service_role";
GRANT ALL ON TABLE "public"."customer_contact_book" TO "anon";
GRANT ALL ON TABLE "public"."customer_contact_book" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_contact_book" TO "postgres";
GRANT ALL ON TABLE "public"."customer_contact_book" TO "service_role";
GRANT ALL ON TABLE "public"."customer_value_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."customer_value_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_value_outcomes" TO "postgres";
GRANT ALL ON TABLE "public"."customer_value_outcomes" TO "service_role";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "postgres";
GRANT ALL ON TABLE "public"."device_push_tokens" TO "service_role";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "anon";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "postgres";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "service_role";
GRANT ALL ON TABLE "public"."discussion_replies" TO "anon";
GRANT ALL ON TABLE "public"."discussion_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_replies" TO "postgres";
GRANT ALL ON TABLE "public"."discussion_replies" TO "service_role";
GRANT ALL ON TABLE "public"."discussion_topics" TO "anon";
GRANT ALL ON TABLE "public"."discussion_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_topics" TO "postgres";
GRANT ALL ON TABLE "public"."discussion_topics" TO "service_role";
GRANT ALL ON TABLE "public"."dismissed_duplicate_pairs" TO "postgres";
GRANT ALL ON TABLE "public"."dismissed_duplicate_pairs" TO "service_role";
GRANT ALL ON TABLE "public"."email_events" TO "anon";
GRANT ALL ON TABLE "public"."email_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_events" TO "postgres";
GRANT ALL ON TABLE "public"."email_events" TO "service_role";
GRANT ALL ON TABLE "public"."email_thread_links" TO "anon";
GRANT ALL ON TABLE "public"."email_thread_links" TO "authenticated";
GRANT ALL ON TABLE "public"."email_thread_links" TO "postgres";
GRANT ALL ON TABLE "public"."email_thread_links" TO "service_role";
GRANT ALL ON TABLE "public"."engage_posts" TO "anon";
GRANT ALL ON TABLE "public"."engage_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."engage_posts" TO "postgres";
GRANT ALL ON TABLE "public"."engage_posts" TO "service_role";
GRANT ALL ON TABLE "public"."enrollment_term_grades" TO "anon";
GRANT ALL ON TABLE "public"."enrollment_term_grades" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment_term_grades" TO "postgres";
GRANT ALL ON TABLE "public"."enrollment_term_grades" TO "service_role";
GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "postgres";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";
GRANT ALL ON TABLE "public"."exam_attempts" TO "anon";
GRANT ALL ON TABLE "public"."exam_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_attempts" TO "postgres";
GRANT ALL ON TABLE "public"."exam_attempts" TO "service_role";
GRANT ALL ON TABLE "public"."exam_questions" TO "anon";
GRANT ALL ON TABLE "public"."exam_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_questions" TO "postgres";
GRANT ALL ON TABLE "public"."exam_questions" TO "service_role";
GRANT ALL ON TABLE "public"."exams" TO "anon";
GRANT ALL ON TABLE "public"."exams" TO "authenticated";
GRANT ALL ON TABLE "public"."exams" TO "postgres";
GRANT ALL ON TABLE "public"."exams" TO "service_role";
GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "postgres";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";
GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "postgres";
GRANT ALL ON TABLE "public"."files" TO "service_role";
GRANT ALL ON TABLE "public"."finance_automation_log" TO "anon";
GRANT ALL ON TABLE "public"."finance_automation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_automation_log" TO "postgres";
GRANT ALL ON TABLE "public"."finance_automation_log" TO "service_role";
GRANT ALL ON TABLE "public"."finance_ledger" TO "anon";
GRANT ALL ON TABLE "public"."finance_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_ledger" TO "postgres";
GRANT ALL ON TABLE "public"."finance_ledger" TO "service_role";
GRANT ALL ON TABLE "public"."flagged_content" TO "anon";
GRANT ALL ON TABLE "public"."flagged_content" TO "authenticated";
GRANT ALL ON TABLE "public"."flagged_content" TO "postgres";
GRANT ALL ON TABLE "public"."flagged_content" TO "service_role";
GRANT ALL ON TABLE "public"."flashcard_card_statistics" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_card_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_card_statistics" TO "postgres";
GRANT ALL ON TABLE "public"."flashcard_card_statistics" TO "service_role";
GRANT ALL ON TABLE "public"."flashcard_cards" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_cards" TO "postgres";
GRANT ALL ON TABLE "public"."flashcard_cards" TO "service_role";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "postgres";
GRANT ALL ON TABLE "public"."flashcard_decks" TO "service_role";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "postgres";
GRANT ALL ON TABLE "public"."flashcard_reviews" TO "service_role";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "postgres";
GRANT ALL ON TABLE "public"."flashcard_study_sessions" TO "service_role";
GRANT SELECT ON TABLE "public"."form_lead_child_links" TO "authenticated";
GRANT ALL ON TABLE "public"."form_lead_child_links" TO "postgres";
GRANT ALL ON TABLE "public"."form_lead_child_links" TO "service_role";
GRANT ALL ON TABLE "public"."form_leads" TO "anon";
GRANT ALL ON TABLE "public"."form_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."form_leads" TO "postgres";
GRANT ALL ON TABLE "public"."form_leads" TO "service_role";
GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "postgres";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";
GRANT ALL ON TABLE "public"."grade_reports" TO "anon";
GRANT ALL ON TABLE "public"."grade_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_reports" TO "postgres";
GRANT ALL ON TABLE "public"."grade_reports" TO "service_role";
GRANT ALL ON TABLE "public"."identity_cards" TO "anon";
GRANT ALL ON TABLE "public"."identity_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_cards" TO "postgres";
GRANT ALL ON TABLE "public"."identity_cards" TO "service_role";
GRANT ALL ON TABLE "public"."instalment_items" TO "anon";
GRANT ALL ON TABLE "public"."instalment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."instalment_items" TO "postgres";
GRANT ALL ON TABLE "public"."instalment_items" TO "service_role";
GRANT ALL ON TABLE "public"."instalment_plans" TO "anon";
GRANT ALL ON TABLE "public"."instalment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."instalment_plans" TO "postgres";
GRANT ALL ON TABLE "public"."instalment_plans" TO "service_role";
GRANT ALL ON TABLE "public"."invoice_automation_logs" TO "anon";
GRANT ALL ON TABLE "public"."invoice_automation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_automation_logs" TO "postgres";
GRANT ALL ON TABLE "public"."invoice_automation_logs" TO "service_role";
GRANT ALL ON TABLE "public"."invoice_payment_proofs" TO "anon";
GRANT ALL ON TABLE "public"."invoice_payment_proofs" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_payment_proofs" TO "postgres";
GRANT ALL ON TABLE "public"."invoice_payment_proofs" TO "service_role";
GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "postgres";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";
GRANT ALL ON TABLE "public"."lab_projects" TO "anon";
GRANT ALL ON TABLE "public"."lab_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_projects" TO "postgres";
GRANT ALL ON TABLE "public"."lab_projects" TO "service_role";
GRANT ALL ON TABLE "public"."leaderboards" TO "anon";
GRANT ALL ON TABLE "public"."leaderboards" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboards" TO "postgres";
GRANT ALL ON TABLE "public"."leaderboards" TO "service_role";
GRANT ALL ON TABLE "public"."lesson_materials" TO "anon";
GRANT ALL ON TABLE "public"."lesson_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_materials" TO "postgres";
GRANT ALL ON TABLE "public"."lesson_materials" TO "service_role";
GRANT ALL ON TABLE "public"."lesson_plans" TO "anon";
GRANT ALL ON TABLE "public"."lesson_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_plans" TO "postgres";
GRANT ALL ON TABLE "public"."lesson_plans" TO "service_role";
GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "postgres";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";
GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "postgres";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "anon";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "anon";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "anon";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "anon";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "anon";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_polls" TO "anon";
GRANT ALL ON TABLE "public"."live_session_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_polls" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_polls" TO "service_role";
GRANT ALL ON TABLE "public"."live_session_questions" TO "anon";
GRANT ALL ON TABLE "public"."live_session_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_questions" TO "postgres";
GRANT ALL ON TABLE "public"."live_session_questions" TO "service_role";
GRANT ALL ON TABLE "public"."live_sessions" TO "anon";
GRANT ALL ON TABLE "public"."live_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_sessions" TO "postgres";
GRANT ALL ON TABLE "public"."live_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "postgres";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "service_role";
GRANT ALL ON TABLE "public"."marketing_events" TO "anon";
GRANT ALL ON TABLE "public"."marketing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_events" TO "postgres";
GRANT ALL ON TABLE "public"."marketing_events" TO "service_role";
GRANT ALL ON TABLE "public"."marketing_suppressions" TO "anon";
GRANT ALL ON TABLE "public"."marketing_suppressions" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_suppressions" TO "postgres";
GRANT ALL ON TABLE "public"."marketing_suppressions" TO "service_role";
GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "postgres";
GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT ALL ON TABLE "public"."newsletter_delivery" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_delivery" TO "postgres";
GRANT ALL ON TABLE "public"."newsletter_delivery" TO "service_role";
GRANT ALL ON TABLE "public"."newsletters" TO "anon";
GRANT ALL ON TABLE "public"."newsletters" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletters" TO "postgres";
GRANT ALL ON TABLE "public"."newsletters" TO "service_role";
GRANT ALL ON TABLE "public"."notification_dead_letters" TO "anon";
GRANT ALL ON TABLE "public"."notification_dead_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_dead_letters" TO "postgres";
GRANT ALL ON TABLE "public"."notification_dead_letters" TO "service_role";
GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "postgres";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";
GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "postgres";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";
GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "postgres";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT ALL ON TABLE "public"."operations_duty_rota" TO "anon";
GRANT ALL ON TABLE "public"."operations_duty_rota" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_duty_rota" TO "postgres";
GRANT ALL ON TABLE "public"."operations_duty_rota" TO "service_role";
GRANT ALL ON TABLE "public"."operations_staff_settings" TO "anon";
GRANT ALL ON TABLE "public"."operations_staff_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_staff_settings" TO "postgres";
GRANT ALL ON TABLE "public"."operations_staff_settings" TO "service_role";
GRANT ALL ON TABLE "public"."parent_claim_audit" TO "anon";
GRANT ALL ON TABLE "public"."parent_claim_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_claim_audit" TO "postgres";
GRANT ALL ON TABLE "public"."parent_claim_audit" TO "service_role";
GRANT ALL ON TABLE "public"."parent_claim_otps" TO "anon";
GRANT ALL ON TABLE "public"."parent_claim_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_claim_otps" TO "postgres";
GRANT ALL ON TABLE "public"."parent_claim_otps" TO "service_role";
GRANT ALL ON TABLE "public"."parent_feedback" TO "anon";
GRANT ALL ON TABLE "public"."parent_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_feedback" TO "postgres";
GRANT ALL ON TABLE "public"."parent_feedback" TO "service_role";
GRANT ALL ON TABLE "public"."parent_student_links" TO "anon";
GRANT ALL ON TABLE "public"."parent_student_links" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_student_links" TO "postgres";
GRANT ALL ON TABLE "public"."parent_student_links" TO "service_role";
GRANT ALL ON TABLE "public"."parent_teacher_messages" TO "anon";
GRANT ALL ON TABLE "public"."parent_teacher_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_teacher_messages" TO "postgres";
GRANT ALL ON TABLE "public"."parent_teacher_messages" TO "service_role";
GRANT ALL ON TABLE "public"."parent_teacher_threads" TO "anon";
GRANT ALL ON TABLE "public"."parent_teacher_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_teacher_threads" TO "postgres";
GRANT ALL ON TABLE "public"."parent_teacher_threads" TO "service_role";
GRANT ALL ON TABLE "public"."payment_accounts" TO "anon";
GRANT ALL ON TABLE "public"."payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_accounts" TO "postgres";
GRANT ALL ON TABLE "public"."payment_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "postgres";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";
GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "postgres";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";
GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "postgres";
GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT ALL ON TABLE "public"."platform_syllabus_week_template" TO "anon";
GRANT ALL ON TABLE "public"."platform_syllabus_week_template" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_syllabus_week_template" TO "postgres";
GRANT ALL ON TABLE "public"."platform_syllabus_week_template" TO "service_role";
GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "postgres";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";
GRANT ALL ON TABLE "public"."portal_users" TO "anon";
GRANT ALL ON TABLE "public"."portal_users" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_users" TO "postgres";
GRANT ALL ON TABLE "public"."portal_users" TO "service_role";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "postgres";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "service_role";
GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "postgres";
GRANT ALL ON TABLE "public"."programs" TO "service_role";
GRANT ALL ON TABLE "public"."progression_override_audit" TO "anon";
GRANT ALL ON TABLE "public"."progression_override_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."progression_override_audit" TO "postgres";
GRANT ALL ON TABLE "public"."progression_override_audit" TO "service_role";
GRANT ALL ON TABLE "public"."project_engagement" TO "anon";
GRANT ALL ON TABLE "public"."project_engagement" TO "authenticated";
GRANT ALL ON TABLE "public"."project_engagement" TO "postgres";
GRANT ALL ON TABLE "public"."project_engagement" TO "service_role";
GRANT ALL ON TABLE "public"."project_group_members" TO "anon";
GRANT ALL ON TABLE "public"."project_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_group_members" TO "postgres";
GRANT ALL ON TABLE "public"."project_group_members" TO "service_role";
GRANT ALL ON TABLE "public"."project_groups" TO "anon";
GRANT ALL ON TABLE "public"."project_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."project_groups" TO "postgres";
GRANT ALL ON TABLE "public"."project_groups" TO "service_role";
GRANT ALL ON TABLE "public"."prospective_students" TO "anon";
GRANT ALL ON TABLE "public"."prospective_students" TO "authenticated";
GRANT ALL ON TABLE "public"."prospective_students" TO "postgres";
GRANT ALL ON TABLE "public"."prospective_students" TO "service_role";
GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "postgres";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";
GRANT ALL ON TABLE "public"."registration_batches" TO "anon";
GRANT ALL ON TABLE "public"."registration_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_batches" TO "postgres";
GRANT ALL ON TABLE "public"."registration_batches" TO "service_role";
GRANT ALL ON TABLE "public"."registration_results" TO "anon";
GRANT ALL ON TABLE "public"."registration_results" TO "authenticated";
GRANT ALL ON TABLE "public"."registration_results" TO "postgres";
GRANT ALL ON TABLE "public"."registration_results" TO "service_role";
GRANT ALL ON TABLE "public"."report_settings" TO "anon";
GRANT ALL ON TABLE "public"."report_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."report_settings" TO "postgres";
GRANT ALL ON TABLE "public"."report_settings" TO "service_role";
GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "postgres";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";
GRANT ALL ON TABLE "public"."result_access_codes" TO "anon";
GRANT ALL ON TABLE "public"."result_access_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."result_access_codes" TO "postgres";
GRANT ALL ON TABLE "public"."result_access_codes" TO "service_role";
GRANT ALL ON TABLE "public"."safeguarding_incidents" TO "anon";
GRANT ALL ON TABLE "public"."safeguarding_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."safeguarding_incidents" TO "postgres";
GRANT ALL ON TABLE "public"."safeguarding_incidents" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_performance_reports" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_performance_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."school_performance_reports" TO "postgres";
GRANT ALL ON TABLE "public"."school_performance_reports" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_comments" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."school_report_comments" TO "postgres";
GRANT ALL ON TABLE "public"."school_report_comments" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_events" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_events" TO "authenticated";
GRANT ALL ON TABLE "public"."school_report_events" TO "postgres";
GRANT ALL ON TABLE "public"."school_report_events" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_readiness_log" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_readiness_log" TO "authenticated";
GRANT ALL ON TABLE "public"."school_report_readiness_log" TO "postgres";
GRANT ALL ON TABLE "public"."school_report_readiness_log" TO "service_role";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_revisions" TO "anon";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."school_report_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."school_report_revisions" TO "postgres";
GRANT ALL ON TABLE "public"."school_report_revisions" TO "service_role";
GRANT ALL ON TABLE "public"."school_settlements" TO "anon";
GRANT ALL ON TABLE "public"."school_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."school_settlements" TO "postgres";
GRANT ALL ON TABLE "public"."school_settlements" TO "service_role";
GRANT ALL ON TABLE "public"."school_teacher_conversations" TO "anon";
GRANT ALL ON TABLE "public"."school_teacher_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."school_teacher_conversations" TO "postgres";
GRANT ALL ON TABLE "public"."school_teacher_conversations" TO "service_role";
GRANT ALL ON TABLE "public"."school_teacher_messages" TO "anon";
GRANT ALL ON TABLE "public"."school_teacher_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."school_teacher_messages" TO "postgres";
GRANT ALL ON TABLE "public"."school_teacher_messages" TO "service_role";
GRANT ALL ON TABLE "public"."school_whatsapp_settings" TO "anon";
GRANT ALL ON TABLE "public"."school_whatsapp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."school_whatsapp_settings" TO "postgres";
GRANT ALL ON TABLE "public"."school_whatsapp_settings" TO "service_role";
GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "postgres";
GRANT ALL ON TABLE "public"."schools" TO "service_role";
GRANT ALL ON TABLE "public"."session_recordings" TO "anon";
GRANT ALL ON TABLE "public"."session_recordings" TO "authenticated";
GRANT ALL ON TABLE "public"."session_recordings" TO "postgres";
GRANT ALL ON TABLE "public"."session_recordings" TO "service_role";
GRANT ALL ON TABLE "public"."showcase_items" TO "anon";
GRANT ALL ON TABLE "public"."showcase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."showcase_items" TO "postgres";
GRANT ALL ON TABLE "public"."showcase_items" TO "service_role";
GRANT ALL ON TABLE "public"."special_program_pages" TO "anon";
GRANT ALL ON TABLE "public"."special_program_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."special_program_pages" TO "postgres";
GRANT ALL ON TABLE "public"."special_program_pages" TO "service_role";
GRANT ALL ON TABLE "public"."student_assignment_engagement" TO "anon";
GRANT ALL ON TABLE "public"."student_assignment_engagement" TO "authenticated";
GRANT ALL ON TABLE "public"."student_assignment_engagement" TO "postgres";
GRANT ALL ON TABLE "public"."student_assignment_engagement" TO "service_role";
GRANT ALL ON TABLE "public"."student_badges" TO "anon";
GRANT ALL ON TABLE "public"."student_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."student_badges" TO "postgres";
GRANT ALL ON TABLE "public"."student_badges" TO "service_role";
GRANT ALL ON TABLE "public"."student_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."student_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_enrollments" TO "postgres";
GRANT ALL ON TABLE "public"."student_enrollments" TO "service_role";
GRANT ALL ON TABLE "public"."student_level_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."student_level_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_level_enrollments" TO "postgres";
GRANT ALL ON TABLE "public"."student_level_enrollments" TO "service_role";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "anon";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "postgres";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "service_role";
GRANT ALL ON TABLE "public"."student_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_progress" TO "postgres";
GRANT ALL ON TABLE "public"."student_progress" TO "service_role";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "anon";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "postgres";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "service_role";
GRANT ALL ON TABLE "public"."student_streaks" TO "anon";
GRANT ALL ON TABLE "public"."student_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."student_streaks" TO "postgres";
GRANT ALL ON TABLE "public"."student_streaks" TO "service_role";
GRANT ALL ON TABLE "public"."student_teacher_messages" TO "anon";
GRANT ALL ON TABLE "public"."student_teacher_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."student_teacher_messages" TO "postgres";
GRANT ALL ON TABLE "public"."student_teacher_messages" TO "service_role";
GRANT ALL ON TABLE "public"."student_teacher_threads" TO "anon";
GRANT ALL ON TABLE "public"."student_teacher_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."student_teacher_threads" TO "postgres";
GRANT ALL ON TABLE "public"."student_teacher_threads" TO "service_role";
GRANT ALL ON TABLE "public"."student_transfer_requests" TO "postgres";
GRANT ALL ON TABLE "public"."student_transfer_requests" TO "service_role";
GRANT ALL ON TABLE "public"."student_xp_ledger" TO "anon";
GRANT ALL ON TABLE "public"."student_xp_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."student_xp_ledger" TO "postgres";
GRANT ALL ON TABLE "public"."student_xp_ledger" TO "service_role";
GRANT ALL ON TABLE "public"."student_xp_summary" TO "anon";
GRANT ALL ON TABLE "public"."student_xp_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."student_xp_summary" TO "postgres";
GRANT ALL ON TABLE "public"."student_xp_summary" TO "service_role";
GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "postgres";
GRANT ALL ON TABLE "public"."students" TO "service_role";
GRANT ALL ON TABLE "public"."study_group_members" TO "anon";
GRANT ALL ON TABLE "public"."study_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."study_group_members" TO "postgres";
GRANT ALL ON TABLE "public"."study_group_members" TO "service_role";
GRANT ALL ON TABLE "public"."study_group_messages" TO "anon";
GRANT ALL ON TABLE "public"."study_group_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."study_group_messages" TO "postgres";
GRANT ALL ON TABLE "public"."study_group_messages" TO "service_role";
GRANT ALL ON TABLE "public"."study_groups" TO "anon";
GRANT ALL ON TABLE "public"."study_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."study_groups" TO "postgres";
GRANT ALL ON TABLE "public"."study_groups" TO "service_role";
GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "postgres";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "postgres";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";
GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "postgres";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";
GRANT ALL ON TABLE "public"."teacher_schools" TO "anon";
GRANT ALL ON TABLE "public"."teacher_schools" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_schools" TO "postgres";
GRANT ALL ON TABLE "public"."teacher_schools" TO "service_role";
GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "postgres";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";
GRANT ALL ON TABLE "public"."term_schedules" TO "anon";
GRANT ALL ON TABLE "public"."term_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."term_schedules" TO "postgres";
GRANT ALL ON TABLE "public"."term_schedules" TO "service_role";
GRANT ALL ON TABLE "public"."timetable_slots" TO "anon";
GRANT ALL ON TABLE "public"."timetable_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."timetable_slots" TO "postgres";
GRANT ALL ON TABLE "public"."timetable_slots" TO "service_role";
GRANT ALL ON TABLE "public"."timetables" TO "anon";
GRANT ALL ON TABLE "public"."timetables" TO "authenticated";
GRANT ALL ON TABLE "public"."timetables" TO "postgres";
GRANT ALL ON TABLE "public"."timetables" TO "service_role";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "postgres";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "postgres";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";
GRANT ALL ON TABLE "public"."user_points" TO "anon";
GRANT ALL ON TABLE "public"."user_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_points" TO "postgres";
GRANT ALL ON TABLE "public"."user_points" TO "service_role";
GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "postgres";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT ALL ON TABLE "public"."vault_items" TO "anon";
GRANT ALL ON TABLE "public"."vault_items" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_items" TO "postgres";
GRANT ALL ON TABLE "public"."vault_items" TO "service_role";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "postgres";
GRANT ALL ON TABLE "public"."web_push_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "postgres";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "service_role";
GRANT ALL ON TABLE "public"."whatsapp_group_broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_group_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_group_broadcasts" TO "postgres";
GRANT ALL ON TABLE "public"."whatsapp_group_broadcasts" TO "service_role";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "postgres";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "service_role";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "postgres";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "postgres";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."allocate_payment_to_invoice"(p_transaction_id uuid, p_invoice_id uuid, p_amount numeric, p_actor_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."assignment_matches_term"(p_assignment_term_id uuid, p_term_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."block_duplicate_active_student_name"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."block_duplicate_active_student_name"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."block_duplicate_active_student_name"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."block_duplicate_active_student_name"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."block_duplicate_active_student_name"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."canonical_grade"(input text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."canonical_grade"(input text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."canonical_grade"(input text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."canonical_grade"(input text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."canonical_grade"(input text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."cascade_portal_user_to_student"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cascade_portal_user_to_student"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cascade_portal_user_to_student"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cascade_portal_user_to_student"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."cascade_portal_user_to_student"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."cascade_school_rename"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cascade_school_rename"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cascade_school_rename"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cascade_school_rename"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."cascade_school_rename"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."cascade_student_name"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cascade_student_name"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cascade_student_name"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cascade_student_name"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."cascade_student_name"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."cbt_session_matches_term"(p_end_time timestamp with time zone, p_metadata jsonb, p_term_id uuid, p_exam_term_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_instalment_plan_completion"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_instalment_plan_completion"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_instalment_plan_completion"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_instalment_plan_completion"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."check_instalment_plan_completion"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."claim_whatsapp_outbox"(p_limit integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."claim_whatsapp_outbox"(p_limit integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."consume_communication_rate_limit"(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."consume_communication_rate_limit"(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."consume_communication_rate_limit"(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."consume_communication_rate_limit"(p_sender_id uuid, p_sender_role text, p_day_bucket timestamp with time zone) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_billing_cycle_with_invoice"(p_owner_type text, p_owner_school_id uuid, p_owner_user_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_subscription_id uuid, p_actor_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."create_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_portal_user_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_stream text, p_billing_cycle_id uuid, p_metadata jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."create_school_term_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."create_school_term_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_school_term_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_school_term_invoice_atomic"(p_invoice_number text, p_school_id uuid, p_academic_term_id uuid, p_amount numeric, p_currency text, p_status text, p_due_date timestamp with time zone, p_items jsonb, p_notes text, p_metadata jsonb, p_actor_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_academic_term"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_academic_term"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."current_academic_term"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_academic_term"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."current_academic_term"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."decide_student_transfer_request"(p_request_id uuid, p_actor_id uuid, p_approve boolean, p_note text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."decide_student_transfer_request"(p_request_id uuid, p_actor_id uuid, p_approve boolean, p_note text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_consent_response_data"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_consent_response_data"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_consent_response_data"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_consent_response_data"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_consent_response_data"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ensure_class_term_teaching_plan"(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."ensure_class_term_teaching_plan"(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."ensure_class_term_teaching_plan"(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."ensure_class_term_teaching_plan"(p_class_id uuid, p_course_id uuid, p_academic_term_id uuid, p_curriculum_version_id uuid, p_actor_id uuid, p_sessions_per_week integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ensure_settled_invoice_atomic"(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."ensure_settled_invoice_atomic"(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."ensure_settled_invoice_atomic"(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."ensure_settled_invoice_atomic"(p_transaction_id uuid, p_invoice_number text, p_amount numeric, p_currency text, p_school_id uuid, p_portal_user_id uuid, p_items jsonb, p_metadata jsonb, p_stream text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ensure_student_shadow_row"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."ensure_student_shadow_row"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."ensure_student_shadow_row"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."ensure_student_shadow_row"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."ensure_student_shadow_row"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."finalize_full_refund_atomic"(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb, p_actor_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."finalize_full_refund_atomic"(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb, p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."finalize_full_refund_atomic"(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb, p_actor_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."finalize_full_refund_atomic"(p_transaction_id uuid, p_reason text, p_gateway_refund jsonb, p_actor_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."find_school_student_name_conflicts"(p_school_id uuid, p_school_name text, p_name_keys text[]) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."find_school_student_name_conflicts"(p_school_id uuid, p_school_name text, p_name_keys text[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."find_school_student_name_conflicts"(p_school_id uuid, p_school_name text, p_name_keys text[]) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."find_school_student_name_conflicts"(p_school_id uuid, p_school_name text, p_name_keys text[]) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."fix_portal_user_enrollment_type"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."fix_portal_user_enrollment_type"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."fix_portal_user_enrollment_type"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."fix_portal_user_enrollment_type"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."fix_portal_user_enrollment_type"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."fix_student_enrollment_type"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."fix_student_enrollment_type"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."fix_student_enrollment_type"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."fix_student_enrollment_type"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."fix_student_enrollment_type"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."generate_invoice_number"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."generate_invoice_number"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."generate_invoice_number"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."generate_receipt_number"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."generate_receipt_number"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."generate_receipt_number"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."generate_receipt_number"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."generate_receipt_number"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_assignment_grade"(p_course_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_course_avg_exam_score"(p_course_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_my_school_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_my_school_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_my_school_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_my_school_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_my_school_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_or_create_inbox_conversation"(p_portal_user_id uuid, p_contact_name text, p_phone_number text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_or_create_inbox_conversation"(p_portal_user_id uuid, p_contact_name text, p_phone_number text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_or_create_inbox_conversation"(p_portal_user_id uuid, p_contact_name text, p_phone_number text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_or_create_inbox_conversation"(p_portal_user_id uuid, p_contact_name text, p_phone_number text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_parent_child_user_ids"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_parent_child_user_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_parent_child_user_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_parent_child_user_ids"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_parent_child_user_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_parent_student_ids"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_parent_student_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_parent_student_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_parent_student_ids"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_parent_student_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_timetable_ids_by_school"(p_school_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."guard_class_primary_owner"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."guard_class_primary_owner"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."guard_class_primary_owner"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."guard_class_primary_owner"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."guard_class_primary_owner"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."guard_student_class_division"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."guard_student_class_division"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."guard_student_class_division"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."guard_student_class_division"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."guard_student_class_division"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."guard_summer_prospect_active"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."guard_summer_prospect_active"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."guard_summer_prospect_active"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."guard_summer_prospect_active"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."guard_summer_prospect_active"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."guard_whatsapp_group_class_owner"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."guard_whatsapp_group_class_owner"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."guard_whatsapp_group_class_owner"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."guard_whatsapp_group_class_owner"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."guard_whatsapp_group_class_owner"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_certificate_trigger"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."handle_certificate_trigger"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."handle_certificate_trigger"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."handle_certificate_trigger"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."handle_certificate_trigger"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_school_wa_settings"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."handle_new_school_wa_settings"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."handle_new_school_wa_settings"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."handle_new_school_wa_settings"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."handle_new_school_wa_settings"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handover_primary_duty"(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."handover_primary_duty"(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."handover_primary_duty"(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."handover_primary_duty"(p_staff_id uuid, p_duty_kind text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_created_by uuid, p_is_primary boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_portal_user"(p_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_portal_user"(p_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_school"(p_school uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."hard_delete_school"(p_school uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_school"(p_school uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_school"(p_school uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."hard_delete_school"(p_school uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."increment_download_count"(file_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."increment_download_count"(file_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."increment_download_count"(file_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."increment_download_count"(file_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."increment_download_count"(file_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."increment_question_upvotes"(question_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."increment_question_upvotes"(question_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."increment_question_upvotes"(question_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."increment_question_upvotes"(question_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."increment_question_upvotes"(question_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_admin_or_teacher"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_admin_or_teacher"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_admin_or_teacher"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin_or_teacher"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_admin_or_teacher"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_parent"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_parent"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_parent"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_parent"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_parent"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."live_academic_session_label"(p_now date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."live_academic_session_label"(p_now date) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."live_academic_session_label"(p_now date) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."live_academic_session_label"(p_now date) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."live_academic_session_label"(p_now date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."live_academic_term_id"(p_now date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."live_academic_term_id"(p_now date) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."live_academic_term_id"(p_now date) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."live_academic_term_id"(p_now date) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."live_academic_term_id"(p_now date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."normalize_contact_book_phone"(raw text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."normalize_contact_book_phone"(raw text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."normalize_contact_book_phone"(raw text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."normalize_contact_book_phone"(raw text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."normalize_contact_book_phone"(raw text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_invoice_paid"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_invoice_paid"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_invoice_paid"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_invoice_paid"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_invoice_paid"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_report_publish"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_report_publish"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_report_publish"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_report_publish"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."notify_parent_on_report_publish"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prevent_student_submission_grade_tamper"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."prevent_student_submission_grade_tamper"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."prevent_student_submission_grade_tamper"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."prevent_student_submission_grade_tamper"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."prevent_student_submission_grade_tamper"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."purge_registration_archive_on_user_delete"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."purge_registration_archive_on_user_delete"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."purge_registration_archive_on_user_delete"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."purge_registration_archive_on_user_delete"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."purge_registration_archive_on_user_delete"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_balances_atomic"(p_invoice_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_balances_atomic"(p_invoice_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_balances_atomic"(p_invoice_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_balances_atomic"(p_invoice_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_class_lesson_delivery"(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text, p_class_session_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."record_class_lesson_delivery"(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text, p_class_session_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_class_lesson_delivery"(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text, p_class_session_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."record_class_lesson_delivery"(p_lesson_plan_id uuid, p_week_number integer, p_lesson_id uuid, p_status text, p_actor_id uuid, p_notes text, p_class_session_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."refresh_dashboard_stats"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."refresh_dashboard_stats"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."refresh_dashboard_stats"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."refresh_dashboard_stats"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."refresh_dashboard_stats"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."repoint_contact_book_dupe"(dupe_id uuid, keep_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."require_portal_structure"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."require_portal_structure"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."require_portal_structure"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."require_portal_structure"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."require_portal_structure"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."resolve_academic_term"(p_year text, p_term text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_attendance_roster_context"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_attendance_roster_context"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_attendance_roster_context"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_attendance_roster_context"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_attendance_roster_context"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_class_session_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_class_session_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_class_session_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_class_session_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_class_session_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."settle_billing_cycle_payment_atomic"(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."settle_billing_cycle_payment_atomic"(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."settle_billing_cycle_payment_atomic"(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."settle_billing_cycle_payment_atomic"(p_billing_cycle_id uuid, p_transaction_id uuid, p_actor_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."staff_can_access_assignment"(a public.assignments) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."staff_can_access_assignment"(a public.assignments) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."staff_can_access_assignment"(a public.assignments) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."staff_can_access_assignment"(a public.assignments) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."student_duplicate_name_key"(raw_name text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."student_duplicate_name_key"(raw_name text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."student_duplicate_name_key"(raw_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."student_duplicate_name_key"(raw_name text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."student_duplicate_name_key"(raw_name text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_assignment_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_assignment_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_assignment_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_assignment_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_assignment_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_class_ownership_from_teacher_schools"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_class_ownership_from_teacher_schools"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_class_ownership_from_teacher_schools"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_class_ownership_from_teacher_schools"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_class_ownership_from_teacher_schools"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_class_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_class_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_class_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_class_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_class_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_enrollment_live_grade"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_enrollment_live_grade"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_enrollment_live_grade"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_enrollment_live_grade"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_enrollment_live_grade"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_form_lead_primary_child_cache"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_form_lead_primary_child_cache"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_form_lead_primary_child_cache"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_form_lead_primary_child_cache"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_form_lead_primary_child_cache"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_invoice_amount_from_original"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_invoice_amount_from_original"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_invoice_amount_from_original"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_invoice_amount_from_original"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_invoice_amount_from_original"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_lesson_plan_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_lesson_plan_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_lesson_plan_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_lesson_plan_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_lesson_plan_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_parent_email_on_update"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_parent_email_on_update"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_parent_email_on_update"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_parent_email_on_update"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_parent_email_on_update"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_portal_student_placement"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_portal_student_placement"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_portal_student_placement"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_portal_student_placement"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_portal_student_placement"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_progress_report_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_progress_report_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_progress_report_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_progress_report_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_progress_report_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_report_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_report_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_report_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_report_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_report_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_school_name_from_fk"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_school_name_from_fk"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_school_name_from_fk"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_school_name_from_fk"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_school_name_from_fk"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_student_registry_placement"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_student_registry_placement"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_student_registry_placement"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_student_registry_placement"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_student_registry_placement"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_timetable_term_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_timetable_term_id"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_timetable_term_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_timetable_term_id"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_timetable_term_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."sync_whatsapp_conversation_school"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_whatsapp_conversation_school"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_whatsapp_conversation_school"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_whatsapp_conversation_school"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_whatsapp_conversation_school"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."term_id_for_date"(p_date date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."term_id_for_date"(p_date date) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."term_id_for_date"(p_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."term_id_for_date"(p_date date) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."term_id_for_date"(p_date date) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."touch_session_recordings_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."touch_session_recordings_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."touch_session_recordings_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."touch_session_recordings_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."touch_session_recordings_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."trg_portal_users_fill_grade"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."trg_portal_users_fill_grade"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."trg_portal_users_fill_grade"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."trg_portal_users_fill_grade"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."trg_portal_users_fill_grade"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_billing_cycle_with_invoice"(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_metadata jsonb, p_notes text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_billing_cycle_with_invoice"(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_metadata jsonb, p_notes text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_billing_cycle_with_invoice"(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_metadata jsonb, p_notes text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_billing_cycle_with_invoice"(p_cycle_id uuid, p_term_label text, p_term_start_date date, p_due_date date, p_amount_due numeric, p_currency text, p_status text, p_items jsonb, p_metadata jsonb, p_notes text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_conversation_timestamp"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_conversation_timestamp"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_conversation_timestamp"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_conversation_timestamp"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_conversation_timestamp"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_feedback_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_feedback_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_feedback_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_feedback_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_feedback_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_flashcard_statistics"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_flashcard_statistics"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_flashcard_statistics"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_flashcard_statistics"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_flashcard_statistics"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_last_login"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_last_login"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_last_login"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_last_login"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_last_login"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_live_sessions_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_live_sessions_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_live_sessions_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_live_sessions_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_live_sessions_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_parent_feedback_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_parent_feedback_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_parent_feedback_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_parent_feedback_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_parent_feedback_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_support_tickets_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_support_tickets_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_support_tickets_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_support_tickets_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_support_tickets_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_xp_summary"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_xp_summary"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_xp_summary"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_xp_summary"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_xp_summary"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."upsert_enrollment_term_grade"(p_enrollment_id uuid, p_grade text, p_notes text, p_term_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."validate_form_lead_child_link_roles"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."validate_form_lead_child_link_roles"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."validate_form_lead_child_link_roles"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."validate_form_lead_child_link_roles"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."validate_form_lead_child_link_roles"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."withdraw_receipt_atomic"(p_receipt_id uuid, p_actor_id uuid, p_reason text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."withdraw_receipt_atomic"(p_receipt_id uuid, p_actor_id uuid, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."withdraw_receipt_atomic"(p_receipt_id uuid, p_actor_id uuid, p_reason text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."withdraw_receipt_atomic"(p_receipt_id uuid, p_actor_id uuid, p_reason text) TO "service_role";

-- ============================================================================
-- DEFAULT PRIVILEGES
-- ============================================================================

-- Managed by Supabase, not settable by the deploying role, so omitted:
--   ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" ...

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ============================================================================
-- REALTIME PUBLICATIONS
-- ============================================================================

-- supabase_realtime: 3 table(s)
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_conversations";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."whatsapp_messages";


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN "public"."billing_cycles"."academic_term_id" IS 'Authoritative academic term; runtime code must not infer this relationship from labels.';
COMMENT ON COLUMN "public"."billing_cycles"."items" IS 'Array of { invoice_id, invoice_number, amount, currency, status, student_name } included in this cycle';
COMMENT ON COLUMN "public"."billing_document_archive"."html_body" IS 'Full printable HTML snapshot of the generated billing document.';
COMMENT ON COLUMN "public"."cbt_exams"."class_id" IS 'Canonical class receiving this evaluation.';
COMMENT ON COLUMN "public"."cbt_exams"."curriculum_week_number" IS 'Curriculum week evaluated by this CBT.';
COMMENT ON COLUMN "public"."cbt_exams"."lesson_id" IS 'Optional lesson evaluated by this CBT.';
COMMENT ON COLUMN "public"."cbt_exams"."lesson_plan_id" IS 'Canonical class term plan that produced this evaluation.';
COMMENT ON COLUMN "public"."cbt_exams"."term_id" IS 'Academic session (year + term). Prefer over metadata.term_id for isolation.';
COMMENT ON COLUMN "public"."classes"."qa_grade_band" IS 'E.g. b1_1_2 for Basic 1–2 when mode is optional.';
COMMENT ON COLUMN "public"."classes"."qa_grade_key" IS 'Optional canonical e.g. basic_1, jss_2 — use when class name is not a grade (SCRATCHCC).';
COMMENT ON COLUMN "public"."classes"."qa_grade_mode" IS 'optional: band may span grades; compulsory: class maps to a single grade for QA.';
COMMENT ON COLUMN "public"."classes"."qa_spine_lane" IS 'Pin platform QA lane 1-11; if null, resolved from grade_key + track + programme policy.';
COMMENT ON COLUMN "public"."classes"."qa_track_hint" IS 'E.g. python, html_css, jss_web_app — disambiguate lanes (Basic 4 has two).';
COMMENT ON COLUMN "public"."consent_forms"."class_id" IS 'Optional class the form was created for; students onboarded from this form''s leads are placed here.';
COMMENT ON COLUMN "public"."courses"."is_locked" IS 'When true, the course is hidden from students. Teachers/admins can still see it. Use this to control which courses students can focus on at any given time.';
COMMENT ON COLUMN "public"."courses"."metadata" IS 'Soft tagging payload. Known keys: grade_levels (text[]), subject (text), tags (text[]).';
COMMENT ON COLUMN "public"."feedback"."rating" IS 'User satisfaction rating (1-5 stars)';
COMMENT ON COLUMN "public"."feedback"."status" IS 'Feedback status: new, in_progress, resolved, closed';
COMMENT ON COLUMN "public"."feedback"."type" IS 'Type of feedback: suggestion, complaint, praise, question';
COMMENT ON COLUMN "public"."flashcard_decks"."class_id" IS 'Canonical class receiving this deck.';
COMMENT ON COLUMN "public"."flashcard_decks"."curriculum_week_number" IS 'Curriculum week within the canonical class plan.';
COMMENT ON COLUMN "public"."flashcard_decks"."lesson_plan_id" IS 'Canonical class term plan that produced this deck.';
COMMENT ON COLUMN "public"."flashcard_decks"."progression_track" IS 'Applied track for deck context: young_innovator, scratch, python, html/html_css, jss_web_app, ss_uiux_mobile';
COMMENT ON COLUMN "public"."flashcard_decks"."school_progression_enabled" IS 'Whether school-only progression policy was active for this deck when created';
COMMENT ON COLUMN "public"."flashcard_decks"."term_id" IS 'Academic session (year + term) for flashcard deck isolation.';
COMMENT ON COLUMN "public"."form_lead_child_links"."child_index" IS 'Zero-based child slot from the submitted consent record; slot zero is the primary-child cache source.';
COMMENT ON COLUMN "public"."form_lead_child_links"."student_portal_user_id" IS 'portal_users.id for a student-role account, validated by trigger.';
COMMENT ON COLUMN "public"."lab_projects"."assignment_id" IS 'Associates this project with a specific assignment';
COMMENT ON COLUMN "public"."lab_projects"."lesson_id" IS 'Associates this project with a specific lesson';
COMMENT ON COLUMN "public"."newsletters"."scheduled_for" IS 'When a scheduled newsletter should auto-publish/push. NULL = not scheduled.';
COMMENT ON COLUMN "public"."portal_users"."grade" IS 'Canonical student grade or band label; NULL for online cohorts. Set on creation and by the grade backfill.';
COMMENT ON COLUMN "public"."portal_users"."is_direct_enrollment" IS 'True if the student registered directly (Bootcamp, Summer School) vs through a partner school.';
COMMENT ON COLUMN "public"."portal_users"."metadata" IS 'Arbitrary JSON (e.g. prospective registration fields) alongside typed columns.';
COMMENT ON COLUMN "public"."portal_users"."whatsapp_opt_in" IS 'User has consented to receive WhatsApp notifications';
COMMENT ON COLUMN "public"."programs"."program_scope" IS 'Canonical: regular_school | online | special (special was summer_school/bootcamp)';
COMMENT ON COLUMN "public"."programs"."progression_policy" IS 'JSON policy for stage progression, non-repeat constraints, track defaults, and flexible cross-course access';
COMMENT ON COLUMN "public"."programs"."school_progression_enabled" IS 'Enables school-role progression rules for this program (regular_school only)';
COMMENT ON COLUMN "public"."programs"."session_frequency_per_week" IS 'Expected class cadence for school progression (1 or 2 per week)';
COMMENT ON COLUMN "public"."school_performance_reports"."design" IS 'Staff-controlled layout: accent color, section visibility, density, preview device, header style.';
COMMENT ON COLUMN "public"."school_performance_reports"."lock_version" IS 'Incremented on each successful PATCH; clients must send expectedRevision to avoid last-write-wins overwrites.';
COMMENT ON COLUMN "public"."schools"."commission_rate" IS 'Percent of cycle amount retained by Rillcod before partner settlement';
COMMENT ON COLUMN "public"."schools"."public_enrollment_open" IS 'When true, this school appears on public partner-school registration (keep to live partners only).';
COMMENT ON COLUMN "public"."schools"."rillcod_quota_percent" IS 'Percentage of school fees that belongs to Rillcod for services rendered.';
COMMENT ON COLUMN "public"."student_progress_reports"."participation_score" IS 'Numerical score representing student activity and engagement.';
COMMENT ON COLUMN "public"."student_progress_reports"."published_at" IS 'When the report was first published to parents/students. Cleared on unpublish.';
COMMENT ON COLUMN "public"."student_progress_reports"."student_grade" IS 'Student grade level ("Basic 1" / "JSS 2") shown as "Class" on the report — distinct from section_class (the cohort, shown as "Section").';
COMMENT ON COLUMN "public"."students"."partner_program_track" IS 'Partner-school track: term (in-session) vs holiday (vacation) — distinct from enrollment_type and from Summer special.';
COMMENT ON COLUMN "public"."students"."rc_code" IS 'The Registration Code (RC) from the partner school access card used during registration.';
COMMENT ON COLUMN "public"."students"."registration_payment_at" IS 'Set when the public registration fee invoice is paid (Paystack webhook / verify).';
COMMENT ON COLUMN "public"."students"."registration_paystack_reference" IS 'Paystack transaction reference for the registration fee payment.';
COMMENT ON COLUMN "public"."whatsapp_conversations"."assigned_staff_id" IS 'Staff member (teacher/admin) assigned to handle this conversation';
COMMENT ON COLUMN "public"."whatsapp_conversations"."opted_in_at" IS 'Timestamp when user opted in (or first messaged us)';
COMMENT ON COLUMN "public"."whatsapp_conversations"."opted_out" IS 'User has opted out of WhatsApp notifications (replied STOP)';
COMMENT ON COLUMN "public"."whatsapp_conversations"."opted_out_at" IS 'Timestamp when user opted out';
COMMENT ON COLUMN "public"."whatsapp_conversations"."school_name" IS 'School name for external contacts not linked to portal_users';
COMMENT ON COLUMN "public"."whatsapp_messages"."metadata" IS 'Rich metadata for message status (API errors, rate limits, sender info)';
COMMENT ON FUNCTION "public"."academic_term_id_for_ts"(p_ts timestamp with time zone) IS 'Map a timestamp to academic_terms.id using Lagos-calendar date windows.';
COMMENT ON FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) IS 'RLS-safe course completion checker. Uses subqueries instead of JOINs to avoid course_curricula access violations. Supports courses with/without CBT exams and project requirements.';
COMMENT ON FUNCTION "public"."class_qa_path_offset"(p_school_id uuid, p_class_id uuid) IS 'Deterministic 0-107 offset so each (school, class) has its own 108-week rotation over the same QA topic spine.';
COMMENT ON FUNCTION "public"."get_admin_session_graded_counts"(term_uuid uuid) IS 'Exact admin graded assignment + CBT counts for one academic session.';
COMMENT ON FUNCTION "public"."get_at_risk_students"(p_school_id uuid, p_class_id uuid) IS 'At-risk signals: overdue assignments + attendance scoped to live academic year+term.';
COMMENT ON FUNCTION "public"."get_dashboard_activity"(user_role text, user_uuid uuid, activity_limit integer) IS 'Optimized activity feed with user enrichment to avoid N+1 queries';
COMMENT ON FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) IS 'Returns cards due for review using spaced repetition algorithm';
COMMENT ON FUNCTION "public"."get_school_dashboard_stats"(school_uuid uuid, school_name_param text, term_uuid uuid) IS 'School dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION "public"."get_student_dashboard_stats"(student_uuid uuid, term_uuid uuid) IS 'Student dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION "public"."get_teacher_dashboard_stats"(teacher_uuid uuid, term_uuid uuid) IS 'Teacher dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION "public"."handle_certificate_trigger"() IS 'Certificate auto-generation trigger. Maintains boundaries by avoiding RLS-protected table access. Handles lesson completion, CBT sessions, and assignment submissions.';
COMMENT ON FUNCTION "public"."live_academic_session_label"(p_now date) IS 'Calendar live session labels (year + term) matching app liveAcademicSession().';
COMMENT ON FUNCTION "public"."live_academic_term_id"(p_now date) IS 'Canonical live academic session (year + term). Date window → calendar → is_current.';
COMMENT ON FUNCTION "public"."qa_build_explicit_topic"(p_lane integer, p_week integer) IS 'Explicit QA week title for (lane, week_index) — one distinct label per week per lane, Nigeria tie-in.';
COMMENT ON FUNCTION "public"."require_portal_structure"() IS 'Hard structure gate: active students need school+class; active parent/teacher/school need school; admin exempt.';
COMMENT ON FUNCTION "public"."sync_academic_terms_is_current"(p_now date) IS 'Sets academic_terms.is_current to the live year+term session only.';
COMMENT ON FUNCTION "public"."update_flashcard_statistics"() IS 'SECURITY DEFINER function to update flashcard statistics. Bypasses student RLS restrictions on flashcard_card_statistics table.';
COMMENT ON TABLE "public"."account_deletion_requests" IS 'Auditable user requests for deletion of app accounts and associated personal data.';
COMMENT ON TABLE "public"."communication_case_events" IS 'Immutable cross-channel history for a communication case.';
COMMENT ON TABLE "public"."communication_cases" IS 'One accountable customer-service case spanning all supported communication channels.';
COMMENT ON TABLE "public"."communication_customer_identities" IS 'Verified aliases joining one customer across app, email, and phone channels.';
COMMENT ON TABLE "public"."communication_delivery_log" IS 'Canonical provider delivery and failure state across every outbound channel.';
COMMENT ON TABLE "public"."communication_template_versions" IS 'Immutable template revisions with test evidence.';
COMMENT ON TABLE "public"."communication_templates" IS 'Approved communication identities and current versions.';
COMMENT ON TABLE "public"."consent_submission_throttle" IS 'Service-role-only, short-lived consent rate-limit events. ip_hmac is a lowercase HMAC-SHA256 hex digest, never a raw IP address.';
COMMENT ON TABLE "public"."cron_job_health" IS 'Latest health state for each externally triggered application cron.';
COMMENT ON TABLE "public"."cron_run_history" IS 'Append-only application cron execution history.';
COMMENT ON TABLE "public"."enrollment_term_grades" IS 'Program enrollment letter grades keyed by academic session (year + term). enrollments.grade mirrors the live session.';
COMMENT ON TABLE "public"."feedback" IS 'User feedback collection system';
COMMENT ON TABLE "public"."flashcard_card_statistics" IS 'Aggregated statistics per card for teacher insights';
COMMENT ON TABLE "public"."flashcard_study_sessions" IS 'Tracks completed study sessions for analytics';
COMMENT ON TABLE "public"."form_lead_child_links" IS 'Canonical consent-lead child provenance. This table does not grant parent ownership; parent_student_links is authoritative for ownership.';
COMMENT ON TABLE "public"."marketing_events" IS 'Attribution and suppression evidence for consent-led campaigns.';
COMMENT ON TABLE "public"."notification_dead_letters" IS 'Durable failures requiring admin retry or resolution.';
COMMENT ON TABLE "public"."operations_duty_rota" IS 'Time-bounded primary and backup duty coverage. Staff count is discovered from portal_users.';
COMMENT ON TABLE "public"."operations_staff_settings" IS 'Availability and capacity for operators. Protected fields (is_primary_admin, notes) are server-managed only.';
COMMENT ON TABLE "public"."platform_syllabus_week_template" IS 'Canonical week-by-week topic spine for QA and syllabus alignment (catalog_version bumps when pattern changes).';
COMMENT ON TABLE "public"."safeguarding_incidents" IS 'Restricted human-owned workflow for safeguarding, privacy, fraud, and serious complaints.';
COMMENT ON TABLE "public"."school_performance_reports" IS 'Frozen, publishable school-wide performance and curriculum report snapshots with staff-curated narrative.';
COMMENT ON TABLE "public"."school_report_comments" IS 'Staff review comments on school performance report books (collaboration workflow).';
COMMENT ON TABLE "public"."school_report_events" IS 'Audit trail for publish, unlock, override, regenerate, and delete actions on school report books.';
COMMENT ON TABLE "public"."school_report_readiness_log" IS 'Scheduled readiness scan results and notification audit for draft report books.';
COMMENT ON TABLE "public"."school_report_revisions" IS 'Immutable published snapshots; working revisions track editable drafts without mutating published history.';
COMMENT ON TABLE "public"."special_program_pages" IS 'Public marketing + registration landings for special cohorts (summer school, bootcamps).';
COMMENT ON VIEW "public"."finance_ledger" IS 'Unified read-only ledger joining transactions, invoices & receipts with stream metadata for admin reconciliation.';

-- ============================================================================
-- END OF BASELINE SCHEMA
-- ============================================================================
