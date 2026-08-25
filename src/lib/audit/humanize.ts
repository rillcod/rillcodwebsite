/**
 * Plain-English formatting for audit trail rows.
 * Prefer human names, schools, receipt/invoice numbers — never raw UUIDs / JSON dumps.
 */

export type AuditLike = {
  action: string;
  user_id?: string | null;
  resource_type?: string | null;
  table_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
};

const ACTION_PHRASES: Record<string, string> = {
  // Accounts / schools
  delete_school: 'Deleted a school',
  delete_user: 'Deleted an account',
  create_class: 'Created a class',
  delete_class: 'Deleted a class',
  'students.delete': 'Deleted a student',
  'students.bulk_delete': 'Deleted students in bulk',
  'student.registration_approved': 'Approved a student registration',
  'student.registration_rejected': 'Rejected a student registration',
  student_duplicate_name_exception: 'Allowed a duplicate student name',
  create_communication_template: 'Created a communication template',
  create_communication_template_version: 'Created a new template version',
  test_communication_template_version: 'Passed a template wording test',
  test_communication_template_version_failed: 'Template wording test failed',
  approve_communication_template: 'Approved a communication template version',
  retire_communication_template: 'Retired a communication template',
  update_platform_operations_settings: 'Updated platform operations settings',
  'program.update': 'Updated a programme',
  'program.delete': 'Deleted a programme',

  // Learning
  delete_recording: 'Deleted a class recording',
  delete_submission: 'Deleted a submission',
  delete_lesson_plan_keep_learner_work: 'Removed a lesson plan and kept learner work',
  delete_consent_form: 'Deleted consent form through cleanup policy',
  grade_submission: 'Graded a submission',
  grade_assignment_submission: 'Completed an assignment review',
  update_assignment_submission_review: 'Updated assignment feedback or review status',
  record_direct_assignment_grade: 'Recorded an offline or direct assignment mark',
  submit_and_auto_grade_assignment: 'Submitted and automatically marked an assignment',
  assignment_auto_grading_skipped_stale_review: 'Kept a newer teacher review instead of applying an older automatic mark',
  assignment_auto_grading_failed: 'Sent an assignment to teacher review after automatic marking was unavailable',
  assignment_ai_suggestion_skipped_stale_review: 'Kept a newer teacher review instead of applying an older AI draft',
  assignment_ai_grading_failed: 'Sent an assignment to teacher review after an AI draft was unavailable',
  accept_ai_grade: 'Accepted an AI grade',
  override_grade: 'Overrode a grade',
  'assignment_submission.ai_suggest': 'Ran AI grading suggestions',
  grade_cbt_session: 'Completed or corrected a CBT review',
  record_paper_cbt_scores: 'Recorded school-paper marks',
  auto_finalize_expired_cbt_session: 'Safely closed a timed-out CBT sitting',
  start_cbt_session: 'Started a CBT sitting',
  submit_cbt_session: 'Submitted a CBT sitting',
  auto_submit_cbt_session: 'Automatically submitted a timed-out CBT sitting',
  finalize_written_exam_grade: 'Completed a written-exam review',
  save_written_exam_review: 'Saved written-exam marking progress',
  publish_progress_reports: 'Published progress reports',
  queue_class_broadcast: 'Queued a class broadcast',

  // Operations and recovery
  run_automation_job_now: 'Ran scheduled work now',
  run_automation_job_now_failed: 'Scheduled work needs attention',
  resolve_notification_dead_letter: 'Closed a failed message after review',
  ignore_notification_dead_letter: 'Closed a message that should not be retried',
  retry_notification_dead_letter: 'Retried and delivered a failed message',
  retry_notification_dead_letter_skipped: 'Respected a customer communication preference',
  retry_notification_dead_letter_failed: 'Message retry needs attention',
  refresh_accountability_cache: 'Refreshed the accountability census',
  refresh_accountability_cache_failed: 'Accountability refresh needs attention',
  sync_accountability_classes: 'Aligned student profiles with the current class roster',
  sync_accountability_classes_partial: 'Some student class placements still need attention',
  sync_accountability_classes_failed: 'Student class placement repair needs attention',
  update_operations_staff_capacity: 'Updated staff availability and capacity',
  handover_primary_operations_duty: 'Assigned the duty owner',
  reset_user_password: 'Reset an account password',
  archive_user: 'Archived an account',
  update_user: 'Updated an account',

  // Result check
  result_check_verified: 'Report opened',
  parent_link_verified: 'Parent verified their own link',
  result_check_code_accepted: 'Code accepted — parent setup required',
  result_check_pending: 'Report not published yet',
  result_check_blocked: 'Report access blocked',
  result_check_not_found: 'Unknown result code',
  result_check_print: 'Report printed',
  result_check_download: 'Report downloaded',
  result_check_resend_logins: 'Portal logins resent',
  result_check_error: 'Result check failed',
  result_check_print_blocked: 'Print blocked',
  result_check_download_blocked: 'Download blocked',
  code_sent: 'Verification code sent',

  // Payments / finance
  approve_payment: 'Approved a payment',
  payment_approved: 'Approved a payment',
  payment_rejected: 'Rejected a payment',
  payment_attempt_started: 'Started a payment attempt',
  payment_settled: 'Payment settled',
  payment_attempt_voided: 'Voided a payment attempt',
  payment_refunded: 'Refunded a payment',
  payment_refund_requested: 'Requested a refund',
  payment_refund_failed: 'Refund failed at gateway',
  paystack_refund_recovery_requested: 'Retried a refund with Paystack',
  mark_paid: 'Marked an invoice paid',
  invoice_marked_paid: 'Marked an invoice paid',
  invoice_payment_proof_submitted: 'Submitted payment proof',
  invoice_payment_proof_approved: 'Approved payment proof',
  invoice_payment_proof_rejected: 'Rejected payment proof',
  invoice_payment_proof_needs_more: 'Requested more payment proof info',
  invoice_cancelled: 'Cancelled an invoice',
  invoice_created: 'Created an invoice',
  invoice_updated: 'Updated an invoice',
  invoice_reminder_sent: 'Sent an invoice reminder',
  delete_receipt: 'Deleted a receipt',
  receipt_issued: 'Issued a receipt',
  receipt_resent: 'Resent a receipt',
  cancel_duplicate_school_invoice: 'Cancelled a duplicate school invoice',
  finance_reconciliation_backfill_allocations: 'Repaired missing payment allocations',
  finance_reconciliation_repair_receipt: 'Repaired a missing receipt',
  finance_reconciliation_dismiss: 'Dismissed a reconciliation finding',
  billing_cycle_marked_paid: 'Marked a billing cycle paid',
  settlement_created: 'Created a school settlement',
  settlement_marked_paid: 'Marked a school settlement paid',
  settlement_voided: 'Voided a school settlement',

  // ID cards
  card_issued: 'Issued an ID card',
  card_revoked: 'Revoked an ID card',
  card_restored: 'Restored an ID card',
  card_reissued: 'Reissued an ID card',
  card_expired: 'Marked an ID card expired',

  // Parents
  parent_student_linked: 'Linked a parent to a student',
  parent_student_unlinked: 'Unlinked a parent from a student',
  parent_claim_code_sent: 'Verification code sent',
  parent_claim_code_delivery_failed: 'Verification code delivery needs attention',
  parent_claim_otp_failed: 'Verification attempt unsuccessful',
  parent_claim_otp_verified: 'Parent identity verified',
  parent_claim_completion_failed: 'Parent setup needs attention',
  parent_claim_linked: 'Linked a parent to a student',
  parent_claim_blocked: 'Parent claim safely blocked',
  parent_claim_unlinked: 'Removed a parent-student link',

  // Academic decisions — what a school is answerable for
  'curriculum.certified': 'Certified a curriculum as the official edition',
  'curriculum.status_changed': 'Changed an official edition status',
  'curriculum.adopted_by_school': 'Gave a school the official edition',
  'curriculum.adoption_changed': 'Moved a school to a different edition',
  'curriculum.adoption_withdrawn': 'Withdrew an edition from a school',
  'curriculum.pathway_direction_assigned':
    'Gave a bootcamp or online pathway its own edition',
  'curriculum.pathway_direction_changed':
    'Changed the edition a pathway teaches',
  'curriculum.pathway_direction_withdrawn':
    'Withdrew an edition from a pathway',
  'class.reclassified': 'Moved a class to a different programme or period',
  'certificate.issued': 'Issued a certificate',
  'certificate.status_changed': 'Changed a certificate status',
  'result.published': 'Published a result',
  'result.withdrawn': 'Withdrew a published result',
  'result.recalculated': 'Recalculated a result from recorded evidence',
  'academic.schema_maintenance': 'Academic system maintenance',

  // Single progress-report staff actions
  publish_progress_report: 'Published a progress report',
  unpublish_progress_report: 'Unpublished a progress report',
  delete_progress_report: 'Deleted a progress report',

  // Consent / parent portals
  consent_submitted: 'Consent form submitted',
  consent_match_approved: 'Approved a consent match',
  consent_match_rejected: 'Rejected a consent match',
  consent_lead_reverted: 'Reverted a consent lead',
  consent_portal_created: 'Created a parent portal from consent',
  consent_child_linked: 'Linked a child from consent',
  consent_portal_unlinked: 'Unlinked a consent portal',
  consent_portal_removed: 'Removed a consent portal',
  consent_credentials_resent: 'Resent consent portal logins',
  consent_bulk_portal_created: 'Bulk-created consent portals',
  consent_bulk_portal_reused: 'Reused an existing consent portal',
  integrity_consent_link_pruned: 'Cleaned an invalid consent link',
  integrity_consent_approval_downgraded: 'Downgraded a consent approval',
  integrity_consent_ownership_conflict: 'Flagged a consent ownership conflict',
};

