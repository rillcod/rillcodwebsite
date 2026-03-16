


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



CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.portal_users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM invoices WHERE invoice_number LIKE year_prefix || '%';
    NEW.invoice_number := year_prefix || LPAD(seq_val::text, 5, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    year_prefix TEXT;
    seq_val INT;
BEGIN
    year_prefix := 'RCP-' || TO_CHAR(NOW(), 'YYYY') || '-';
    SELECT count(*) + 1 INTO seq_val FROM receipts WHERE receipt_number LIKE year_prefix || '%';
    NEW.receipt_number := year_prefix || LPAD(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_receipt_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_at_risk_students"("p_school_id" "uuid" DEFAULT NULL::"uuid", "p_days_inactive" integer DEFAULT 7) RETURNS TABLE("student_id" "uuid", "full_name" "text", "last_login" timestamp with time zone, "avg_grade" numeric, "risk_level" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH student_metrics AS (
        SELECT 
            u.id as s_id,
            u.full_name as name,
            u.last_login as last_act,
            COALESCE(AVG(spr.overall_score), 0) as avg_score,
            COALESCE(AVG(spr.attendance_score), 0) as avg_attendance
        FROM 
            portal_users u
        LEFT JOIN 
            student_progress_reports spr ON u.id = spr.student_id
        WHERE 
            u.role = 'student'
            AND (p_school_id IS NULL OR u.school_id = p_school_id)
        GROUP BY 
            u.id, u.full_name, u.last_login
    )
    SELECT 
        s_id,
        name,
        last_act,
        avg_score,
        CASE 
            WHEN avg_score < 40 OR avg_attendance < 50 THEN 'High'
            WHEN avg_score < 60 OR avg_attendance < 70 THEN 'Medium'
            ELSE 'Low'
        END as risk_level
    FROM 
        student_metrics
    WHERE 
        avg_score < 60 
        OR avg_attendance < 70 
        OR last_act < (NOW() - (p_days_inactive || ' days')::interval);
END;
$$;


ALTER FUNCTION "public"."get_at_risk_students"("p_school_id" "uuid", "p_days_inactive" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_course_avg_assignment_grade"("p_course_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN (
        SELECT AVG(grade)
        FROM assignment_submissions
        WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$;


ALTER FUNCTION "public"."get_course_avg_assignment_grade"("p_course_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_course_avg_exam_score"("p_course_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN (
        SELECT AVG(percentage)
        FROM exam_attempts
        WHERE exam_id IN (SELECT id FROM exams WHERE course_id = p_course_id)
        AND status = 'graded'
    );
END;
$$;


ALTER FUNCTION "public"."get_course_avg_exam_score"("p_course_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.portal_users WHERE id = auth.uid();
  RETURN v_role;
END;
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_school_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT school_id FROM public.portal_users WHERE id = auth.uid());
END; $$;


ALTER FUNCTION "public"."get_my_school_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_timetable_ids_by_school"("p_school_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.timetables WHERE school_id = p_school_id;
$$;


ALTER FUNCTION "public"."get_timetable_ids_by_school"("p_school_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.portal_users (
    id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)   -- fallback: use email prefix as name
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- admin-created rows already have full data

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_download_count"("file_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE files
  SET download_count = download_count + 1
  WHERE id = file_id;
END;
$$;


ALTER FUNCTION "public"."increment_download_count"("file_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT role = 'admin' FROM public.portal_users WHERE id = auth.uid());
END; $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher', 'school') FROM public.portal_users WHERE id = auth.uid());
END; $$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_login"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE portal_users SET last_login = NOW() WHERE id = NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_live_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_live_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "school_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_id" "uuid",
    "target_audience" "text" DEFAULT 'all'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "announcements_target_audience_check" CHECK (("target_audience" = ANY (ARRAY['all'::"text", 'students'::"text", 'teachers'::"text", 'admins'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid",
    "user_id" "uuid",
    "submission_text" "text",
    "file_url" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "graded_by" "uuid",
    "grade" integer,
    "feedback" "text",
    "graded_at" timestamp with time zone,
    "status" "text" DEFAULT 'submitted'::"text",
    "student_id" "uuid",
    "portal_user_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "answers" "jsonb",
    CONSTRAINT "assignment_submissions_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'graded'::"text", 'late'::"text", 'missing'::"text"])))
);


ALTER TABLE "public"."assignment_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "instructions" "text",
    "due_date" timestamp with time zone,
    "max_points" integer DEFAULT 100,
    "assignment_type" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "class_id" "uuid",
    "questions" "jsonb",
    "school_id" "uuid",
    "school_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "assignments_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['homework'::"text", 'project'::"text", 'quiz'::"text", 'exam'::"text", 'presentation'::"text", 'coding'::"text"])))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'present'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "student_id" "uuid",
    "recorded_by" "uuid",
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text", 'excused'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "criteria" "jsonb",
    "points_value" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cbt_exams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "program_id" "uuid",
    "duration_minutes" integer NOT NULL,
    "total_questions" integer NOT NULL,
    "passing_score" integer DEFAULT 50,
    "is_active" boolean DEFAULT true,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "course_id" "uuid"
);


ALTER TABLE "public"."cbt_exams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cbt_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exam_id" "uuid",
    "question_text" "text" NOT NULL,
    "question_type" "text" DEFAULT 'multiple_choice'::"text",
    "options" "jsonb",
    "correct_answer" "text",
    "points" integer DEFAULT 1,
    "order_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "cbt_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'true_false'::"text", 'essay'::"text", 'fill_blank'::"text", 'coding_blocks'::"text"])))
);


ALTER TABLE "public"."cbt_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cbt_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exam_id" "uuid",
    "user_id" "uuid",
    "start_time" timestamp with time zone DEFAULT "now"(),
    "end_time" timestamp with time zone,
    "score" integer,
    "status" "text" DEFAULT 'in_progress'::"text",
    "answers" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "needs_grading" boolean DEFAULT false,
    "manual_scores" "jsonb" DEFAULT '{}'::"jsonb",
    "grading_notes" "text",
    CONSTRAINT "cbt_sessions_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'abandoned'::"text", 'passed'::"text", 'failed'::"text", 'pending_grading'::"text"])))
);


ALTER TABLE "public"."cbt_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "course_id" "uuid",
    "certificate_number" "text" NOT NULL,
    "verification_code" "text" NOT NULL,
    "issued_date" "date" NOT NULL,
    "pdf_url" "text",
    "template_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid",
    "session_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "topic" "text",
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    "location" "text",
    "meeting_url" "text",
    "is_online" boolean DEFAULT false,
    "status" "text" DEFAULT 'scheduled'::"text",
    CONSTRAINT "class_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."class_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "teacher_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "max_students" integer,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "schedule" "text",
    "current_students" integer DEFAULT 0,
    "school_id" "uuid",
    CONSTRAINT "classes_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "content_type" "text",
    "file_id" "uuid",
    "category" "text",
    "tags" "text"[],
    "subject" "text",
    "grade_level" "text",
    "license_type" "text",
    "attribution" "text",
    "version" integer DEFAULT 1,
    "usage_count" integer DEFAULT 0,
    "rating_average" numeric(3,2),
    "rating_count" integer DEFAULT 0,
    "is_approved" boolean DEFAULT false,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "content_library_content_type_check" CHECK (("content_type" = ANY (ARRAY['video'::"text", 'document'::"text", 'quiz'::"text", 'presentation'::"text", 'interactive'::"text"])))
);


ALTER TABLE "public"."content_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "uuid",
    "portal_user_id" "uuid",
    "rating" integer,
    "review" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "content_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."content_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text",
    "file_type" "text",
    "file_size" integer,
    "order_index" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "course_materials_file_type_check" CHECK (("file_type" = ANY (ARRAY['pdf'::"text", 'video'::"text", 'image'::"text", 'document'::"text", 'link'::"text"])))
);


