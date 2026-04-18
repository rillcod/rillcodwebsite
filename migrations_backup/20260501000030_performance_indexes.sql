-- Migration: Add Performance Indexes for Foreign Keys and Common Queries
-- Date: 2026-04-17
-- Purpose: Improve query performance by adding indexes on foreign keys and frequently queried columns

-- ══════════════════════════════════════════════════════════════════════════════
-- FOREIGN KEY INDEXES
-- PostgreSQL doesn't automatically create indexes on foreign key columns
-- ══════════════════════════════════════════════════════════════════════════════

-- Announcements
create index if not exists idx_announcements_school_id on public.announcements(school_id);
create index if not exists idx_announcements_class_id on public.announcements(class_id);
create index if not exists idx_announcements_status on public.announcements(status);
create index if not exists idx_announcements_expires_at on public.announcements(expires_at) where expires_at is not null;

-- Instalment Plans
create index if not exists idx_instalment_plans_invoice_id on public.instalment_plans(invoice_id);
create index if not exists idx_instalment_plans_parent_id on public.instalment_plans(parent_id);
create index if not exists idx_instalment_plans_status on public.instalment_plans(status);

-- Instalment Items
create index if not exists idx_instalment_items_plan_id on public.instalment_items(plan_id);
create index if not exists idx_instalment_items_status on public.instalment_items(status);
create index if not exists idx_instalment_items_due_date on public.instalment_items(due_date);

-- Term Schedules
create index if not exists idx_term_schedules_lesson_plan_id on public.term_schedules(lesson_plan_id);
create index if not exists idx_term_schedules_school_id on public.term_schedules(school_id);
create index if not exists idx_term_schedules_is_active on public.term_schedules(is_active);

-- Course Curricula
create index if not exists idx_course_curricula_course_id on public.course_curricula(course_id);
create index if not exists idx_course_curricula_school_id on public.course_curricula(school_id);
create index if not exists idx_course_curricula_created_by on public.course_curricula(created_by);

-- Lesson Plans
create index if not exists idx_lesson_plans_school_id on public.lesson_plans(school_id);
create index if not exists idx_lesson_plans_course_id on public.lesson_plans(course_id);
create index if not exists idx_lesson_plans_class_id on public.lesson_plans(class_id);
create index if not exists idx_lesson_plans_created_by on public.lesson_plans(created_by);
create index if not exists idx_lesson_plans_curriculum_version_id on public.lesson_plans(curriculum_version_id);

-- Consent Forms
create index if not exists idx_consent_forms_school_id on public.consent_forms(school_id);
create index if not exists idx_consent_forms_created_by on public.consent_forms(created_by);
create index if not exists idx_consent_forms_due_date on public.consent_forms(due_date) where due_date is not null;

-- Consent Responses
create index if not exists idx_consent_responses_form_id on public.consent_responses(form_id);
create index if not exists idx_consent_responses_parent_id on public.consent_responses(parent_id);

-- Parent Teacher Chat
create index if not exists idx_parent_teacher_threads_parent_id on public.parent_teacher_threads(parent_id);
create index if not exists idx_parent_teacher_threads_teacher_id on public.parent_teacher_threads(teacher_id);
create index if not exists idx_parent_teacher_threads_student_id on public.parent_teacher_threads(student_id);

create index if not exists idx_parent_teacher_messages_thread_id on public.parent_teacher_messages(thread_id);
create index if not exists idx_parent_teacher_messages_sender_id on public.parent_teacher_messages(sender_id);
create index if not exists idx_parent_teacher_messages_sent_at on public.parent_teacher_messages(sent_at desc);

-- Flashcards
create index if not exists idx_flashcard_decks_lesson_id on public.flashcard_decks(lesson_id);
create index if not exists idx_flashcard_decks_course_id on public.flashcard_decks(course_id);
create index if not exists idx_flashcard_decks_school_id on public.flashcard_decks(school_id);
create index if not exists idx_flashcard_decks_created_by on public.flashcard_decks(created_by);

create index if not exists idx_flashcard_cards_deck_id on public.flashcard_cards(deck_id);

create index if not exists idx_flashcard_reviews_card_id on public.flashcard_reviews(card_id);
create index if not exists idx_flashcard_reviews_student_id on public.flashcard_reviews(student_id);
create index if not exists idx_flashcard_reviews_next_review_at on public.flashcard_reviews(next_review_at);

-- Study Groups
create index if not exists idx_study_groups_course_id on public.study_groups(course_id);
create index if not exists idx_study_groups_school_id on public.study_groups(school_id);
create index if not exists idx_study_groups_created_by on public.study_groups(created_by);
create index if not exists idx_study_groups_status on public.study_groups(status);

create index if not exists idx_study_group_members_group_id on public.study_group_members(group_id);
create index if not exists idx_study_group_members_user_id on public.study_group_members(user_id);

create index if not exists idx_study_group_messages_group_id on public.study_group_messages(group_id);
create index if not exists idx_study_group_messages_sender_id on public.study_group_messages(sender_id);
create index if not exists idx_study_group_messages_created_at on public.study_group_messages(created_at desc);

