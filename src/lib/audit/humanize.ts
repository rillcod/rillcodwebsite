/**
 * Plain-English formatting for audit trail rows.
 * Prefer human names, schools, receipt/invoice numbers — never raw UUIDs / JSON dumps.
 */

export type AuditLike = {
  action: string;
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
  update_platform_settings: 'Updated platform settings',
  'program.update': 'Updated a programme',
  'program.delete': 'Deleted a programme',

  // Learning
  delete_recording: 'Deleted a class recording',
  delete_submission: 'Deleted a submission',
  grade_submission: 'Graded a submission',
  accept_ai_grade: 'Accepted an AI grade',
  override_grade: 'Overrode a grade',
  'assignment_submission.ai_suggest': 'Ran AI grading suggestions',
  publish_progress_reports: 'Published progress reports',
  queue_class_broadcast: 'Queued a class broadcast',

  // Result check
  result_check_verified: 'Report opened',
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
  payment_refunded: 'Refunded a payment',
  payment_refund_requested: 'Requested a refund',
  paystack_refund_recovery_requested: 'Retried a refund with Paystack',
  mark_paid: 'Marked an invoice paid',
  invoice_marked_paid: 'Marked an invoice paid',
  invoice_payment_proof_approved: 'Approved payment proof',
  delete_receipt: 'Deleted a receipt',
  cancel_duplicate_school_invoice: 'Cancelled a duplicate school invoice',
  finance_reconciliation_backfill_allocations: 'Repaired missing payment allocations',
  finance_reconciliation_repair_receipt: 'Repaired a missing receipt',
  finance_reconciliation_dismiss: 'Dismissed a reconciliation finding',

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
    return ACTION_PHRASES.result_check_pending;
  }
  if (ACTION_PHRASES[action]) return ACTION_PHRASES[action];
  if (action.startsWith('result_check_')) {
    const words = action.replace(/^result_check_/, '').replace(/[_.-]+/g, ' ').trim();
    return words ? `Result check · ${words}` : 'Result check';
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
  const user = log.portal_users;
  if (user?.full_name) {
    return { title: user.full_name, subtitle: user.email || user.role || null };
  }
  if (isResultCheckAction(log.action)) {
    const viewer = pickString(log.new_values as Record<string, unknown> | null, ['viewer'])
      || 'Parent or visitor (public result check)';
    return { title: viewer, subtitle: 'Not a staff login' };
  }
  if (/consent_submitted/i.test(log.action)) {
    return { title: 'Parent / guardian (public form)', subtitle: 'Not a staff login' };
  }
  return { title: 'System / automatic', subtitle: null };
}