ALTER TABLE "public"."course_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text",
    "duration_hours" integer,
    "order_index" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "teacher_id" "uuid",
    "school_id" "uuid",
    "school_name" "text"
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussion_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid",
    "reply_id" "uuid",
    "file_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."discussion_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussion_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid",
    "parent_reply_id" "uuid",
    "created_by" "uuid",
    "content" "text" NOT NULL,
    "upvotes" integer DEFAULT 0,
    "is_accepted_answer" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."discussion_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discussion_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_pinned" boolean DEFAULT false,
    "is_locked" boolean DEFAULT false,
    "is_resolved" boolean DEFAULT false,
    "upvotes" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."discussion_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "program_id" "uuid",
    "role" "text" NOT NULL,
    "enrollment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "completion_date" "date",
    "grade" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "progress_pct" integer DEFAULT 0,
    "last_activity_at" timestamp with time zone,
    CONSTRAINT "enrollments_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'teacher'::"text"]))),
    CONSTRAINT "enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'dropped'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exam_id" "uuid",
    "portal_user_id" "uuid",
    "attempt_number" integer DEFAULT 1,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "submitted_at" timestamp with time zone,
    "score" integer,
    "total_points" integer,
    "percentage" numeric(5,2),
    "status" "text",
    "answers" "jsonb",
    "tab_switches" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "exam_attempts_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'submitted'::"text", 'graded'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."exam_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exam_id" "uuid",
    "question_text" "text" NOT NULL,
    "question_type" "text",
    "points" integer DEFAULT 1,
    "order_index" integer,
    "options" "jsonb",
    "correct_answer" "jsonb",
    "explanation" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "exam_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'true_false'::"text", 'short_answer'::"text", 'essay'::"text", 'matching'::"text", 'fill_in_blank'::"text"])))
);


ALTER TABLE "public"."exam_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer,
    "total_points" integer DEFAULT 100,
    "passing_score" integer DEFAULT 70,
    "randomize_questions" boolean DEFAULT true,
    "randomize_options" boolean DEFAULT true,
    "max_attempts" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "uploaded_by" "uuid",
    "filename" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text",
    "storage_path" "text" NOT NULL,
    "storage_provider" "text",
    "public_url" "text",
    "thumbnail_url" "text",
    "is_virus_scanned" boolean DEFAULT false,
    "virus_scan_result" "text",
    "download_count" integer DEFAULT 0,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "files_storage_provider_check" CHECK (("storage_provider" = ANY (ARRAY['s3'::"text", 'cloudinary'::"text"])))
);


ALTER TABLE "public"."files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flagged_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "reporter_id" "uuid",
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "moderator_id" "uuid",
    "moderator_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "flagged_content_content_type_check" CHECK (("content_type" = ANY (ARRAY['topic'::"text", 'reply'::"text"]))),
    CONSTRAINT "flagged_content_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'dismissed'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."flagged_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "generated_by" "uuid",
    "report_name" "text" NOT NULL,
    "report_data" "jsonb",
    "file_url" "text",
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generated_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grade_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "portal_user_id" "uuid",
    "program_id" "uuid",
    "total_assignments" integer DEFAULT 0,
    "graded_assignments" integer DEFAULT 0,
    "average_score" numeric(5,2),
    "highest_score" numeric(5,2),
    "lowest_score" numeric(5,2),
    "letter_grade" "text",
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grade_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "school_id" "uuid",
    "portal_user_id" "uuid",
    "amount" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "due_date" timestamp with time zone,
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "payment_link" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "payment_transaction_id" "uuid"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leaderboards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "portal_user_id" "uuid",
    "points" integer DEFAULT 0,
    "rank" integer,
    "period_start" "date",
    "period_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leaderboards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "title" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "is_public" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lesson_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "objectives" "text",
    "activities" "text",
    "assessment_methods" "text",
    "staff_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "summary_notes" "text"
);


ALTER TABLE "public"."lesson_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "portal_user_id" "uuid",
    "status" "text" DEFAULT 'not_started'::"text",
    "progress_percentage" integer DEFAULT 0,
    "time_spent_minutes" integer DEFAULT 0,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lesson_progress_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "lesson_type" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "duration_minutes" integer,
    "session_date" timestamp with time zone,
    "video_url" "text",
    "content" "text",
    "order_index" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "content_layout" "jsonb" DEFAULT '[]'::"jsonb",
    "lesson_notes" "text",
    "school_id" "uuid",
    "school_name" "text",
    CONSTRAINT "lessons_lesson_type_check" CHECK (("lesson_type" = ANY (ARRAY['video'::"text", 'interactive'::"text", 'hands-on'::"text", 'workshop'::"text", 'coding'::"text", 'reading'::"text"]))),
    CONSTRAINT "lessons_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'scheduled'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "portal_user_id" "uuid",
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."live_session_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_breakout_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "portal_user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone,
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."live_session_breakout_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_breakout_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "max_participants" integer,
    "created_by" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "live_session_breakout_rooms_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."live_session_breakout_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "option_text" "text" NOT NULL,
    "order_index" integer,
    "is_correct" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."live_session_poll_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_poll_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "portal_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."live_session_poll_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_session_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "poll_type" "text" DEFAULT 'poll'::"text",
    "status" "text" DEFAULT 'draft'::"text",
    "allow_multiple" boolean DEFAULT false,
    "created_by" "uuid",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "live_session_polls_poll_type_check" CHECK (("poll_type" = ANY (ARRAY['poll'::"text", 'quiz'::"text"]))),
    CONSTRAINT "live_session_polls_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'live'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."live_session_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "host_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "program_id" "uuid",
    "session_url" "text",
    "platform" "text" DEFAULT 'zoom'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "recording_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "live_sessions_platform_check" CHECK (("platform" = ANY (ARRAY['zoom'::"text", 'google_meet'::"text", 'teams'::"text", 'discord'::"text", 'other'::"text"]))),
    CONSTRAINT "live_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."live_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "recipient_id" "uuid",
    "subject" "text",
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "email_enabled" boolean DEFAULT true,
    "sms_enabled" boolean DEFAULT false,
    "push_enabled" boolean DEFAULT true,
    "assignment_reminders" boolean DEFAULT true,
    "grade_notifications" boolean DEFAULT true,
    "announcement_notifications" boolean DEFAULT true,
    "discussion_replies" boolean DEFAULT true,
    "marketing_emails" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "subject" "text",
    "content" "text" NOT NULL,
    "variables" "jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notification_templates_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'push'::"text", 'sms'::"text", 'in_app'::"text"])))
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "action_url" "text",
    "notification_channel" "text",
    "sent_at" timestamp with time zone,
    "delivery_status" "text",
    "retry_count" integer DEFAULT 0,
    "external_id" "text",
    CONSTRAINT "notifications_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'bounced'::"text"]))),
    CONSTRAINT "notifications_notification_channel_check" CHECK (("notification_channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'in_app'::"text", 'push'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_type" "text" DEFAULT 'school'::"text" NOT NULL,
    "school_id" "uuid",
    "label" "text" NOT NULL,
    "bank_name" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_type" "text" DEFAULT 'savings'::"text" NOT NULL,
    "payment_note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "portal_user_id" "uuid",
    "course_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text",
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "transaction_reference" "text",
    "external_transaction_id" "text",
    "payment_gateway_response" "jsonb",
    "paid_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "refund_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "receipt_url" "text",
    "invoice_id" "uuid",
    CONSTRAINT "payment_transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['stripe'::"text", 'paystack'::"text", 'bank_transfer'::"text"]))),
    CONSTRAINT "payment_transactions_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "program_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_method" "text" DEFAULT 'cash'::"text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "transaction_reference" "text",
    "payment_date" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "student_id" "uuid",
    "transaction_id" "text",
    CONSTRAINT "payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'bank_transfer'::"text", 'card'::"text", 'online'::"text"]))),
    CONSTRAINT "payments_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "points" integer NOT NULL,
    "activity_type" "text" NOT NULL,
    "reference_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."point_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "phone" "text",
    "school_name" "text",
    "is_active" boolean DEFAULT true,
    "email_verified" boolean DEFAULT false,
    "profile_image_url" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "student_id" "uuid",
    "is_deleted" boolean DEFAULT false,
    "last_login" timestamp with time zone,
    "school_id" "uuid",
    "enrollment_type" "text",
    "reputation_score" integer DEFAULT 0,
    "section_class" "text",
    "current_module" "text",
    "date_of_birth" "date",
    "photo_url" "text",
    "created_by" "uuid",
    "is_direct_enrollment" boolean DEFAULT false,
    "avatar_url" "text",
    "class_id" "uuid",
    CONSTRAINT "portal_users_enrollment_type_check" CHECK (("enrollment_type" = ANY (ARRAY['school'::"text", 'bootcamp'::"text", 'online'::"text"]))),
    CONSTRAINT "portal_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'student'::"text", 'school'::"text", 'parent'::"text"])))
);


ALTER TABLE "public"."portal_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."portal_users"."is_direct_enrollment" IS 'True if the student registered directly (Bootcamp, Summer School) vs through a partner school.';



CREATE TABLE IF NOT EXISTS "public"."portfolio_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'Coding'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "project_url" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."portfolio_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_weeks" integer,
    "difficulty_level" "text",
    "price" numeric(10,2),
    "max_students" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "school_id" "uuid",
    CONSTRAINT "programs_difficulty_level_check" CHECK (("difficulty_level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"])))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prospective_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "parent_name" "text",
    "parent_phone" "text",
    "parent_email" "text",
    "grade" "text",
    "age" integer,
    "gender" "text",
    "school_id" "uuid",
    "school_name" "text",
    "course_interest" "text",
    "preferred_schedule" "text",
    "hear_about_us" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prospective_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "receipt_number" "text" NOT NULL,
    "transaction_id" "uuid",
    "student_id" "uuid",
    "school_id" "uuid",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text",
    "issued_at" timestamp with time zone DEFAULT "now"(),
    "pdf_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "teacher_id" "uuid",
    "org_name" "text" DEFAULT 'Rillcod Technologies'::"text",
    "org_tagline" "text" DEFAULT 'Excellence in Educational Technology'::"text",
    "org_address" "text" DEFAULT '26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City'::"text",
    "org_phone" "text" DEFAULT '08116600091'::"text",
    "org_email" "text" DEFAULT 'rillcod@gmail.com'::"text",
    "org_website" "text" DEFAULT 'www.rillcod.com'::"text",
    "logo_url" "text",
    "default_term" "text" DEFAULT 'Termly'::"text",
    "default_instructor" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "template_type" "text" DEFAULT 'student_progress'::"text",
    "query_template" "text",
    "parameters" "jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "report_templates_template_type_check" CHECK (("template_type" = ANY (ARRAY['student_progress'::"text", 'financial'::"text", 'attendance'::"text", 'performance'::"text"])))
);