-- WhatsApp
create index if not exists idx_whatsapp_conversations_portal_user_id on public.whatsapp_conversations(portal_user_id);
create index if not exists idx_whatsapp_conversations_last_message_at on public.whatsapp_conversations(last_message_at desc);

create index if not exists idx_whatsapp_messages_conversation_id on public.whatsapp_messages(conversation_id);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at desc);

-- Billing
create index if not exists idx_billing_contacts_owner_user_id on public.billing_contacts(owner_user_id) where owner_user_id is not null;
create index if not exists idx_school_settlements_school_id on public.school_settlements(school_id);
create index if not exists idx_school_settlements_billing_cycle_id on public.school_settlements(billing_cycle_id) where billing_cycle_id is not null;
create index if not exists idx_school_settlements_paid_by on public.school_settlements(paid_by) where paid_by is not null;

-- Subscriptions
create index if not exists idx_subscriptions_school_id on public.subscriptions(school_id) where school_id is not null;

-- Audit Logs
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);

-- ══════════════════════════════════════════════════════════════════════════════
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ══════════════════════════════════════════════════════════════════════════════

-- Portal Users - Common filters
create index if not exists idx_portal_users_role_school on public.portal_users(role, school_id) where is_deleted = false;
create index if not exists idx_portal_users_role_active on public.portal_users(role, is_active) where is_deleted = false;
create index if not exists idx_portal_users_school_class on public.portal_users(school_id, class_id) where role = 'student' and is_deleted = false;

-- Assignments - Common queries
create index if not exists idx_assignments_class_due_date on public.assignments(class_id, due_date) where is_active = true;
create index if not exists idx_assignments_course_active on public.assignments(course_id, is_active);
create index if not exists idx_assignments_created_by on public.assignments(created_by);

-- Assignment Submissions - Performance critical
create index if not exists idx_assignment_submissions_assignment_user on public.assignment_submissions(assignment_id, portal_user_id);
create index if not exists idx_assignment_submissions_user_status on public.assignment_submissions(portal_user_id, status);
create index if not exists idx_assignment_submissions_status_graded_at on public.assignment_submissions(status, graded_at desc) where status = 'graded';

-- Attendance - Date range queries
create index if not exists idx_attendance_student_date on public.attendance(student_id, created_at desc);
create index if not exists idx_attendance_session_date on public.attendance(session_id, created_at desc) where session_id is not null;
create index if not exists idx_attendance_status on public.attendance(status, created_at desc);

-- Lessons - Common access patterns
create index if not exists idx_lessons_course_status on public.lessons(course_id, status);
create index if not exists idx_lessons_created_by on public.lessons(created_by);

-- Lesson Progress - Student tracking
create index if not exists idx_lesson_progress_user_lesson on public.lesson_progress(portal_user_id, lesson_id);
create index if not exists idx_lesson_progress_user_accessed on public.lesson_progress(portal_user_id, last_accessed_at desc);

-- Enrollments - Student programs
create index if not exists idx_enrollments_user_status on public.enrollments(user_id, status);
create index if not exists idx_enrollments_program_status on public.enrollments(program_id, status);

-- Invoices - Payment tracking
create index if not exists idx_invoices_student_status on public.invoices(portal_user_id, status);
create index if not exists idx_invoices_school_status on public.invoices(school_id, status) where school_id is not null;
create index if not exists idx_invoices_due_date on public.invoices(due_date) where status != 'paid';

-- Payment Transactions
create index if not exists idx_payment_transactions_invoice_id on public.payment_transactions(invoice_id);
create index if not exists idx_payment_transactions_status on public.payment_transactions(payment_status, paid_at desc);

-- Notifications
create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- PARTIAL INDEXES FOR SPECIFIC USE CASES
-- ══════════════════════════════════════════════════════════════════════════════

-- Active students only
create index if not exists idx_portal_users_active_students on public.portal_users(id, school_id, last_login)
  where role = 'student' and is_active = true and is_deleted = false;

-- Overdue assignments removed (duplicate/non-immutable)

-- Unread notifications
create index if not exists idx_notifications_unread on public.notifications(user_id, created_at desc)
  where is_read = false;

-- Unpaid invoices
create index if not exists idx_invoices_unpaid on public.invoices(portal_user_id, school_id, due_date)
  where status != 'paid';

-- ══════════════════════════════════════════════════════════════════════════════
-- ANALYZE TABLES FOR QUERY PLANNER
-- ══════════════════════════════════════════════════════════════════════════════

analyze public.portal_users;
analyze public.assignments;
analyze public.assignment_submissions;
analyze public.attendance;
analyze public.lessons;
analyze public.lesson_progress;
analyze public.enrollments;
analyze public.invoices;
analyze public.payment_transactions;
analyze public.notifications;

-- Add comments
comment on index idx_portal_users_role_school is 'Optimizes queries filtering by role and school';
comment on index idx_assignments_class_due_date is 'Optimizes overdue assignment queries';
comment on index idx_assignment_submissions_assignment_user is 'Prevents N+1 queries when checking submissions';
comment on index idx_attendance_student_date is 'Optimizes attendance history queries';
comment on index idx_lesson_progress_user_accessed is 'Optimizes recent activity queries';
