-- ============================================================================
-- Restore the six relations dropped by 20260927000004.
-- ============================================================================
-- Reverses that migration in full. Every definition below was extracted verbatim
-- from 00000000000000_baseline_schema.sql, so the tables come back exactly as
-- they were: same columns, defaults, constraints, indexes, foreign keys,
-- triggers, RLS state, policies and grants.
--
-- No data is restored because none was lost -- all six were empty when dropped.
--
-- Restored: generated_reports, report_templates, grade_reports, leaderboards,
--           student_progress, user_profiles
--
-- Contents: 6 tables, 9 constraints, 6 indexes, 11 foreign keys, 3 triggers,
--           6 RLS enables, 10 policies, 24 grants.
--
-- The accompanying code references removed by the drop are restored alongside
-- this migration in:
--   src/app/api/admin/manage-account/route.ts
--   src/app/api/admin/merge-duplicate-students/route.ts
-- ============================================================================

-- ---- table ----
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

-- ---- owner ----
ALTER TABLE "public"."generated_reports" OWNER TO "postgres";
ALTER TABLE "public"."grade_reports" OWNER TO "postgres";
ALTER TABLE "public"."leaderboards" OWNER TO "postgres";
ALTER TABLE "public"."report_templates" OWNER TO "postgres";
ALTER TABLE "public"."student_progress" OWNER TO "postgres";
ALTER TABLE "public"."user_profiles" OWNER TO "postgres";

-- ---- constraint ----
ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."grade_reports"
    ADD CONSTRAINT "grade_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_template_type_check" CHECK ((template_type = ANY (ARRAY['student_progress'::text, 'financial'::text, 'attendance'::text, 'performance'::text])));
ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])));
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE (user_id);

-- ---- index ----
CREATE INDEX IF NOT EXISTS idx_grade_reports_portal_user ON public.grade_reports USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_grade_reports_student ON public.grade_reports USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_progress_course ON public.student_progress USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_progress_portal_user ON public.student_progress USING btree (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_progress_student ON public.student_progress USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON public.user_profiles USING btree (user_id);

-- ---- fk ----
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
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
ALTER TABLE ONLY "public"."leaderboards"
    ADD CONSTRAINT "leaderboards_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress"
    ADD CONSTRAINT "student_progress_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;

-- ---- trigger ----
CREATE TRIGGER update_report_templates_updated_at BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_progress_updated_at BEFORE UPDATE ON public.student_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- rls ----
ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grade_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leaderboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

-- ---- policy ----
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
CREATE POLICY "Everyone can view leaderboards" ON "public"."leaderboards" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "Admins can manage reports" ON "public"."report_templates" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "progress_select_all" ON "public"."student_progress" FOR SELECT TO PUBLIC
    USING (true);
CREATE POLICY "progress_write_staff" ON "public"."student_progress" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));
CREATE POLICY "Admins can manage all profiles" ON "public"."user_profiles" FOR ALL TO PUBLIC
    USING ((EXISTS ( SELECT 1
   FROM public.portal_users
  WHERE ((portal_users.id = auth.uid()) AND (portal_users.role = 'admin'::text)))));
CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE TO PUBLIC
    USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT TO PUBLIC
    USING ((user_id = auth.uid()));

-- ---- grant ----
GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "postgres";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";
GRANT ALL ON TABLE "public"."grade_reports" TO "anon";
GRANT ALL ON TABLE "public"."grade_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_reports" TO "postgres";
GRANT ALL ON TABLE "public"."grade_reports" TO "service_role";
GRANT ALL ON TABLE "public"."leaderboards" TO "anon";
GRANT ALL ON TABLE "public"."leaderboards" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboards" TO "postgres";
GRANT ALL ON TABLE "public"."leaderboards" TO "service_role";
GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "postgres";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";
GRANT ALL ON TABLE "public"."student_progress" TO "anon";
GRANT ALL ON TABLE "public"."student_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_progress" TO "postgres";
GRANT ALL ON TABLE "public"."student_progress" TO "service_role";
GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "postgres";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";

-- ============================================================================
-- VERIFY -- expect 6 rows, and the table count back to 192
-- ============================================================================
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname IN
--      ('generated_reports','report_templates','grade_reports','leaderboards',
--       'student_progress','user_profiles') ORDER BY 1;
--
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relkind IN ('r','p');
-- ============================================================================
