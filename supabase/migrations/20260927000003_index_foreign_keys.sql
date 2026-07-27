-- ============================================================================
-- Index unindexed foreign key columns.
-- ============================================================================
-- Postgres automatically indexes the REFERENCED side of a foreign key (it must
-- be unique) but never the REFERENCING side. Without an index there, every join
-- across the FK -- and every cascading delete on the parent -- falls back to a
-- sequential scan of the child table.
--
-- 185 foreign keys had no covering index. 83 of those sit on tables that are
-- currently empty, where an index is pure write overhead for no read benefit;
-- those are deliberately SKIPPED. The 102 below are on tables holding rows.
--
-- Worst offenders this addresses (seq scans vs index scans, before):
--   portal_users          1040 rows   84,212 seq scans
--   students               918 rows   44,576 seq scans
--   registration_results   915 rows    8,957 seq scans vs 30 index scans
--
-- SAFETY: an index never changes query RESULTS, only how rows are located, so
-- this migration cannot alter application behaviour. Costs are disk and a small
-- write-time overhead.
--
-- On locking: the largest affected table is curriculum_project_registry at
-- ~21k rows, so each index builds in milliseconds. CREATE INDEX CONCURRENTLY is
-- deliberately NOT used because it cannot run inside a transaction block, and
-- `supabase db push` wraps each migration in one.
--
-- All statements use IF NOT EXISTS, so this migration is safe to re-run.
-- ============================================================================

-- curriculum_project_registry (21360 rows)
CREATE INDEX IF NOT EXISTS "idx_curriculum_project_registry_created_by"
    ON "public"."curriculum_project_registry" ("created_by");
-- curriculum_project_registry (21360 rows)
CREATE INDEX IF NOT EXISTS "idx_curriculum_project_registry_course_id"
    ON "public"."curriculum_project_registry" ("course_id");
-- attendance (2997 rows)
CREATE INDEX IF NOT EXISTS "idx_attendance_recorded_by"
    ON "public"."attendance" ("recorded_by");
-- card_audit_logs (1225 rows)
CREATE INDEX IF NOT EXISTS "idx_card_audit_logs_school_id"
    ON "public"."card_audit_logs" ("school_id");
-- crm_interactions (1121 rows)
CREATE INDEX IF NOT EXISTS "idx_crm_interactions_staff_id"
    ON "public"."crm_interactions" ("staff_id");
-- portal_users (1040 rows)
CREATE INDEX IF NOT EXISTS "idx_portal_users_duplicate_name_exception_approved_by"
    ON "public"."portal_users" ("duplicate_name_exception_approved_by");
-- portal_users (1040 rows)
CREATE INDEX IF NOT EXISTS "idx_portal_users_student_id"
    ON "public"."portal_users" ("student_id");
-- portal_users (1040 rows)
CREATE INDEX IF NOT EXISTS "idx_portal_users_created_by"
    ON "public"."portal_users" ("created_by");
-- identity_cards (935 rows)
CREATE INDEX IF NOT EXISTS "idx_identity_cards_class_id"
    ON "public"."identity_cards" ("class_id");
-- identity_cards (935 rows)
CREATE INDEX IF NOT EXISTS "idx_identity_cards_created_by"
    ON "public"."identity_cards" ("created_by");
-- identity_cards (935 rows)
CREATE INDEX IF NOT EXISTS "idx_identity_cards_updated_by"
    ON "public"."identity_cards" ("updated_by");
-- identity_cards (935 rows)
CREATE INDEX IF NOT EXISTS "idx_identity_cards_holder_id"
    ON "public"."identity_cards" ("holder_id");
-- student_progress_reports (921 rows)
CREATE INDEX IF NOT EXISTS "idx_student_progress_reports_course_id"
    ON "public"."student_progress_reports" ("course_id");
-- students (918 rows)
CREATE INDEX IF NOT EXISTS "idx_students_created_by"
    ON "public"."students" ("created_by");
-- registration_results (915 rows)
CREATE INDEX IF NOT EXISTS "idx_registration_results_batch_id"
    ON "public"."registration_results" ("batch_id");
-- class_term_rosters (287 rows)
CREATE INDEX IF NOT EXISTS "idx_class_term_rosters_updated_by"
    ON "public"."class_term_rosters" ("updated_by");
-- class_term_rosters (287 rows)
CREATE INDEX IF NOT EXISTS "idx_class_term_rosters_created_by"
    ON "public"."class_term_rosters" ("created_by");
-- class_term_rosters (287 rows)
CREATE INDEX IF NOT EXISTS "idx_class_term_rosters_program_id"
    ON "public"."class_term_rosters" ("program_id");