ALTER TABLE "public"."report_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "state" "text",
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "student_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "school_type" "text",
    "lga" "text",
    "program_interest" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text",
    "is_active" boolean DEFAULT true,
    "is_deleted" boolean DEFAULT false,
    "enrollment_types" "text"[] DEFAULT ARRAY['school'::"text"],
    "rillcod_quota_percent" numeric DEFAULT 0,
    CONSTRAINT "schools_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


COMMENT ON COLUMN "public"."schools"."rillcod_quota_percent" IS 'Percentage of school fees that belongs to Rillcod for services rendered.';



CREATE TABLE IF NOT EXISTS "public"."student_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "program_id" "uuid",
    "enrollment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "completion_date" "date",
    "grade" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "student_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'dropped'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."student_enrollments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."student_performance_summary" AS
 SELECT "p"."id" AS "student_id",
    "p"."full_name",
    "p"."school_id",
    "count"(DISTINCT "e"."program_id") AS "enrolled_programs",
    COALESCE("avg"("cs"."score"), (0)::numeric) AS "avg_exam_score",
    COALESCE("avg"("asub"."grade"), (0)::numeric) AS "avg_assignment_grade",
    "count"(DISTINCT "lp"."lesson_id") FILTER (WHERE ("lp"."status" = 'completed'::"text")) AS "lessons_completed"
   FROM (((("public"."portal_users" "p"
     LEFT JOIN "public"."enrollments" "e" ON (("p"."id" = "e"."user_id")))
     LEFT JOIN "public"."cbt_sessions" "cs" ON ((("p"."id" = "cs"."user_id") AND ("cs"."status" = ANY (ARRAY['passed'::"text", 'failed'::"text", 'completed'::"text"])))))
     LEFT JOIN "public"."assignment_submissions" "asub" ON ((("p"."id" = "asub"."portal_user_id") AND ("asub"."status" = 'graded'::"text"))))
     LEFT JOIN "public"."lesson_progress" "lp" ON (("p"."id" = "lp"."portal_user_id")))
  WHERE ("p"."role" = 'student'::"text")
  GROUP BY "p"."id", "p"."full_name", "p"."school_id";


ALTER VIEW "public"."student_performance_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "portal_user_id" "uuid",
    "course_id" "uuid",
    "lessons_completed" integer DEFAULT 0,
    "total_lessons" integer DEFAULT 0,
    "assignments_completed" integer DEFAULT 0,
    "total_assignments" integer DEFAULT 0,
    "average_grade" numeric(5,2),
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_progress_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "teacher_id" "uuid",
    "school_id" "uuid",
    "course_id" "uuid",
    "student_name" "text",
    "school_name" "text",
    "section_class" "text",
    "course_name" "text",
    "report_date" "date" DEFAULT CURRENT_DATE,
    "report_term" "text" DEFAULT 'Termly'::"text",
    "report_period" "text",
    "instructor_name" "text",
    "current_module" "text",
    "next_module" "text",
    "learning_milestones" "text"[],
    "course_duration" "text",
    "theory_score" numeric(5,2) DEFAULT 0,
    "practical_score" numeric(5,2) DEFAULT 0,
    "attendance_score" numeric(5,2) DEFAULT 0,
    "overall_score" numeric(5,2) DEFAULT 0,
    "participation_grade" "text",
    "projects_grade" "text",
    "homework_grade" "text",
    "assignments_grade" "text",
    "overall_grade" "text",
    "key_strengths" "text",
    "areas_for_growth" "text",
    "instructor_assessment" "text",
    "has_certificate" boolean DEFAULT false,
    "certificate_text" "text",
    "course_completed" "text",
    "proficiency_level" "text",
    "verification_code" "text" DEFAULT "substring"(("gen_random_uuid"())::"text", 1, 8),
    "is_published" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "school_section" "text",
    "fee_label" "text",
    "fee_amount" "text",
    "fee_status" "text",
    "show_payment_notice" boolean DEFAULT false NOT NULL,
    "participation_score" numeric DEFAULT 0,
    "engagement_metrics" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."student_progress_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."student_progress_reports"."participation_score" IS 'Numerical score representing student activity and engagement.';



CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "age" integer,
    "email" "text",
    "phone" "text",
    "school" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "grade" "text",
    "gender" "text",
    "parent_name" "text",
    "course_interest" "text",
    "preferred_schedule" "text",
    "hear_about_us" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "is_deleted" boolean DEFAULT false,
    "full_name" "text",
    "date_of_birth" "date",
    "parent_email" "text",
    "parent_phone" "text",
    "school_name" "text",
    "current_class" "text",
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'Nigeria'::"text",
    "medical_conditions" "text",
    "allergies" "text",
    "previous_programming_experience" "text",
    "interests" "text",
    "goals" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "user_id" "uuid",
    "student_number" "text",
    "grade_level" "text",
    "avatar_url" "text",
    "enrollment_type" "text" DEFAULT 'school'::"text",
    "student_email" "text",
    "heard_about_us" "text",
    "parent_relationship" "text",
    "school_id" "uuid",
    "section" "text",
    "created_by" "uuid",
    CONSTRAINT "students_enrollment_type_check" CHECK (("enrollment_type" = ANY (ARRAY['school'::"text", 'bootcamp'::"text", 'online'::"text"]))),
    CONSTRAINT "students_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "course_id" "uuid",
    "subscription_plan" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text",
    "billing_cycle" "text",
    "status" "text" DEFAULT 'active'::"text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "external_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text", 'expired'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text",
    "description" "text",
    "category" "text" DEFAULT 'general'::"text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "is_primary" boolean DEFAULT false,
    "notes" "text"
);