const FRIENDLY_VALUE_KEYS = [
  'summary',
  'student_name',
  'full_name',
  'parent_name',
  'school_name',
  'name',
  'class_name',
  'receipt_number',
  'invoice_number',
  'report_id_short',
  'report_label',
  'term',
  'reason',
  'status',
  'role',
  'email',
  'amount',
  'currency',
  'enrollment_type',
  'published',
  'skipped',
  'deleted',
  'requested',
  'students_onboarded',
  'access_method_label',
  'viewer_name',
] as const;

const SKIP_KEYS = new Set([
  'school_id',
  'portal_user_id',
  'student_id',
  'parent_id',
  'user_id',
  'actor_id',
  'transaction_id',
  'proof_id',
  'form_id',
  'lead_id',
  'candidate_id',
  'report_id',
  'latest_report_id',
  'reportIds',
  'refund_id',
  'bank_id',
  'code_present',
  'code_format_valid',
  'code_suffix',
  'result',
  'viewer',
  'viewer_role',
  'access_method',
  'code_kind',
  'code_kind_label',
  'ip',
  'user_agent',
  'linked_existing_account',
  'created_account',
  'match_status',
  'email_sent',
  'whatsapp_sent',
  'channels',
]);

function looksTechnical(text: string): boolean {
  if (!text.trim()) return true;
  if (/[{}\[\]]/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text.trim())) return true;
  if (/_id\b|uuid|0x/i.test(text) && text.length < 80) return true;
  return false;
}

