/**
 * Explicit PostgREST relationship hints — aligned with src/types/supabase.ts.
 * Unhinted embeds fail when multiple FK paths exist (portal_users ↔ classes,
 * or portal_users vs student_performance_summary view duplicates).
 */
export const EMBED = {
  portalUserClass: 'classes!portal_users_class_id_fkey',
  classTeacher: 'portal_users!classes_teacher_id_fkey',
  parentLinkParent: 'portal_users!parent_student_links_parent_id_fkey',
  parentLinkStudent: 'students!parent_student_links_student_id_fkey',
  notificationPrefUser: 'portal_users!notification_preferences_portal_user_id_fkey',
  reportCommentAuthor: 'portal_users!school_report_comments_author_id_fkey',
  attendanceUser: 'portal_users!attendance_user_id_fkey',
  activityLogUser: 'portal_users!activity_logs_user_id_fkey',
  lessonPlanClass: 'classes!lesson_plans_class_id_fkey',
  sessionClass: 'classes!class_sessions_class_id_fkey',
  invoicePortalUser: 'portal_users!invoices_portal_user_id_fkey',
  paymentTxnPortalUser: 'portal_users!payment_transactions_portal_user_id_fkey',
  certificatePortalUser: 'portal_users!certificates_portal_user_id_fkey',
  userBadgePortalUser: 'portal_users!user_badges_portal_user_id_fkey',
  userPointsPortalUser: 'portal_users!user_points_portal_user_id_fkey',
  liveSessionAttendee: 'portal_users!live_session_attendance_portal_user_id_fkey',
  liveSessionQuestionUser: 'portal_users!live_session_questions_user_fkey',
  enrollmentsUser: 'portal_users!enrollments_user_id_fkey',
  discussionTopicAuthor: 'portal_users!discussion_topics_created_by_fkey',
  discussionReplyAuthor: 'portal_users!discussion_replies_created_by_fkey',
  whatsappConversationUser: 'portal_users!whatsapp_conversations_portal_user_id_fkey',
  coursesTeacher: 'portal_users!courses_teacher_id_fkey',
  projectGroupMember: 'portal_users!project_group_members_student_id_fkey',
  schoolTeacherMessageSender: 'portal_users!school_teacher_messages_sender_id_fkey',
  schoolPartnerUsers: 'portal_users!portal_users_school_id_fkey',
  teacherSchoolsTeacher: 'portal_users!teacher_schools_teacher_id_fkey',
  consentResponseParent: 'portal_users!consent_responses_parent_id_fkey',
  formLeadMatchCandidate: 'portal_users!form_leads_match_candidate_id_fkey',
  studentsPortalUser: 'portal_users!students_user_id_fkey',
  portalUserStudentRow: 'students!portal_users_student_id_fkey',
  parentLinkStudentRow: 'students!parent_student_links_student_id_fkey',
  receiptStudent: 'portal_users!receipts_student_id_fkey',
  receiptSchool: 'schools!receipts_school_id_fkey',
  studentLevelEnrollmentUser: 'portal_users!student_level_enrollments_student_id_fkey',
  pttParent: 'portal_users!parent_teacher_threads_parent_id_fkey',
  pttTeacher: 'portal_users!parent_teacher_threads_teacher_id_fkey',
  pttStudent: 'portal_users!parent_teacher_threads_student_id_fkey',
} as const;

/** Standard select fragments — use plain strings (not template literals) for Supabase typings. */
export const SELECT = {
  portalUsersListWithClass:
    'id, full_name, email, role, school_id, school_name, class_id, section_class, grade, is_active, is_deleted, created_at, updated_at, classes!portal_users_class_id_fkey(name)',
  invoiceWithPortalUser:
    '*, portal_users!invoices_portal_user_id_fkey(full_name, email), schools(name)',
  invoiceWithPortalUserFull:
    '*, portal_users!invoices_portal_user_id_fkey(id, full_name, email), schools(id, name)',
  invoiceWithPortalUserAndSchool:
    '*, portal_users!invoices_portal_user_id_fkey(id, full_name, email, school_id), schools(name)',
  paymentTxnWithPortalUser:
    '*, portal_users!payment_transactions_portal_user_id_fkey(full_name, email), invoices!payment_transactions_invoice_id_fkey(invoice_number, items, stream, billing_cycle_id, school_id), courses(title)',
  notificationPrefWithUser:
    'portal_user_id, portal_users!notification_preferences_portal_user_id_fkey(email, full_name)',
  parentLinkWithParent:
    'parent_id, portal_users!parent_student_links_parent_id_fkey(email, full_name)',
} as const;

export function embed(relation: string, columns: string): string {
  return `${relation}(${columns})`;
}