ALTER TABLE "public"."teacher_schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "subjects" "text"[] DEFAULT '{}'::"text"[],
    "experience_years" integer DEFAULT 0,
    "education" "text",
    "bio" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timetable_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timetable_id" "uuid" NOT NULL,
    "day_of_week" "text" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "teacher_id" "uuid",
    "teacher_name" "text",
    "course_id" "uuid",
    "room" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."timetable_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timetables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "title" "text" NOT NULL,
    "section" "text",
    "academic_year" "text",
    "term" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."timetables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."topic_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "badge_id" "uuid",
    "earned_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb"
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portal_user_id" "uuid",
    "total_points" integer DEFAULT 0,
    "current_streak" integer DEFAULT 0,
    "longest_streak" integer DEFAULT 0,
    "last_activity_date" "date",
    "achievement_level" "text" DEFAULT 'Bronze'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_points_achievement_level_check" CHECK (("achievement_level" = ANY (ARRAY['Bronze'::"text", 'Silver'::"text", 'Gold'::"text", 'Platinum'::"text"])))
);


ALTER TABLE "public"."user_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "bio" "text",
    "date_of_birth" "date",
    "gender" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'Nigeria'::"text",
    "postal_code" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "emergency_contact_relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_id_user_id_key" UNIQUE ("session_id", "user_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cbt_questions"
    ADD CONSTRAINT "cbt_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_certificate_number_key" UNIQUE ("certificate_number");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_verification_code_key" UNIQUE ("verification_code");



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_content_id_portal_user_id_key" UNIQUE ("content_id", "portal_user_id");



ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_program_id_role_key" UNIQUE ("user_id", "program_id", "role");



ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_lesson_id_unique" UNIQUE ("lesson_id");



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_portal_user_id_key" UNIQUE ("lesson_id", "portal_user_id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_session_id_portal_user_id_key" UNIQUE ("session_id", "portal_user_id");



ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_poll_options"
    ADD CONSTRAINT "live_session_poll_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_portal_user_id_key" UNIQUE ("portal_user_id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_name_type_key" UNIQUE ("name", "type");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_transaction_reference_key" UNIQUE ("transaction_reference");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospective_students"
    ADD CONSTRAINT "prospective_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_student_id_program_id_key" UNIQUE ("student_id", "program_id");



ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_verification_code_key" UNIQUE ("verification_code");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_teacher_id_school_id_key" UNIQUE ("teacher_id", "school_id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_topic_id_user_id_key" UNIQUE ("topic_id", "user_id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "uq_submissions_assignment_portal_user" UNIQUE ("assignment_id", "portal_user_id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_portal_user_id_badge_id_key" UNIQUE ("portal_user_id", "badge_id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_portal_user_id_key" UNIQUE ("portal_user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_announcements_active" ON "public"."announcements" USING "btree" ("is_active");



CREATE INDEX "idx_announcements_audience" ON "public"."announcements" USING "btree" ("target_audience");



CREATE INDEX "idx_assignments_course" ON "public"."assignments" USING "btree" ("course_id");



CREATE INDEX "idx_assignments_created_by" ON "public"."assignments" USING "btree" ("created_by");



CREATE INDEX "idx_assignments_due_date" ON "public"."assignments" USING "btree" ("due_date");



CREATE INDEX "idx_assignments_school" ON "public"."assignments" USING "btree" ("school_id");



CREATE INDEX "idx_attendance_session" ON "public"."attendance" USING "btree" ("session_id");



CREATE INDEX "idx_attendance_user" ON "public"."attendance" USING "btree" ("user_id");



CREATE INDEX "idx_audit_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_audit_user" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_breakout_participants_room" ON "public"."live_session_breakout_participants" USING "btree" ("room_id");



CREATE INDEX "idx_breakout_participants_user" ON "public"."live_session_breakout_participants" USING "btree" ("portal_user_id");



CREATE INDEX "idx_breakout_rooms_session" ON "public"."live_session_breakout_rooms" USING "btree" ("session_id");



CREATE INDEX "idx_cbt_exams_active" ON "public"."cbt_exams" USING "btree" ("is_active");



CREATE INDEX "idx_cbt_exams_program" ON "public"."cbt_exams" USING "btree" ("program_id");



CREATE INDEX "idx_cbt_questions_exam" ON "public"."cbt_questions" USING "btree" ("exam_id");



CREATE INDEX "idx_cbt_sessions_exam" ON "public"."cbt_sessions" USING "btree" ("exam_id");



CREATE INDEX "idx_cbt_sessions_needs_grading" ON "public"."cbt_sessions" USING "btree" ("needs_grading") WHERE ("needs_grading" = true);



CREATE INDEX "idx_cbt_sessions_user" ON "public"."cbt_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_classes_program" ON "public"."classes" USING "btree" ("program_id");



CREATE INDEX "idx_classes_school" ON "public"."classes" USING "btree" ("school_id");



CREATE INDEX "idx_classes_status" ON "public"."classes" USING "btree" ("status");



CREATE INDEX "idx_classes_teacher" ON "public"."classes" USING "btree" ("teacher_id");



CREATE INDEX "idx_courses_active" ON "public"."courses" USING "btree" ("is_active");



CREATE INDEX "idx_courses_program" ON "public"."courses" USING "btree" ("program_id");



CREATE INDEX "idx_courses_school" ON "public"."courses" USING "btree" ("school_id");



CREATE INDEX "idx_courses_teacher" ON "public"."courses" USING "btree" ("teacher_id");



CREATE INDEX "idx_enrollments_program" ON "public"."enrollments" USING "btree" ("program_id");



CREATE INDEX "idx_enrollments_status" ON "public"."enrollments" USING "btree" ("status");



CREATE INDEX "idx_enrollments_user" ON "public"."enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_flagged_content_type_id" ON "public"."flagged_content" USING "btree" ("content_type", "content_id");



CREATE INDEX "idx_flagged_status" ON "public"."flagged_content" USING "btree" ("status");



CREATE INDEX "idx_grade_reports_portal_user" ON "public"."grade_reports" USING "btree" ("portal_user_id");



CREATE INDEX "idx_grade_reports_student" ON "public"."grade_reports" USING "btree" ("student_id");



CREATE INDEX "idx_invoices_payment_tx" ON "public"."invoices" USING "btree" ("payment_transaction_id");



CREATE INDEX "idx_lessons_course" ON "public"."lessons" USING "btree" ("course_id");



CREATE INDEX "idx_lessons_created_by" ON "public"."lessons" USING "btree" ("created_by");



CREATE INDEX "idx_lessons_school" ON "public"."lessons" USING "btree" ("school_id");



CREATE INDEX "idx_lessons_status" ON "public"."lessons" USING "btree" ("status");



CREATE INDEX "idx_live_sessions_host" ON "public"."live_sessions" USING "btree" ("host_id");



CREATE INDEX "idx_live_sessions_scheduled" ON "public"."live_sessions" USING "btree" ("scheduled_at");



CREATE INDEX "idx_live_sessions_school" ON "public"."live_sessions" USING "btree" ("school_id");



CREATE INDEX "idx_messages_read" ON "public"."messages" USING "btree" ("is_read");



CREATE INDEX "idx_messages_recipient" ON "public"."messages" USING "btree" ("recipient_id");



CREATE INDEX "idx_messages_recipient_unread" ON "public"."messages" USING "btree" ("recipient_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("is_read");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_payment_accounts_school" ON "public"."payment_accounts" USING "btree" ("school_id");



CREATE INDEX "idx_payment_accounts_type" ON "public"."payment_accounts" USING "btree" ("owner_type");



CREATE INDEX "idx_payments_program" ON "public"."payments" USING "btree" ("program_id");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("payment_status");



CREATE INDEX "idx_payments_user" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_poll_options_poll" ON "public"."live_session_poll_options" USING "btree" ("poll_id");



CREATE INDEX "idx_poll_responses_poll" ON "public"."live_session_poll_responses" USING "btree" ("poll_id");



CREATE INDEX "idx_poll_responses_user" ON "public"."live_session_poll_responses" USING "btree" ("portal_user_id");



CREATE INDEX "idx_polls_session" ON "public"."live_session_polls" USING "btree" ("session_id");



CREATE INDEX "idx_portal_users_active" ON "public"."portal_users" USING "btree" ("is_active");



CREATE INDEX "idx_portal_users_email" ON "public"."portal_users" USING "btree" ("email");



CREATE INDEX "idx_portal_users_role" ON "public"."portal_users" USING "btree" ("role");



CREATE INDEX "idx_portal_users_school_id" ON "public"."portal_users" USING "btree" ("school_id");

CREATE INDEX "idx_portal_users_class_id" ON "public"."portal_users" USING "btree" ("class_id");



CREATE INDEX "idx_portfolio_projects_user" ON "public"."portfolio_projects" USING "btree" ("user_id");



CREATE INDEX "idx_programs_active" ON "public"."programs" USING "btree" ("is_active");



CREATE INDEX "idx_programs_difficulty" ON "public"."programs" USING "btree" ("difficulty_level");



CREATE INDEX "idx_progress_course" ON "public"."student_progress" USING "btree" ("course_id");



CREATE INDEX "idx_progress_portal_user" ON "public"."student_progress" USING "btree" ("portal_user_id");



CREATE INDEX "idx_progress_student" ON "public"."student_progress" USING "btree" ("student_id");



CREATE INDEX "idx_ps_email" ON "public"."prospective_students" USING "btree" ("email");



CREATE INDEX "idx_ps_status" ON "public"."prospective_students" USING "btree" ("status");



CREATE INDEX "idx_sessions_class" ON "public"."class_sessions" USING "btree" ("class_id");



CREATE INDEX "idx_sessions_date" ON "public"."class_sessions" USING "btree" ("session_date");



CREATE INDEX "idx_settings_category" ON "public"."system_settings" USING "btree" ("category");



CREATE INDEX "idx_settings_key" ON "public"."system_settings" USING "btree" ("setting_key");



CREATE INDEX "idx_spr_school" ON "public"."student_progress_reports" USING "btree" ("school_id");



CREATE INDEX "idx_spr_school_id" ON "public"."student_progress_reports" USING "btree" ("school_id");



CREATE INDEX "idx_spr_student" ON "public"."student_progress_reports" USING "btree" ("student_id");



CREATE INDEX "idx_spr_student_id" ON "public"."student_progress_reports" USING "btree" ("student_id");



CREATE INDEX "idx_spr_teacher" ON "public"."student_progress_reports" USING "btree" ("teacher_id");



CREATE INDEX "idx_spr_teacher_id" ON "public"."student_progress_reports" USING "btree" ("teacher_id");



CREATE INDEX "idx_student_enrollments_program" ON "public"."student_enrollments" USING "btree" ("program_id");



CREATE INDEX "idx_student_enrollments_status" ON "public"."student_enrollments" USING "btree" ("status");



CREATE INDEX "idx_student_enrollments_student" ON "public"."student_enrollments" USING "btree" ("student_id");



CREATE INDEX "idx_students_approved_by" ON "public"."students" USING "btree" ("approved_by");



CREATE INDEX "idx_students_enrollment_type" ON "public"."students" USING "btree" ("enrollment_type");



CREATE INDEX "idx_students_parent_email" ON "public"."students" USING "btree" ("parent_email");



CREATE INDEX "idx_students_school_id" ON "public"."students" USING "btree" ("school_id");



CREATE INDEX "idx_students_status" ON "public"."students" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_students_student_number" ON "public"."students" USING "btree" ("student_number") WHERE ("student_number" IS NOT NULL);



CREATE INDEX "idx_students_user_id" ON "public"."students" USING "btree" ("user_id");



CREATE INDEX "idx_submissions_assignment" ON "public"."assignment_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_submissions_portal_user" ON "public"."assignment_submissions" USING "btree" ("portal_user_id");



CREATE INDEX "idx_submissions_status" ON "public"."assignment_submissions" USING "btree" ("status");



CREATE INDEX "idx_submissions_student_id" ON "public"."assignment_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_submissions_user" ON "public"."assignment_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_teacher_schools_school" ON "public"."teacher_schools" USING "btree" ("school_id");



CREATE INDEX "idx_teacher_schools_teacher" ON "public"."teacher_schools" USING "btree" ("teacher_id");



CREATE INDEX "idx_timetable_slots_teacher" ON "public"."timetable_slots" USING "btree" ("teacher_id");



CREATE INDEX "idx_timetable_slots_timetable" ON "public"."timetable_slots" USING "btree" ("timetable_id");



CREATE INDEX "idx_timetables_school" ON "public"."timetables" USING "btree" ("school_id");



CREATE INDEX "idx_topic_subs_topic" ON "public"."topic_subscriptions" USING "btree" ("topic_id");



CREATE INDEX "idx_topic_subs_user" ON "public"."topic_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_user" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "set_report_settings_updated_at" BEFORE UPDATE ON "public"."report_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_student_progress_reports_updated_at" BEFORE UPDATE ON "public"."student_progress_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_generate_invoice_number" BEFORE INSERT ON "public"."invoices" FOR EACH ROW WHEN (("new"."invoice_number" IS NULL)) EXECUTE FUNCTION "public"."generate_invoice_number"();



CREATE OR REPLACE TRIGGER "trg_generate_receipt_number" BEFORE INSERT ON "public"."receipts" FOR EACH ROW WHEN (("new"."receipt_number" IS NULL)) EXECUTE FUNCTION "public"."generate_receipt_number"();



CREATE OR REPLACE TRIGGER "trg_live_sessions_updated_at" BEFORE UPDATE ON "public"."live_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_live_sessions_updated_at"();



CREATE OR REPLACE TRIGGER "update_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assignments_updated_at" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_attendance_updated_at" BEFORE UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cbt_exams_updated_at" BEFORE UPDATE ON "public"."cbt_exams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cbt_questions_updated_at" BEFORE UPDATE ON "public"."cbt_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cbt_sessions_updated_at" BEFORE UPDATE ON "public"."cbt_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_content_library_updated_at" BEFORE UPDATE ON "public"."content_library" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_discussion_replies_updated_at" BEFORE UPDATE ON "public"."discussion_replies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_discussion_topics_updated_at" BEFORE UPDATE ON "public"."discussion_topics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_enrollments_updated_at" BEFORE UPDATE ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_files_updated_at" BEFORE UPDATE ON "public"."files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lesson_progress_updated_at" BEFORE UPDATE ON "public"."lesson_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_live_session_breakout_rooms_updated_at" BEFORE UPDATE ON "public"."live_session_breakout_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_live_session_polls_updated_at" BEFORE UPDATE ON "public"."live_session_polls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_materials_updated_at" BEFORE UPDATE ON "public"."course_materials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_transactions_updated_at" BEFORE UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_portal_users_updated_at" BEFORE UPDATE ON "public"."portal_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_programs_updated_at" BEFORE UPDATE ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_progress_updated_at" BEFORE UPDATE ON "public"."student_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_report_templates_updated_at" BEFORE UPDATE ON "public"."report_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_schools_updated_at" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sessions_updated_at" BEFORE UPDATE ON "public"."class_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_student_enrollments_updated_at" BEFORE UPDATE ON "public"."student_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_students_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_submissions_updated_at" BEFORE UPDATE ON "public"."assignment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teachers_updated_at" BEFORE UPDATE ON "public"."teachers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cbt_exams"
    ADD CONSTRAINT "cbt_exams_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cbt_questions"
    ADD CONSTRAINT "cbt_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."cbt_exams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."cbt_exams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cbt_sessions"
    ADD CONSTRAINT "cbt_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id");



ALTER TABLE ONLY "public"."content_library"
    ADD CONSTRAINT "content_library_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content_library"("id");



ALTER TABLE ONLY "public"."content_ratings"
    ADD CONSTRAINT "content_ratings_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."course_materials"
    ADD CONSTRAINT "course_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id");



ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "public"."discussion_replies"("id");



ALTER TABLE ONLY "public"."discussion_attachments"
    ADD CONSTRAINT "discussion_attachments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."discussion_topics"("id");



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_parent_reply_id_fkey" FOREIGN KEY ("parent_reply_id") REFERENCES "public"."discussion_replies"("id");



ALTER TABLE ONLY "public"."discussion_replies"
    ADD CONSTRAINT "discussion_replies_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."discussion_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."discussion_topics"
    ADD CONSTRAINT "discussion_topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id");



ALTER TABLE ONLY "public"."exam_attempts"
    ADD CONSTRAINT "exam_attempts_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."exam_questions"
    ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."exams"
    ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."flagged_content"
    ADD CONSTRAINT "flagged_content_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id");



ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_attendance"
    ADD CONSTRAINT "live_session_attendance_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."live_session_breakout_participants"
    ADD CONSTRAINT "live_session_breakout_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."live_session_breakout_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_breakout_rooms"
    ADD CONSTRAINT "live_session_breakout_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."live_session_poll_options"
    ADD CONSTRAINT "live_session_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."live_session_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."live_session_poll_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."live_session_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_poll_responses"
    ADD CONSTRAINT "live_session_poll_responses_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."live_session_polls"
    ADD CONSTRAINT "live_session_polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."prospective_students"
    ADD CONSTRAINT "prospective_students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_settings"
    ADD CONSTRAINT "report_settings_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_progress_reports"
    ADD CONSTRAINT "student_progress_reports_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_schools"
    ADD CONSTRAINT "teacher_schools_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."portal_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetables"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."timetables"
    ADD CONSTRAINT "timetables_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."discussion_topics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_subscriptions"
    ADD CONSTRAINT "topic_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."user_points"
    ADD CONSTRAINT "user_points_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can do everything on invoices" ON "public"."invoices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage CBT" ON "public"."cbt_exams" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage CBT questions" ON "public"."cbt_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all profiles" ON "public"."user_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage announcements" ON "public"."announcements" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage assignments" ON "public"."assignments" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage attendance" ON "public"."attendance" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage classes" ON "public"."classes" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage courses" ON "public"."courses" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage enrollments" ON "public"."enrollments" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage generated reports" ON "public"."generated_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage materials" ON "public"."course_materials" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage messages" ON "public"."messages" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage notifications" ON "public"."notifications" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage payments" ON "public"."payments" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage programs" ON "public"."programs" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage reports" ON "public"."report_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage schools" ON "public"."schools" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage settings" ON "public"."system_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage student enrollments" ON "public"."student_enrollments" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage students" ON "public"."students" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage teachers" ON "public"."teachers" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage templates" ON "public"."notification_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all logs" ON "public"."activity_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all messages" ON "public"."messages" USING ("public"."is_admin"());



CREATE POLICY "Admins can view all receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view audit logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "All authenticated can read report settings" ON "public"."report_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "All users can view announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow authenticated read" ON "public"."prospective_students" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated update" ON "public"."prospective_students" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow public insert" ON "public"."prospective_students" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone enrolled can view topics" ON "public"."discussion_topics" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."enrollments" "e"
     JOIN "public"."courses" "c" ON (("c"."program_id" = "e"."program_id")))
  WHERE (("c"."id" = "discussion_topics"."course_id") AND ("e"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Authenticated users can read active templates" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Authenticated users can view active CBT exams" ON "public"."cbt_exams" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND (("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))))));



CREATE POLICY "Authenticated users can view materials" ON "public"."course_materials" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Everyone can view badges" ON "public"."badges" FOR SELECT USING (true);



CREATE POLICY "Everyone can view discussions" ON "public"."discussion_topics" FOR SELECT USING (true);



CREATE POLICY "Everyone can view leaderboards" ON "public"."leaderboards" FOR SELECT USING (true);



CREATE POLICY "Everyone can view replies" ON "public"."discussion_replies" FOR SELECT USING (true);



CREATE POLICY "Exams are viewable by enrolled students or school staff" ON "public"."exams" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."enrollments" "e"
     JOIN "public"."courses" "c" ON (("c"."program_id" = "e"."program_id")))
  WHERE (("c"."id" = "exams"."course_id") AND ("e"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Files are viewable within the same school" ON "public"."files" FOR SELECT USING ((("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text"))))));



CREATE POLICY "Provide access to replies" ON "public"."discussion_replies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."discussion_topics" "dt"
  WHERE ("dt"."id" = "discussion_replies"."topic_id"))));



CREATE POLICY "Public can insert prospective students" ON "public"."prospective_students" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can insert schools" ON "public"."schools" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can insert students" ON "public"."students" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can verify via code" ON "public"."certificates" FOR SELECT USING (true);



CREATE POLICY "Public can view announcements" ON "public"."announcements" FOR SELECT USING (true);



CREATE POLICY "Public can view classes" ON "public"."classes" FOR SELECT USING (true);



CREATE POLICY "Public can view courses" ON "public"."courses" FOR SELECT USING (true);



CREATE POLICY "Public can view programs" ON "public"."programs" FOR SELECT USING (true);



CREATE POLICY "Public can view public settings" ON "public"."system_settings" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Public can view schools" ON "public"."schools" FOR SELECT USING (true);



CREATE POLICY "Public can view teachers" ON "public"."teachers" FOR SELECT USING (true);



CREATE POLICY "Public read for report settings" ON "public"."report_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Recipients can mark read" ON "public"."messages" FOR UPDATE USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Recipients can update read status" ON "public"."messages" FOR UPDATE USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Schools can manage their own invoices" ON "public"."invoices" TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"()))));



CREATE POLICY "Schools can view their own receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"()))));