function shortId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.replace(/-/g, '');
  if (cleaned.length < 8) return value.slice(0, 8).toUpperCase();
  return cleaned.slice(0, 8).toUpperCase();
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function formatMoney(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== 'number' && typeof amount !== 'string') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'NGN';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${cur} ${n.toLocaleString()}`;
  }
}

function resultCheckMethodSuffix(
  context?: { new_values?: Record<string, unknown> | null } | null,
): string {
  const nv = context?.new_values;
  if (!nv || typeof nv !== 'object') return '';
  const label = pickString(nv as Record<string, unknown>, ['access_method_label']);
  if (label) return ` · ${label}`;
  const method = pickString(nv as Record<string, unknown>, ['access_method']);
  if (method === 'qr') return ' · QR code scan';
  if (method === 'typed') return ' · typed RC number';
  if (method === 'link') return ' · shared link';
  return '';
}

export function humanizeAuditAction(
  action: string,
  context?: { new_values?: Record<string, unknown> | null } | null,
): string {
  // Legacy rows logged "no published report" under result_check_blocked — show the soft label.
  if (
    action === 'result_check_blocked' &&
    context?.new_values &&
    context.new_values.result === 'no_published_reports'
  ) {
    return ACTION_PHRASES.result_check_pending + resultCheckMethodSuffix(context);
  }
  if (ACTION_PHRASES[action]) {
    const base = ACTION_PHRASES[action];
    return action.startsWith('result_check_') ? base + resultCheckMethodSuffix(context) : base;
  }
  if (action.startsWith('result_check_')) {
    const words = action.replace(/^result_check_/, '').replace(/[_.-]+/g, ' ').trim();
    const base = words ? `Result check · ${words}` : 'Result check';
    return base + resultCheckMethodSuffix(context);
  }
  if (action.startsWith('finance_reconciliation_')) {
    const words = action.replace(/^finance_reconciliation_/, '').replace(/[_.-]+/g, ' ').trim();
    return words ? `Reconciliation · ${words}` : 'Reconciliation repair';
  }
  const words = (action || 'action').replace(/[_.-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isResultCheckAction(action: string | null | undefined): boolean {
  return !!action && action.startsWith('result_check_');
}

/** Build a readable details line for any audit row (old or new). */
export function formatAuditDetail(log: AuditLike): string | null {
  const action = log.action || '';
  const ov = log.old_value?.trim() || null;
  const nv = log.new_value?.trim() || null;
  const m = (log.new_values && typeof log.new_values === 'object' ? log.new_values : null) as Record<string, unknown> | null;
  const old = (log.old_values && typeof log.old_values === 'object' ? log.old_values : null) as Record<string, unknown> | null;

  if (typeof m?.summary === 'string' && m.summary.trim()) return m.summary.trim();
  if (nv && !looksTechnical(nv)) {
    if (ov && !looksTechnical(ov) && ov !== nv && /grade|score|mark/i.test(action)) {
      return `Score ${ov} → ${nv}`;
    }
    if (ov && !looksTechnical(ov) && /delete_receipt|cancel_duplicate/i.test(action)) {
      return `${ov}${nv ? ` · ${nv}` : ''}`;
    }
    return nv;
  }
  if (ov && nv && !looksTechnical(ov) && !looksTechnical(nv)) return `${ov} → ${nv}`;
  if (ov && !looksTechnical(ov)) return ov;

  if (isResultCheckAction(action) && m) {
    const student = pickString(m, ['student_name', 'full_name']);
    const school = pickString(m, ['school_name']);
    const reportId = pickString(m, ['report_id_short']) || shortId(m.latest_report_id || m.report_id);
    const label = pickString(m, ['report_label']);
    const parts = [
      student ? `Student: ${student}` : null,
      school ? `School: ${school}` : null,
      reportId ? `Report ID: ${reportId}` : null,
      label,
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }

  if (/payment|invoice|receipt|refund|mark_paid|proof/i.test(action)) {
    const money = formatMoney(m?.amount, m?.currency);
    const inv = pickString(m, ['invoice_number']) || pickString(old, ['invoice_number']);
    const receipt = pickString(m, ['receipt_number']) || (ov && /RCP|RCT|REC/i.test(ov) ? ov.split('·')[0]?.trim() : null);
    const reason = pickString(m, ['reason']) || (nv && !looksTechnical(nv) ? nv : null);
    const status = pickString(m, ['status']);
    const parts = [
      inv ? `Invoice ${inv}` : null,
      receipt ? `Receipt ${receipt}` : null,
      money,
      status ? `Status: ${status}` : null,
      reason ? `Reason: ${reason}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }

  if (/student|school|consent|portal|registration/i.test(action)) {
    const student = pickString(m, ['student_name', 'full_name']) || pickString(old, ['student_name', 'full_name']);
    const school = pickString(m, ['school_name']) || pickString(old, ['school_name']);
    const email = pickString(m, ['email']) || pickString(old, ['email']);
    const role = pickString(m, ['role']) || pickString(old, ['role']);
    const enrollment = pickString(m, ['enrollment_type']);
    const count =
      typeof m?.published === 'number' ? `${m.published} published` :
      typeof m?.students_onboarded === 'number' ? `${m.students_onboarded} students onboarded` :
      typeof m?.deleted === 'number' ? `${m.deleted} deleted` :
      Array.isArray(old?.deleted) ? `${(old!.deleted as unknown[]).length} deleted` :
      null;
    const parts = [
      student ? `Student: ${student}` : null,
      school ? `School: ${school}` : null,
      role ? `Role: ${role}` : null,
      enrollment ? `Programme: ${enrollment}` : null,
      email ? `Email: ${email}` : null,
      count,
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }

  if (m) {
    const parts: string[] = [];
    for (const key of FRIENDLY_VALUE_KEYS) {
      if (key === 'summary') continue;
      if (SKIP_KEYS.has(key)) continue;
      const v = m[key];
      if (v == null || typeof v === 'object') continue;
      const text = String(v).trim();
      if (!text || looksTechnical(text)) continue;
      parts.push(`${key.replace(/_/g, ' ')}: ${text}`);
      if (parts.length >= 4) break;
    }
    if (parts.length) return parts.join(' · ');
  }

  if (nv && !looksTechnical(nv)) return nv;
  return null;
}