-- class_term_rosters (287 rows)
CREATE INDEX IF NOT EXISTS "idx_class_term_rosters_school_id"
    ON "public"."class_term_rosters" ("school_id");
-- class_term_rosters (287 rows)
CREATE INDEX IF NOT EXISTS "idx_class_term_rosters_subscription_id"
    ON "public"."class_term_rosters" ("subscription_id");
-- crm_pipeline (166 rows)
CREATE INDEX IF NOT EXISTS "idx_crm_pipeline_updated_by"
    ON "public"."crm_pipeline" ("updated_by");
-- lessons (112 rows)
CREATE INDEX IF NOT EXISTS "idx_lessons_academic_term_id"
    ON "public"."lessons" ("academic_term_id");
-- registration_batches (104 rows)
CREATE INDEX IF NOT EXISTS "idx_registration_batches_created_by"
    ON "public"."registration_batches" ("created_by");
-- prospective_students (99 rows)
CREATE INDEX IF NOT EXISTS "idx_prospective_students_school_id"
    ON "public"."prospective_students" ("school_id");
-- communication_delivery_log (94 rows)
CREATE INDEX IF NOT EXISTS "idx_communication_delivery_log_case_event_id"
    ON "public"."communication_delivery_log" ("case_event_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_matched_student_id"
    ON "public"."form_leads" ("matched_student_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_school_id"
    ON "public"."form_leads" ("school_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_prospect_id"
    ON "public"."form_leads" ("prospect_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_contact_id"
    ON "public"."form_leads" ("contact_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_match_candidate_id"
    ON "public"."form_leads" ("match_candidate_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_matched_parent_id"
    ON "public"."form_leads" ("matched_parent_id");
-- form_leads (69 rows)
CREATE INDEX IF NOT EXISTS "idx_form_leads_matched_school_id"
    ON "public"."form_leads" ("matched_school_id");
-- classes (60 rows)
CREATE INDEX IF NOT EXISTS "idx_classes_current_course_id"
    ON "public"."classes" ("current_course_id");
-- payment_transactions (52 rows)
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_course_id"
    ON "public"."payment_transactions" ("course_id");
-- form_lead_child_links (47 rows)
CREATE INDEX IF NOT EXISTS "idx_form_lead_child_links_linked_by"
    ON "public"."form_lead_child_links" ("linked_by");
-- teacher_schools (39 rows)
CREATE INDEX IF NOT EXISTS "idx_teacher_schools_assigned_by"
    ON "public"."teacher_schools" ("assigned_by");
-- files (29 rows)
CREATE INDEX IF NOT EXISTS "idx_files_school_id"
    ON "public"."files" ("school_id");
-- files (29 rows)
CREATE INDEX IF NOT EXISTS "idx_files_uploaded_by"
    ON "public"."files" ("uploaded_by");
-- newsletter_delivery (23 rows)
CREATE INDEX IF NOT EXISTS "idx_newsletter_delivery_user_id"
    ON "public"."newsletter_delivery" ("user_id");
-- newsletter_delivery (23 rows)
CREATE INDEX IF NOT EXISTS "idx_newsletter_delivery_campaign_id"
    ON "public"."newsletter_delivery" ("campaign_id");
-- cbt_exams (20 rows)
CREATE INDEX IF NOT EXISTS "idx_cbt_exams_course_id"
    ON "public"."cbt_exams" ("course_id");
-- email_events (17 rows)
CREATE INDEX IF NOT EXISTS "idx_email_events_report_id"
    ON "public"."email_events" ("report_id");
-- consent_forms (16 rows)
CREATE INDEX IF NOT EXISTS "idx_consent_forms_class_id"
    ON "public"."consent_forms" ("class_id");
-- school_report_events (12 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_events_revision_id"
    ON "public"."school_report_events" ("revision_id");
-- school_report_events (12 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_events_actor_id"
    ON "public"."school_report_events" ("actor_id");
-- programs (11 rows)
CREATE INDEX IF NOT EXISTS "idx_programs_school_id"
    ON "public"."programs" ("school_id");
-- timetable_slots (11 rows)
CREATE INDEX IF NOT EXISTS "idx_timetable_slots_course_id"
    ON "public"."timetable_slots" ("course_id");
-- payment_allocations (8 rows)
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_created_by"
    ON "public"."payment_allocations" ("created_by");
-- assignment_submissions (6 rows)
CREATE INDEX IF NOT EXISTS "idx_assignment_submissions_graded_by"
    ON "public"."assignment_submissions" ("graded_by");
-- certificates (6 rows)
CREATE INDEX IF NOT EXISTS "idx_certificates_course_id"
    ON "public"."certificates" ("course_id");
-- school_report_revisions (6 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_revisions_created_by"
    ON "public"."school_report_revisions" ("created_by");
-- school_report_revisions (6 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_revisions_published_by"
    ON "public"."school_report_revisions" ("published_by");
-- announcements (5 rows)
CREATE INDEX IF NOT EXISTS "idx_announcements_author_id"
    ON "public"."announcements" ("author_id");
-- school_performance_reports (5 rows)
CREATE INDEX IF NOT EXISTS "idx_school_performance_reports_published_by"
    ON "public"."school_performance_reports" ("published_by");
-- school_performance_reports (5 rows)
CREATE INDEX IF NOT EXISTS "idx_school_performance_reports_acknowledged_by"
    ON "public"."school_performance_reports" ("acknowledged_by");
-- school_performance_reports (5 rows)
CREATE INDEX IF NOT EXISTS "idx_school_performance_reports_created_by"
    ON "public"."school_performance_reports" ("created_by");
-- timetables (5 rows)
CREATE INDEX IF NOT EXISTS "idx_timetables_created_by"
    ON "public"."timetables" ("created_by");
-- notification_dead_letters (4 rows)
CREATE INDEX IF NOT EXISTS "idx_notification_dead_letters_resolved_by"
    ON "public"."notification_dead_letters" ("resolved_by");
-- notification_dead_letters (4 rows)
CREATE INDEX IF NOT EXISTS "idx_notification_dead_letters_user_id"
    ON "public"."notification_dead_letters" ("user_id");
-- operations_duty_rota (4 rows)
CREATE INDEX IF NOT EXISTS "idx_operations_duty_rota_created_by"
    ON "public"."operations_duty_rota" ("created_by");
-- report_settings (4 rows)
CREATE INDEX IF NOT EXISTS "idx_report_settings_teacher_id"
    ON "public"."report_settings" ("teacher_id");
-- report_settings (4 rows)
CREATE INDEX IF NOT EXISTS "idx_report_settings_school_id"
    ON "public"."report_settings" ("school_id");
-- student_transfer_requests (4 rows)
CREATE INDEX IF NOT EXISTS "idx_student_transfer_requests_decided_by"
    ON "public"."student_transfer_requests" ("decided_by");
-- student_transfer_requests (4 rows)
CREATE INDEX IF NOT EXISTS "idx_student_transfer_requests_from_class_id"
    ON "public"."student_transfer_requests" ("from_class_id");
-- student_transfer_requests (4 rows)
CREATE INDEX IF NOT EXISTS "idx_student_transfer_requests_school_id"
    ON "public"."student_transfer_requests" ("school_id");
-- student_transfer_requests (4 rows)
CREATE INDEX IF NOT EXISTS "idx_student_transfer_requests_to_class_id"
    ON "public"."student_transfer_requests" ("to_class_id");
-- billing_cycles (3 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_cycles_invoice_id"
    ON "public"."billing_cycles" ("invoice_id");
-- billing_cycles (3 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_cycles_school_id"
    ON "public"."billing_cycles" ("school_id");
-- billing_cycles (3 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_cycles_subscription_id"
    ON "public"."billing_cycles" ("subscription_id");
-- communication_template_versions (3 rows)
CREATE INDEX IF NOT EXISTS "idx_communication_template_versions_created_by"
    ON "public"."communication_template_versions" ("created_by");
-- communication_templates (3 rows)
CREATE INDEX IF NOT EXISTS "idx_communication_templates_approved_by"
    ON "public"."communication_templates" ("approved_by");
-- communication_templates (3 rows)
CREATE INDEX IF NOT EXISTS "idx_communication_templates_created_by"
    ON "public"."communication_templates" ("created_by");
-- communication_templates (3 rows)
CREATE INDEX IF NOT EXISTS "idx_communication_templates_current_version_id"
    ON "public"."communication_templates" ("current_version_id");
-- lesson_materials (3 rows)
CREATE INDEX IF NOT EXISTS "idx_lesson_materials_lesson_id"
    ON "public"."lesson_materials" ("lesson_id");
-- live_sessions (3 rows)
CREATE INDEX IF NOT EXISTS "idx_live_sessions_program_id"
    ON "public"."live_sessions" ("program_id");
-- newsletters (3 rows)
CREATE INDEX IF NOT EXISTS "idx_newsletters_school_id"
    ON "public"."newsletters" ("school_id");
-- newsletters (3 rows)
CREATE INDEX IF NOT EXISTS "idx_newsletters_author_id"
    ON "public"."newsletters" ("author_id");
-- newsletters (3 rows)
CREATE INDEX IF NOT EXISTS "idx_newsletters_campaign_id"
    ON "public"."newsletters" ("campaign_id");
-- billing_contacts (2 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_contacts_teacher_id"
    ON "public"."billing_contacts" ("teacher_id");
-- feedback (2 rows)
CREATE INDEX IF NOT EXISTS "idx_feedback_responded_by"
    ON "public"."feedback" ("responded_by");
-- lab_projects (2 rows)
CREATE INDEX IF NOT EXISTS "idx_lab_projects_lesson_id"
    ON "public"."lab_projects" ("lesson_id");
-- lab_projects (2 rows)
CREATE INDEX IF NOT EXISTS "idx_lab_projects_user_id"
    ON "public"."lab_projects" ("user_id");
-- lab_projects (2 rows)
CREATE INDEX IF NOT EXISTS "idx_lab_projects_assignment_id"
    ON "public"."lab_projects" ("assignment_id");
-- payment_accounts (2 rows)
CREATE INDEX IF NOT EXISTS "idx_payment_accounts_created_by"
    ON "public"."payment_accounts" ("created_by");
-- school_report_readiness_log (2 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_readiness_log_school_id"
    ON "public"."school_report_readiness_log" ("school_id");
-- school_report_readiness_log (2 rows)
CREATE INDEX IF NOT EXISTS "idx_school_report_readiness_log_academic_term_id"
    ON "public"."school_report_readiness_log" ("academic_term_id");
-- billing_document_archive (1 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_document_archive_created_by"
    ON "public"."billing_document_archive" ("created_by");
-- billing_notices (1 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_notices_owner_user_id"
    ON "public"."billing_notices" ("owner_user_id");
-- billing_notices (1 rows)
CREATE INDEX IF NOT EXISTS "idx_billing_notices_owner_school_id"
    ON "public"."billing_notices" ("owner_school_id");
-- content_library (1 rows)
CREATE INDEX IF NOT EXISTS "idx_content_library_created_by"
    ON "public"."content_library" ("created_by");
-- content_library (1 rows)
CREATE INDEX IF NOT EXISTS "idx_content_library_approved_by"
    ON "public"."content_library" ("approved_by");
-- content_library (1 rows)
CREATE INDEX IF NOT EXISTS "idx_content_library_file_id"
    ON "public"."content_library" ("file_id");
-- content_library (1 rows)
CREATE INDEX IF NOT EXISTS "idx_content_library_school_id"
    ON "public"."content_library" ("school_id");
-- content_ratings (1 rows)
CREATE INDEX IF NOT EXISTS "idx_content_ratings_portal_user_id"
    ON "public"."content_ratings" ("portal_user_id");
-- operations_staff_settings (1 rows)
CREATE INDEX IF NOT EXISTS "idx_operations_staff_settings_updated_by"
    ON "public"."operations_staff_settings" ("updated_by");
-- project_groups (1 rows)
CREATE INDEX IF NOT EXISTS "idx_project_groups_school_id"
    ON "public"."project_groups" ("school_id");
-- project_groups (1 rows)
CREATE INDEX IF NOT EXISTS "idx_project_groups_created_by"
    ON "public"."project_groups" ("created_by");
-- special_program_pages (1 rows)
CREATE INDEX IF NOT EXISTS "idx_special_program_pages_program_id"
    ON "public"."special_program_pages" ("program_id");
-- subscriptions (1 rows)
CREATE INDEX IF NOT EXISTS "idx_subscriptions_portal_user_id"
    ON "public"."subscriptions" ("portal_user_id");
-- subscriptions (1 rows)
CREATE INDEX IF NOT EXISTS "idx_subscriptions_course_id"
    ON "public"."subscriptions" ("course_id");
-- whatsapp_groups (1 rows)
CREATE INDEX IF NOT EXISTS "idx_whatsapp_groups_school_id"
    ON "public"."whatsapp_groups" ("school_id");
-- whatsapp_groups (1 rows)
CREATE INDEX IF NOT EXISTS "idx_whatsapp_groups_created_by"
    ON "public"."whatsapp_groups" ("created_by");

-- ============================================================================
-- VERIFY -- unindexed FKs on non-empty tables should now be 0
-- ============================================================================
--   SELECT count(*) FROM pg_constraint c
--     JOIN pg_class cl ON cl.oid = c.conrelid
--     JOIN pg_namespace n ON n.oid = cl.relnamespace
--     LEFT JOIN pg_stat_user_tables st ON st.relid = cl.oid
--    WHERE n.nspname='public' AND c.contype='f' AND coalesce(st.n_live_tup,0) > 0
--      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
--            AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey);
-- ============================================================================