CREATE POLICY "Schools can view their students" ON "public"."students" FOR SELECT USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'school'::"text")))));



CREATE POLICY "Schools view own student reports" ON "public"."student_progress_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."portal_users" "manager"
     LEFT JOIN "public"."portal_users" "student" ON (("student"."id" = "student_progress_reports"."student_id")))
  WHERE (("manager"."id" = "auth"."uid"()) AND ("manager"."role" = 'school'::"text") AND (("student_progress_reports"."school_id" = "manager"."school_id") OR ("student_progress_reports"."school_name" = "manager"."school_name") OR ("student"."school_id" = "manager"."school_id") OR ("student"."school_name" = "manager"."school_name"))))));



CREATE POLICY "Staff can manage CBT sessions" ON "public"."cbt_sessions" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage all reports" ON "public"."student_progress_reports" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND (("portal_users"."role" = 'admin'::"text") OR ("portal_users"."role" = 'teacher'::"text"))))) OR (( SELECT "portal_users"."role"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"())) = 'admin'::"text")));



CREATE POLICY "Staff can manage announcements" ON "public"."announcements" USING ("public"."is_staff"());



CREATE POLICY "Staff can manage assignments" ON "public"."assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff can manage class sessions" ON "public"."class_sessions" TO "authenticated" USING ("public"."is_staff"());