export function formatAuditItem(log: AuditLike): string {
  const m = log.new_values && typeof log.new_values === 'object' ? log.new_values : null;
  const old = log.old_values && typeof log.old_values === 'object' ? log.old_values : null;

  if (isResultCheckAction(log.action) && m) {
    const student = pickString(m, ['student_name', 'full_name']);
    const school = pickString(m, ['school_name']);
    if (student && school) return `${student} · ${school}`;
    if (student) return student;
    if (school) return school;
    return 'Student report';
  }

  const name =
    pickString(m, ['student_name', 'full_name', 'school_name', 'name', 'invoice_number', 'receipt_number', 'class_name']) ||
    pickString(old, ['student_name', 'full_name', 'school_name', 'name']) ||
    (log.old_value && !looksTechnical(log.old_value) ? log.old_value.split('·')[0]?.trim() : null);

  if (name) return name;

  const resource = (log.resource_type || log.table_name || '—').toString().replace(/[_./]+/g, ' ').trim();
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

export function formatAuditWho(
  log: AuditLike & { portal_users?: { full_name?: string; email?: string; role?: string } | null },
): { title: string; subtitle: string | null } {
  const nv = (log.new_values && typeof log.new_values === 'object' ? log.new_values : null) as Record<string, unknown> | null;
  const user = log.portal_users;
  const viewer = pickString(nv, ['viewer']);
  // Prefer the role stamped on the event — never let a joined portal_users row
  // (or missing visitor_role) make a public scan look like Admin.
  const explicitRole = pickString(nv, ['viewer_role']);
  const viewerRole = explicitRole || (
    viewer && /^(Admin|Teacher|School|Linked parent|Visitor)\b/i.test(viewer)
      ? null
      : user?.role
  ) || null;
  const viewerName = pickString(nv, ['viewer_name']) || (
    explicitRole && ['admin', 'teacher', 'school'].includes(explicitRole) ? user?.full_name : null
  ) || null;
  const access = getAuditAccessMethod(log);
  const codeKind = pickString(nv, ['code_kind_label']);

  if (isResultCheckAction(log.action)) {
    const methodLine = [access.label, codeKind].filter(Boolean).join(' · ');
    if (viewerRole === 'admin' || /^Admin\b/i.test(viewer || '')) {
      return {
        title: viewerName ? `Admin · ${viewerName}` : (viewer || 'Admin'),
        subtitle: methodLine || 'Staff login',
      };
    }
    if (viewerRole === 'teacher' || /^Teacher\b/i.test(viewer || '')) {
      return {
        title: viewerName ? `Teacher · ${viewerName}` : (viewer || 'Teacher'),
        subtitle: methodLine || 'Staff login',
      };
    }
    if (viewerRole === 'school' || /^School\b/i.test(viewer || '')) {
      return {
        title: viewerName ? `School staff · ${viewerName}` : (viewer || 'School staff'),
        subtitle: methodLine || 'Staff login',
      };
    }
    // "Code holder" is an anonymous viewer of an already-claimed child — it carries
    // viewer_role 'visitor' and must be tested BEFORE the parent branch, since older
    // rows are matched on the label text alone.
    if (/code holder/i.test(viewer || '')) {
      return {
        title: viewer || 'Code holder',
        subtitle: methodLine || 'Valid card number — not a signed-in parent',
      };
    }
    if (viewerRole === 'parent' || /linked parent/i.test(viewer || '')) {
      return {
        title: viewer || 'Linked parent',
        // Rows written before the viewer/child distinction existed said "Linked parent"
        // for anonymous code holders too, so they cannot be read as proof of a parent.
        subtitle: methodLine || (/signed in/i.test(viewer || '') ? 'Parent access' : 'Parent access (unverified on legacy rows)'),
      };
    }
    if (viewerRole === 'visitor' || /^Visitor\b/i.test(viewer || '')) {
      return {
        title: viewer || 'Visitor',
        subtitle: methodLine || 'Public result check',
      };
    }
    if (user?.full_name && explicitRole && ['admin', 'teacher', 'school'].includes(explicitRole)) {
      const roleTitle =
        explicitRole === 'admin' ? 'Admin'
        : explicitRole === 'teacher' ? 'Teacher'
        : 'School staff';
      return {
        title: `${roleTitle} · ${user.full_name}`,
        subtitle: methodLine || user.email || null,
      };
    }
    return {
      title: viewer || 'Visitor',
      subtitle: methodLine || 'Public result check',
    };
  }

  if (user?.full_name) {
    return { title: user.full_name, subtitle: user.email || user.role || null };
  }
  if (/consent_submitted/i.test(log.action)) {
    return { title: 'Parent / guardian (public form)', subtitle: 'Not a staff login' };
  }
  return { title: 'System / automatic', subtitle: null };
}

export type AuditAccessMethod = 'qr' | 'typed' | 'link' | 'unknown' | null;

export function getAuditAccessMethod(log: AuditLike): {
  method: AuditAccessMethod;
  label: string | null;
  shortLabel: string | null;
} {
  const nv = (log.new_values && typeof log.new_values === 'object' ? log.new_values : null) as Record<string, unknown> | null;
  const raw = pickString(nv, ['access_method'])?.toLowerCase() || null;
  const label = pickString(nv, ['access_method_label']);
  if (raw === 'qr' || raw === 'typed' || raw === 'link' || raw === 'unknown') {
    return {
      method: raw,
      label: label || (raw === 'qr' ? 'QR code scan' : raw === 'typed' ? 'Typed RC number' : raw === 'link' ? 'Shared link' : null),
      shortLabel: raw === 'qr' ? 'QR scan' : raw === 'typed' ? 'Typed number' : raw === 'link' ? 'Shared link' : null,
    };
  }
  if (label) {
    const lower = label.toLowerCase();
    const method: AuditAccessMethod =
      lower.includes('qr') ? 'qr'
      : lower.includes('typed') || lower.includes('number') ? 'typed'
      : lower.includes('link') ? 'link'
      : 'unknown';
    return { method, label, shortLabel: method === 'qr' ? 'QR scan' : method === 'typed' ? 'Typed number' : method === 'link' ? 'Shared link' : label };
  }
  return { method: null, label: null, shortLabel: null };
}

/** Action title without the " · QR code scan" suffix (method shown as its own chip in the UI). */
export function humanizeAuditActionBase(
  action: string,
  context?: { new_values?: Record<string, unknown> | null } | null,
): string {
  return humanizeAuditAction(action, context).replace(/\s·\s(QR code scan|typed RC number|shared link|result check)$/i, '');
}

export function getAuditViewerRole(
  log: AuditLike & { portal_users?: { role?: string } | null },
): 'admin' | 'teacher' | 'school' | 'parent' | 'visitor' | 'staff' | 'system' {
  const nv = (log.new_values && typeof log.new_values === 'object' ? log.new_values : null) as Record<string, unknown> | null;
  const explicit = (pickString(nv, ['viewer_role']) || '').toLowerCase();
  const viewer = pickString(nv, ['viewer']) || '';

  if (explicit === 'admin' || explicit === 'teacher' || explicit === 'school' || explicit === 'parent' || explicit === 'visitor') {
    return explicit;
  }
  if (/^Admin\b/i.test(viewer)) return 'admin';
  if (/^Teacher\b/i.test(viewer)) return 'teacher';
  if (/^School\b/i.test(viewer)) return 'school';
  if (/code holder/i.test(viewer)) return 'visitor';
  if (/linked parent/i.test(viewer)) return 'parent';
  if (/^Visitor\b/i.test(viewer) || /public result check/i.test(viewer)) return 'visitor';

  // Only fall back to the joined portal user for confirmed staff actors.
  const joined = (log.portal_users?.role || '').toLowerCase();
  if (joined === 'admin' || joined === 'teacher' || joined === 'school') {
    // Result-check public scans must not inherit Admin from a bad join / legacy row.
    if (isResultCheckAction(log.action) && !log.user_id) {
      return 'visitor';
    }
    return joined;
  }
  if (isResultCheckAction(log.action)) return 'visitor';
  if (log.portal_users?.role) return 'staff';
  return 'system';
}

/** Plain-language fact rows for the audit inspector (result checks and general). */
export function formatAuditFacts(
  log: AuditLike & { portal_users?: { full_name?: string; email?: string; role?: string } | null },
): Array<{ label: string; value: string }> {
  const nv = (log.new_values && typeof log.new_values === 'object' ? log.new_values : null) as Record<string, unknown> | null;
  const who = formatAuditWho(log);
  const access = getAuditAccessMethod(log);
  const facts: Array<{ label: string; value: string }> = [];

  facts.push({ label: 'What happened', value: humanizeAuditAction(log.action, log) });
  facts.push({ label: 'Who', value: who.subtitle ? `${who.title} (${who.subtitle})` : who.title });

  if (isResultCheckAction(log.action)) {
    const student = pickString(nv, ['student_name', 'full_name']);
    const school = pickString(nv, ['school_name']);
    const reportId = pickString(nv, ['report_id_short']) || shortId(nv?.report_id || nv?.latest_report_id);
    const reportLabel = pickString(nv, ['report_label']);
    const codeKind = pickString(nv, ['code_kind_label']);
    const codeSuffix = pickString(nv, ['code_suffix']);
    if (access.label) facts.push({ label: 'How accessed', value: access.label });
    if (codeKind) facts.push({ label: 'Code type', value: codeKind });
    if (codeSuffix) facts.push({ label: 'Code ending', value: `…${codeSuffix}` });
    if (student) facts.push({ label: 'Student', value: student });
    if (school) facts.push({ label: 'School', value: school });
    if (reportId) facts.push({ label: 'Report ID', value: reportId });
    if (reportLabel) facts.push({ label: 'Report period', value: reportLabel });
    const summary = pickString(nv, ['summary']);
    if (summary) facts.push({ label: 'Summary', value: summary });
    return facts;
  }

  const detail = formatAuditDetail(log);
  if (detail) facts.push({ label: 'Details', value: detail });
  const target = formatAuditItem(log);
  if (target && target !== '—') facts.push({ label: 'Target', value: target });
  if (log.portal_users?.email) facts.push({ label: 'Account email', value: log.portal_users.email });
  return facts;
}