CREATE POLICY "Staff can manage classes" ON "public"."classes" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage content library" ON "public"."content_library" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage enrollments" ON "public"."enrollments" TO "authenticated" USING ("public"."is_staff"());



CREATE POLICY "Staff can manage exams" ON "public"."cbt_exams" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage files" ON "public"."files" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage lessons" ON "public"."lessons" USING ("public"."is_staff"());



CREATE POLICY "Staff can manage prospective students" ON "public"."prospective_students" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff can manage questions" ON "public"."cbt_questions" TO "authenticated" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage their own report settings" ON "public"."report_settings" TO "authenticated" USING ((("auth"."uid"() = "teacher_id") OR (( SELECT "portal_users"."role"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"())) = 'admin'::"text")));



CREATE POLICY "Staff can view CBT questions" ON "public"."cbt_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff can view all CBT sessions" ON "public"."cbt_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff can view all flags" ON "public"."flagged_content" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff manage breakout rooms" ON "public"."live_session_breakout_rooms" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff manage poll options" ON "public"."live_session_poll_options" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff manage polls" ON "public"."live_session_polls" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Staff manage students legacy" ON "public"."students" TO "authenticated" USING (("public"."is_staff"() OR ("auth"."uid"() = "created_by")));



CREATE POLICY "Students can view active lessons" ON "public"."lessons" FOR SELECT USING ((("status" = 'active'::"text") OR "public"."is_staff"()));



CREATE POLICY "Students can view assignments" ON "public"."assignments" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Students can view own attendance" ON "public"."attendance" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Students can view own enrollments" ON "public"."enrollments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own published reports" ON "public"."student_progress_reports" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "student_id") AND ("is_published" = true)));



CREATE POLICY "Students can view their own receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students start CBT sessions" ON "public"."cbt_sessions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Students update own CBT sessions" ON "public"."cbt_sessions" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "Students view own CBT sessions" ON "public"."cbt_sessions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "Students view own published reports" ON "public"."student_progress_reports" FOR SELECT USING ((("student_id" = "auth"."uid"()) AND ("is_published" = true)));



CREATE POLICY "Teachers can manage CBT exams" ON "public"."cbt_exams" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers can manage CBT questions" ON "public"."cbt_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers can manage assignments" ON "public"."assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers can manage attendance" ON "public"."attendance" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers can manage classes" ON "public"."classes" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers can update their own profile" ON "public"."teachers" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Teachers can view student enrollments" ON "public"."student_enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "Teachers manage own report settings" ON "public"."report_settings" USING ((("teacher_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text"))))));



CREATE POLICY "Teachers manage progress reports" ON "public"."student_progress_reports" USING ((("teacher_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text"))))));



CREATE POLICY "Teachers view school reports" ON "public"."student_progress_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."portal_users" "teacher"
     LEFT JOIN "public"."teacher_schools" "ts" ON (("ts"."teacher_id" = "teacher"."id")))
     LEFT JOIN "public"."portal_users" "student" ON (("student"."id" = "student_progress_reports"."student_id")))
  WHERE (("teacher"."id" = "auth"."uid"()) AND ("teacher"."role" = 'teacher'::"text") AND (("student_progress_reports"."school_id" = "ts"."school_id") OR ("student"."school_id" = "ts"."school_id") OR ("student_progress_reports"."teacher_id" = "teacher"."id"))))));



CREATE POLICY "Users can create discussions" ON "public"."discussion_topics" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create replies" ON "public"."discussion_replies" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can flag content" ON "public"."flagged_content" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert and delete own files" ON "public"."files" USING ((("uploaded_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can insert content" ON "public"."content_library" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "created_by") OR "public"."is_staff"()));



CREATE POLICY "Users can insert files" ON "public"."files" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "uploaded_by") OR "public"."is_staff"()));



CREATE POLICY "Users can insert their own exam attempts" ON "public"."exam_attempts" FOR INSERT WITH CHECK (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own ratings" ON "public"."content_ratings" TO "authenticated" USING ((("portal_user_id" = "auth"."uid"()) OR "public"."is_staff"())) WITH CHECK (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own replies" ON "public"."discussion_replies" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))));



CREATE POLICY "Users can manage own topics" ON "public"."discussion_topics" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))));



CREATE POLICY "Users can manage their own subscriptions" ON "public"."topic_subscriptions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages" ON "public"."messages" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "Users can update own messages (read status)" ON "public"."messages" FOR UPDATE USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Users can update their notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own progress" ON "public"."lesson_progress" USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view content" ON "public"."content_library" FOR SELECT TO "authenticated" USING ((("is_approved" = true) OR "public"."is_staff"() OR ("auth"."uid"() = "created_by")));



CREATE POLICY "Users can view files" ON "public"."files" FOR SELECT TO "authenticated" USING ((("school_id" IS NULL) OR ("school_id" = ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"()))) OR ("uploaded_by" = "auth"."uid"()) OR "public"."is_staff"()));



CREATE POLICY "Users can view own messages" ON "public"."messages" FOR SELECT USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"())));



CREATE POLICY "Users can view their enrollments" ON "public"."enrollments" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their messages" ON "public"."messages" FOR SELECT USING ((("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"())));



CREATE POLICY "Users can view their notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own badges" ON "public"."user_badges" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own certificates" ON "public"."certificates" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own exam attempts" ON "public"."exam_attempts" FOR SELECT USING ((("portal_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])))))));



CREATE POLICY "Users can view their own logs" ON "public"."activity_logs" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own points" ON "public"."user_points" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own progress" ON "public"."lesson_progress" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own subscriptions" ON "public"."topic_subscriptions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own transactions" ON "public"."payment_transactions" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their payments" ON "public"."payments" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users respond to polls" ON "public"."live_session_poll_responses" FOR INSERT WITH CHECK (("portal_user_id" = "auth"."uid"()));



CREATE POLICY "Users view own poll responses" ON "public"."live_session_poll_responses" FOR SELECT USING (("portal_user_id" = "auth"."uid"()));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_all_payment_accounts" ON "public"."payment_accounts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "admin_all_timetable_slots" ON "public"."timetable_slots" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "admin_all_timetables" ON "public"."timetables" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cbt_exams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cbt_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cbt_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certificates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussion_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussion_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discussion_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flagged_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grade_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grade_reports_select" ON "public"."grade_reports" FOR SELECT USING (true);



CREATE POLICY "grade_reports_write_staff" ON "public"."grade_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leaderboards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lessons_select_all" ON "public"."lessons" FOR SELECT USING (true);



CREATE POLICY "lessons_write_staff" ON "public"."lessons" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



ALTER TABLE "public"."live_session_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_breakout_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_breakout_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_poll_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_poll_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_sessions_delete" ON "public"."live_sessions" FOR DELETE USING ((("host_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text"))))));



CREATE POLICY "live_sessions_insert" ON "public"."live_sessions" FOR INSERT WITH CHECK ((("host_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))));



CREATE POLICY "live_sessions_select" ON "public"."live_sessions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "live_sessions_update" ON "public"."live_sessions" FOR UPDATE USING ((("host_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text"))))));



CREATE POLICY "manage_attendance_staff_and_admin" ON "public"."attendance" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."class_sessions" "s"
     JOIN "public"."classes" "c" ON (("c"."id" = "s"."class_id")))
  WHERE (("s"."id" = "attendance"."session_id") AND (("c"."teacher_id" = "auth"."uid"()) OR ("c"."school_id" = "public"."get_my_school_id"())))))));



CREATE POLICY "manage_sessions_staff_and_admin" ON "public"."class_sessions" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id" = "class_sessions"."class_id") AND (("c"."teacher_id" = "auth"."uid"()) OR ("c"."school_id" = "public"."get_my_school_id"())))))));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_insert" ON "public"."notifications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "notifications_own" ON "public"."notifications" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portal_users_admin_delete" ON "public"."portal_users" FOR DELETE USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "portal_users_admin_insert" ON "public"."portal_users" FOR INSERT WITH CHECK (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "portal_users_admin_update" ON "public"."portal_users" FOR UPDATE USING (("public"."get_my_role"() = 'admin'::"text"));



CREATE POLICY "portal_users_self_select" ON "public"."portal_users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "portal_users_self_update" ON "public"."portal_users" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "portal_users_staff_select" ON "public"."portal_users" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])));



CREATE POLICY "portal_users_staff_update_limited" ON "public"."portal_users" FOR UPDATE USING (("public"."is_admin"() OR ("public"."is_staff"() AND ("school_id" = "public"."get_my_school_id"())))) WITH CHECK (("public"."is_admin"() OR ("public"."is_staff"() AND ("school_id" = "public"."get_my_school_id"()))));



CREATE POLICY "portfolio_own_delete" ON "public"."portfolio_projects" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "portfolio_own_insert" ON "public"."portfolio_projects" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "portfolio_own_select" ON "public"."portfolio_projects" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "portfolio_own_update" ON "public"."portfolio_projects" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."portfolio_projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portfolio_staff_select" ON "public"."portfolio_projects" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"]))))));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_select_all" ON "public"."student_progress" FOR SELECT USING (true);



CREATE POLICY "progress_write_staff" ON "public"."student_progress" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



ALTER TABLE "public"."prospective_students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_public_materials" ON "public"."lesson_materials" FOR SELECT USING ((("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))))));



ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_manage_own_payment_accounts" ON "public"."payment_accounts" TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'school'::"text")))));



CREATE POLICY "school_read_slots" ON "public"."timetable_slots" FOR SELECT TO "authenticated" USING (("timetable_id" IN ( SELECT "public"."get_timetable_ids_by_school"("pu"."school_id") AS "get_timetable_ids_by_school"
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'school'::"text")))));



CREATE POLICY "school_read_timetables" ON "public"."timetables" FOR SELECT TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'school'::"text")))));



ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_select_all" ON "public"."schools" FOR SELECT USING (true);



CREATE POLICY "schools_write_admin" ON "public"."schools" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'admin'::"text")))));



CREATE POLICY "select_attendance_all" ON "public"."attendance" FOR SELECT USING (("public"."is_staff"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "select_sessions_all" ON "public"."class_sessions" FOR SELECT USING (true);



CREATE POLICY "staff_can_view_portal_users" ON "public"."portal_users" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])));



CREATE POLICY "staff_can_view_schools" ON "public"."schools" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])));



CREATE POLICY "staff_can_view_students" ON "public"."students" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])));



CREATE POLICY "staff_read_plans" ON "public"."lesson_plans" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "staff_write_materials" ON "public"."lesson_materials" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "staff_write_plans" ON "public"."lesson_plans" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text"]))))));



CREATE POLICY "student_can_view_own_record" ON "public"."students" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."student_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_progress_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "student_read_slots" ON "public"."timetable_slots" FOR SELECT TO "authenticated" USING (("timetable_id" IN ( SELECT "public"."get_timetable_ids_by_school"("pu"."school_id") AS "get_timetable_ids_by_school"
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."id" = "auth"."uid"()) AND ("pu"."role" = 'student'::"text")))));



CREATE POLICY "student_read_timetables" ON "public"."timetables" FOR SELECT TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'student'::"text")))));



ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submissions_read" ON "public"."assignment_submissions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"]))))) OR ("portal_user_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "submissions_staff_write" ON "public"."assignment_submissions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'school'::"text"]))))));



CREATE POLICY "submissions_student_insert" ON "public"."assignment_submissions" FOR INSERT TO "authenticated" WITH CHECK ((("portal_user_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "submissions_student_update" ON "public"."assignment_submissions" FOR UPDATE TO "authenticated" USING ((("portal_user_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teacher_read_slots" ON "public"."timetable_slots" FOR SELECT TO "authenticated" USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "teacher_read_timetables" ON "public"."timetables" FOR SELECT TO "authenticated" USING (("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'teacher'::"text")))));



ALTER TABLE "public"."teacher_schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teacher_schools_admin_all" ON "public"."teacher_schools" USING ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users"
  WHERE (("portal_users"."id" = "auth"."uid"()) AND ("portal_users"."role" = 'admin'::"text")))));



CREATE POLICY "teacher_schools_teacher_select" ON "public"."teacher_schools" FOR SELECT USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timetable_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timetables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_read_active_payment_accounts" ON "public"."payment_accounts" FOR SELECT TO "authenticated" USING ((("is_active" = true) AND (("owner_type" = 'rillcod'::"text") OR ("school_id" IN ( SELECT "portal_users"."school_id"
   FROM "public"."portal_users"
  WHERE ("portal_users"."id" = "auth"."uid"()))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_at_risk_students"("p_school_id" "uuid", "p_days_inactive" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_at_risk_students"("p_school_id" "uuid", "p_days_inactive" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_at_risk_students"("p_school_id" "uuid", "p_days_inactive" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_course_avg_assignment_grade"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_course_avg_assignment_grade"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_course_avg_assignment_grade"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_course_avg_exam_score"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_course_avg_exam_score"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_course_avg_exam_score"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_timetable_ids_by_school"("p_school_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_timetable_ids_by_school"("p_school_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_timetable_ids_by_school"("p_school_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_download_count"("file_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_download_count"("file_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_download_count"("file_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_login"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_live_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_live_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_live_sessions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON TABLE "public"."cbt_exams" TO "anon";
GRANT ALL ON TABLE "public"."cbt_exams" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_exams" TO "service_role";



GRANT ALL ON TABLE "public"."cbt_questions" TO "anon";
GRANT ALL ON TABLE "public"."cbt_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_questions" TO "service_role";



GRANT ALL ON TABLE "public"."cbt_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cbt_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."certificates" TO "anon";
GRANT ALL ON TABLE "public"."certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."certificates" TO "service_role";



GRANT ALL ON TABLE "public"."class_sessions" TO "anon";
GRANT ALL ON TABLE "public"."class_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."class_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."content_library" TO "anon";
GRANT ALL ON TABLE "public"."content_library" TO "authenticated";
GRANT ALL ON TABLE "public"."content_library" TO "service_role";



GRANT ALL ON TABLE "public"."content_ratings" TO "anon";
GRANT ALL ON TABLE "public"."content_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."content_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."course_materials" TO "anon";
GRANT ALL ON TABLE "public"."course_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."course_materials" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."discussion_attachments" TO "anon";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."discussion_replies" TO "anon";
GRANT ALL ON TABLE "public"."discussion_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_replies" TO "service_role";



GRANT ALL ON TABLE "public"."discussion_topics" TO "anon";
GRANT ALL ON TABLE "public"."discussion_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."discussion_topics" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."exam_attempts" TO "anon";
GRANT ALL ON TABLE "public"."exam_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."exam_questions" TO "anon";
GRANT ALL ON TABLE "public"."exam_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_questions" TO "service_role";



GRANT ALL ON TABLE "public"."exams" TO "anon";
GRANT ALL ON TABLE "public"."exams" TO "authenticated";
GRANT ALL ON TABLE "public"."exams" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."flagged_content" TO "anon";
GRANT ALL ON TABLE "public"."flagged_content" TO "authenticated";
GRANT ALL ON TABLE "public"."flagged_content" TO "service_role";



GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";



GRANT ALL ON TABLE "public"."grade_reports" TO "anon";
GRANT ALL ON TABLE "public"."grade_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_reports" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."leaderboards" TO "anon";
GRANT ALL ON TABLE "public"."leaderboards" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboards" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_materials" TO "anon";
GRANT ALL ON TABLE "public"."lesson_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_materials" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_plans" TO "anon";
GRANT ALL ON TABLE "public"."lesson_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_plans" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_attendance" TO "anon";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "anon";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_breakout_participants" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "anon";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_breakout_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_poll_options" TO "anon";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_poll_options" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "anon";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_poll_responses" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_polls" TO "anon";
GRANT ALL ON TABLE "public"."live_session_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_polls" TO "service_role";



GRANT ALL ON TABLE "public"."live_sessions" TO "anon";
GRANT ALL ON TABLE "public"."live_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_accounts" TO "anon";
GRANT ALL ON TABLE "public"."payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."portal_users" TO "anon";
GRANT ALL ON TABLE "public"."portal_users" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_users" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_projects" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_projects" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."prospective_students" TO "anon";
GRANT ALL ON TABLE "public"."prospective_students" TO "authenticated";
GRANT ALL ON TABLE "public"."prospective_students" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."report_settings" TO "anon";
GRANT ALL ON TABLE "public"."report_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."report_settings" TO "service_role";



GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."student_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."student_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."student_performance_summary" TO "anon";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."student_performance_summary" TO "service_role";



GRANT ALL ON TABLE "public"."student_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_progress" TO "service_role";



GRANT ALL ON TABLE "public"."student_progress_reports" TO "anon";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."student_progress_reports" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_schools" TO "anon";
GRANT ALL ON TABLE "public"."teacher_schools" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_schools" TO "service_role";



GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";



GRANT ALL ON TABLE "public"."timetable_slots" TO "anon";
GRANT ALL ON TABLE "public"."timetable_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."timetable_slots" TO "service_role";



GRANT ALL ON TABLE "public"."timetables" TO "anon";
GRANT ALL ON TABLE "public"."timetables" TO "authenticated";
GRANT ALL ON TABLE "public"."timetables" TO "service_role";



GRANT ALL ON TABLE "public"."topic_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_points" TO "anon";
GRANT ALL ON TABLE "public"."user_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_points" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







