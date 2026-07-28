import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { compareReportsByPeriodDesc } from '@/lib/reports/academic-period';
import { getResultConsentAccessStatus } from '@/lib/consent/result-access';
import { isParentCaptured } from '@/lib/parent-claim/captured';
import { backfillParentLinkFromConsent } from '@/lib/parent-claim/consent-backfill';
import { getStudentRecordGaps } from '@/lib/parent-claim/record-enrichment';
import { resolveStudentFromCode } from '@/lib/parent-claim/resolve';
import { logAudit } from '@/lib/audit/log';
import { resolveLinkedPortalAccess, resendPortalLoginsForScan } from '@/lib/parent-claim/portal-access';
import { resolveStaffResultBypass, type StaffBypassResult } from '@/lib/parent-claim/staff-bypass';
import { accessCardCodeBody, accessCardCodeForStudent, accessCardCodeMatchesStudent, isStudentPortalUuid, normalizeAccessCardCode, NUMERIC_CODE_SOURCE } from '@/lib/access-card-code';
import { toPublicProgressReportList, type PublicProgressReportDbRow, PUBLIC_PROGRESS_REPORT_SELECT } from '@/lib/reports/public-dto';
import { toPublicStudentIdentity } from '@/lib/public/student-identity';
import type { Database, Json } from '@/types/supabase';

const RESULT_ACCESS_RESOURCE = 'student_result_access';
const STUDENT_SELECT = 'id, full_name, school_name, school_id, is_active, enrollment_type, avatar_url, section_class, class_id, created_at' as const;

type AdminDb = ReturnType<typeof createAdminClient>;
type PortalUserRow = Database['public']['Tables']['portal_users']['Row'];
type StudentAccessRow = Pick<
  PortalUserRow,
  'id' | 'full_name' | 'school_name' | 'school_id' | 'is_active' | 'enrollment_type' | 'avatar_url' | 'section_class' | 'class_id' | 'created_at'
>;
type ProgressReportRow = Database['public']['Tables']['student_progress_reports']['Row'];
type ResultAccessCodeInsert = Database['public']['Tables']['result_access_codes']['Insert'];
type AuditDetails = Record<string, Json | undefined>;
type AccessMethod = 'qr' | 'typed' | 'link' | 'unknown';

function shortReportId(id: string | null | undefined): string | null {
  if (!id) return null;
  return String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
}

function resolveAccessMethod(raw: string | null | undefined, codeHint?: string | null): AccessMethod {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'qr' || v === 'scan' || v === 'camera') return 'qr';
  if (v === 'typed' || v === 'number' || v === 'manual' || v === 'keypad') return 'typed';
  if (v === 'link' || v === 'shared') return 'link';
  // UUID portal IDs almost always arrive from a scanned QR / deep link, not the keypad.
  if (isStudentPortalUuid(codeHint)) return 'qr';
  // Keypad always tags via=typed. Untagged RC paths are card QR / deep links (incl. older cards).
  if (normalizeAccessCardCode(codeHint)) return 'qr';
  return 'unknown';
}

function accessMethodLabel(method: AccessMethod): string {
  switch (method) {
    case 'qr': return 'QR code scan';
    case 'typed': return 'typed RC number';
    case 'link': return 'shared link';
    default: return 'result check';
  }
}

function classifyCodeKind(raw: string | null | undefined): string {
  if (isStudentPortalUuid(raw)) return 'uuid_card';
  const normalized = normalizeAccessCardCode(raw);
  if (!normalized) return 'unknown';
  const body = normalized.replace(/^RC-/i, '');
  if (/^\d{8}$/.test(body)) return 'numeric';
  if (/^[A-Z0-9]{8}$/i.test(body)) return 'legacy';
  return 'other';
}

function reportPeriodLabel(report: Pick<ProgressReportRow, 'report_period' | 'report_term' | 'course_name'> | null | undefined): string | null {
  if (!report) return null;
  const period = [report.report_period, report.report_term].filter(Boolean).join(' · ');
  if (period && report.course_name) return `${period} (${report.course_name})`;
  return period || report.course_name || null;
}

async function resolveSchoolDisplayName(
  db: AdminDb,
  schoolId: string | null | undefined,
  fallbackName: string | null | undefined,
): Promise<string | null> {
  const fallback = (fallbackName || '').trim();
  if (fallback) return fallback;
  if (!schoolId) return null;
  try {
    const { data } = await db.from('schools').select('name').eq('id', schoolId).maybeSingle();
    return (data?.name || '').trim() || null;
  } catch {
    return null;
  }
}

function buildResultAccessSummary(entry: {
  action: string;
  studentName?: string | null;
  schoolName?: string | null;
  reportShortId?: string | null;
  reportLabel?: string | null;
  details?: AuditDetails;
  viewer?: ViewerIdentity | null;
  accessMethod?: AccessMethod;
}): string {
  const student = (entry.studentName || '').trim() || 'a student';
  const school = (entry.schoolName || '').trim();
  const atSchool = school ? ` at ${school}` : '';
  const reportParts = [
    entry.reportShortId ? `Report ID ${entry.reportShortId}` : null,
    entry.reportLabel || null,
  ].filter(Boolean);
  const reportBit = reportParts.length ? ` · ${reportParts.join(' · ')}` : '';
  const result = String(entry.details?.result ?? '');
  const via = accessMethodLabel(entry.accessMethod ?? 'unknown');
  const who = (entry.viewer?.label || '').trim();
  const whoBit = who ? `${who} · ` : '';

  if (entry.action === 'result_check_verified') {
    return `${whoBit}Opened the report for ${student}${atSchool} via ${via}${reportBit}`;
  }
  if (entry.action === 'result_check_code_accepted') {
    return `${whoBit}Valid ${via} for ${student}${atSchool}${reportBit} — report locked pending parent setup`;
  }
  if (entry.action === 'result_check_pending' || result === 'no_published_reports') {
    return `${whoBit}Valid ${via} for ${student}${atSchool} — no published report yet`;
  }
  if (entry.action === 'result_check_not_found') {
    return `Someone tried a ${via} that did not match any student`;
  }
  if (entry.action === 'result_check_blocked' || entry.action.endsWith('_blocked')) {
    if (result === 'inactive_student') {
      return `${whoBit}Tried to open the report for ${student}${atSchool} via ${via} — student account is inactive`;
    }
    if (result === 'missing_access_code') {
      return `${whoBit}Tried to open the report for ${student}${atSchool} — access code was missing`;
    }
    if (result === 'student_not_onboarded') {
      return `${whoBit}Valid ${via} for a student number that is not fully onboarded${atSchool}`;
    }
    if (result === 'parent_setup_required') {
      return `${whoBit}Tried to ${entry.action.includes('print') ? 'print' : entry.action.includes('download') ? 'download' : 'act on'} the report for ${student}${atSchool} — parent setup required`;
    }
    return `${whoBit}Tried to open the report for ${student}${atSchool} via ${via} — wrong access code`;
  }
  if (entry.action === 'result_check_print') {
    return `${whoBit}Printed the report for ${student}${atSchool} via ${via}${reportBit}`;
  }
  if (entry.action === 'result_check_download') {
    return `${whoBit}Downloaded the report for ${student}${atSchool} via ${via}${reportBit}`;
  }
  if (entry.action === 'result_check_resend_logins') {
    return `${whoBit}Resent portal login details for ${student}${atSchool}`;
  }
  if (entry.action === 'result_check_error') {
    return `Result check failed for ${student}${atSchool} (${via})`;
  }
  return `${whoBit}Result check for ${student}${atSchool} via ${via}${reportBit}`;
}

type ViewerIdentity = {
  label: string;          // Human-readable: "Admin · Mrs Grace Ogbebor", "Linked Parent", etc.
  actorId: string | null; // Supabase user ID for staff; null for parents/visitors.
  actorRole: string | null;
  actorName: string | null;
};

async function logResultAccessEvent(
  db: ReturnType<typeof createAdminClient>,
  req: NextRequest,
  entry: {
    action: string;
    studentId?: string | null;
    studentName?: string | null;
    schoolId?: string | null;
    schoolName?: string | null;
    reportId?: string | null;
    reportLabel?: string | null;
    rawCode?: string | null;
    details?: AuditDetails;
    viewer?: ViewerIdentity | null;
    accessMethod?: AccessMethod;
  },
) {
  try {
    const schoolName = await resolveSchoolDisplayName(db, entry.schoolId, entry.schoolName);
    const reportShortId = shortReportId(entry.reportId);
    const accessMethod = entry.accessMethod
      ?? resolveAccessMethod(new URL(req.url).searchParams.get('via'), entry.rawCode);
    const viewer = entry.viewer ?? null;
    const summary = buildResultAccessSummary({
      action: entry.action,
      studentName: entry.studentName,
      schoolName,
      reportShortId,
      reportLabel: entry.reportLabel,
      details: entry.details,
      viewer,
      accessMethod,
    });

    const newValues: Json = {
      summary,
      viewer: viewer?.label ?? 'Visitor (public result check)',
      viewer_role: viewer?.actorRole ?? null,
      viewer_name: viewer?.actorName ?? null,
      access_method: accessMethod,
      access_method_label: accessMethodLabel(accessMethod),
      student_name: entry.studentName ?? null,
      school_name: schoolName,
      school_id: entry.schoolId ?? null,
      report_id: entry.reportId ?? null,
      report_id_short: reportShortId,
      report_label: entry.reportLabel ?? null,
      ...auditCodeMetadata(entry.rawCode),
      ...(entry.details ?? {}),
    };

    await logAudit(db as any, {
      action: entry.action,
      actorId: viewer?.actorId ?? null,
      resourceType: RESULT_ACCESS_RESOURCE,
      resourceId: entry.studentId ?? null,
      tableName: entry.studentId ? 'portal_users' : null,
      recordId: entry.studentId ?? null,
      newValue: summary,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      newValues: newValues as Record<string, unknown>,
    });
  } catch (err) {
    console.warn('[result-check audit] failed (non-fatal):', err);
  }
}

function firstNameOnly(fullName: string | null | undefined): string | null {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts[0];
}

function buildReportPendingMessage(firstName: string | null): string {
  if (firstName) {
    return `${firstName}'s coding report is being prepared — keep up the great work! Check back here soon; your school is finalising results and they will appear automatically once published.`;
  }
  return 'Your coding report is being prepared — keep up the great work! Check back here soon; results will appear automatically once your school publishes them.';
}

function publicStudentPayload(
  student: StudentAccessRow,
  options: { includeAccessCode?: boolean; revealIdentity?: boolean } = {},
) {
  const { includeAccessCode = false, revealIdentity = true } = options;
  const payload: Record<string, Json> = {
    ...toPublicStudentIdentity({
      id: student.id,
      full_name: student.full_name,
      school_name: student.school_name,
      is_active: student.is_active,
      enrollment_type: student.enrollment_type,
      avatar_url: student.avatar_url ?? null,
      section_class: student.section_class,
      created_at: student.created_at,
    }, revealIdentity),
  };
  if (includeAccessCode) payload.access_code = accessCardCodeForStudent(student.id);
  return payload;
}

async function studentHasPublishedReports(db: AdminDb, studentUserId: string): Promise<boolean> {
  const { count, error } = await db
    .from('student_progress_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentUserId)
    .eq('is_published', true);
  return !error && (count ?? 0) > 0;
}

async function studentIsOnboarded(db: AdminDb, studentUserId: string): Promise<boolean> {
  const { data } = await db.from('students').select('id').eq('user_id', studentUserId).maybeSingle();
  return !!data?.id;
}

/**
 * Who is actually looking — NOT what state the student is in.
 *
 * `parentCaptured` is a property of the CHILD (a parent link exists). It decides
 * access. It must never decide the label: once any parent has claimed a child,
 * every subsequent RC-number holder opens the report, and labelling those views
 * "Linked parent" recorded anonymous visitors under a real parent's identity in
 * the safeguarding trail. Only a signed-in, linked parent is a parent here.
 */
function buildViewerIdentity(options: {
  staffBypass: StaffBypassResult;
  parentCaptured: boolean;
  sessionAutoLinked: boolean;
  /** The requester is signed in AND linked to this child. */
  viewerIsLinkedParent?: boolean;
}): ViewerIdentity {
  const { staffBypass, parentCaptured, sessionAutoLinked, viewerIsLinkedParent = false } = options;
  if (staffBypass.bypass) {
    const roleLabel =
      staffBypass.actorRole === 'admin' ? 'Admin'
      : staffBypass.actorRole === 'teacher' ? 'Teacher'
      : staffBypass.actorRole === 'school' ? 'School staff'
      : 'Staff';
    const name = (staffBypass.actorName || '').trim() || 'staff member';
    return {
      label: `${roleLabel} · ${name}`,
      actorId: staffBypass.actorId,
      actorRole: staffBypass.actorRole,
      actorName: staffBypass.actorName,
    };
  }
  if (viewerIsLinkedParent) {
    return {
      label: sessionAutoLinked ? 'Linked parent (signed in, auto-matched)' : 'Linked parent (signed in)',
      actorId: null,
      actorRole: 'parent',
      actorName: null,
    };
  }
  if (parentCaptured) {
    // Anonymous holder of a valid RC number for an already-claimed child. Access is
    // granted, but this is not the parent and must not be recorded as one.
    return { label: 'Code holder · child is claimed', actorId: null, actorRole: 'visitor', actorName: null };
  }
  return { label: 'Visitor', actorId: null, actorRole: 'visitor', actorName: null };
}

function auditCodeMetadata(rawCode: string | null | undefined) {
  const normalized = normalizeAccessCardCode(rawCode);
  const kind = classifyCodeKind(rawCode);
  return {
    code_present: !!rawCode,
    code_format_valid: !!normalized || !!isStudentPortalUuid(rawCode),
    code_suffix: normalized ? normalized.slice(-4) : (isStudentPortalUuid(rawCode)?.slice(-4) ?? null),
    code_kind: kind,
    code_kind_label:
      kind === 'numeric' ? '8-digit RC number'
      : kind === 'legacy' ? 'legacy RC code'
      : kind === 'uuid_card' ? 'UUID card QR'
      : kind === 'other' ? 'other code'
      : 'unknown code',
  };
}

async function lookupCachedStudent(db: AdminDb, accessCode: string): Promise<StudentAccessRow | null> {
  try {
    const { data: cached, error } = await db
      .from('result_access_codes')
      .select('student_id')
      .eq('access_code', accessCode)
      .maybeSingle();

    if (error || !cached?.student_id) return null;

    const { data: student, error: studentError } = await db
      .from('portal_users')
      .select(STUDENT_SELECT)
      .eq('role', 'student')
      .neq('is_deleted', true)
      .eq('id', cached.student_id)
      .maybeSingle();

    if (studentError || !student) return null;
    return student;
  } catch {
    return null;
  }
}

async function cacheStudentAccessCode(db: AdminDb, student: StudentAccessRow) {
  try {
    const accessCode = accessCardCodeForStudent(student.id);
    if (!accessCode) return;
    const row: ResultAccessCodeInsert = {
      student_id: student.id,
      school_id: student.school_id ?? null,
      access_code: accessCode,
      code_source: NUMERIC_CODE_SOURCE,
      updated_at: new Date().toISOString(),
    };
    await db.from('result_access_codes').upsert(row, { onConflict: 'student_id' });
  } catch {
    // Cache warm-up is an optimization only. The public flow must keep working
    // even before the migration exists in an environment.
  }
}

// Resolve the student behind a report code or ID-card code (student_progress_reports /
// identity_cards verification_code) — the "dual purpose" path so /result-check serves
// ID-card + result scans, not only RC- access codes.
async function resolveStudentByCredential(db: AdminDb, rawId: string): Promise<StudentAccessRow | null> {
  const viaCredential = await resolveStudentFromCode(db as any, rawId);
  if (!viaCredential) return null;
  const { data } = await db
    .from('portal_users')
    .select(STUDENT_SELECT)
    .eq('role', 'student')
    .neq('is_deleted', true)
    .eq('id', viaCredential)
    .limit(1);
  if (data && data.length === 1) {
    await cacheStudentAccessCode(db, data[0]);
    return data[0];
  }
  return null;
}

async function resolveStudent(db: AdminDb, rawId: string): Promise<StudentAccessRow | null> {
  let decoded = rawId || '';
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    decoded = String(rawId || '').trim();
  }
  const decodedUuid = isStudentPortalUuid(decoded);
  const codeBody = accessCardCodeBody(rawId);
  // Not a UUID and not an 8-char RC body → treat it as a report/ID-card credential code.
  if (!decodedUuid && codeBody.length !== 8) return resolveStudentByCredential(db, rawId);

  const normalizedCode = normalizeAccessCardCode(rawId);
  if (!decodedUuid && normalizedCode) {
    const cachedStudent = await lookupCachedStudent(db, normalizedCode);
    if (cachedStudent) return cachedStudent;
  }

  const query = db
    .from('portal_users')
    .select(STUDENT_SELECT)
    .eq('role', 'student')
    .neq('is_deleted', true);

  if (decodedUuid) {
    const { data, error } = await query.eq('id', decodedUuid).limit(1);
    if (error || !data || data.length !== 1) return null;
    await cacheStudentAccessCode(db, data[0]);
    return data[0];
  }

  const matches: StudentAccessRow[] = [];
  for (let from = 0; matches.length < 2; from += 1000) {
    const { data, error } = await db
      .from('portal_users')
      .select(STUDENT_SELECT)
      .eq('role', 'student')
      .neq('is_deleted', true)
      .range(from, from + 999);
    if (error || !data) return null;
    for (const student of data) {
      const studentId = String(student.id);
      if (accessCardCodeMatchesStudent(`RC-${codeBody}`, studentId)) {
        matches.push(student);
      }
      if (matches.length > 1) break;
    }
    if (data.length < 1000) break;
  }
  if (matches.length === 1) await cacheStudentAccessCode(db, matches[0]);
  return matches.length === 1 ? matches[0] : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await checkCustomRateLimit({ key: `public-student-results:${getClientIp(req)}`, max: 20, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many scans. Please wait before trying again.', retryAfter: 60 },
        { status: 429 },
      );
    }
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing student code' }, { status: 400 });

  const db = createAdminClient();
  const { searchParams } = new URL(req.url);
  const accessCodeParam = searchParams.get('accessCode');
  const accessMethod = resolveAccessMethod(searchParams.get('via'), accessCodeParam ?? id);

  // Defense-in-depth: any unexpected throw below must return a clean JSON error, never an
  // empty-body 500 that the public page renders as "Result Access Not Verified".
  try {
  const student = await resolveStudent(db, id);
  if (!student) {
    await logResultAccessEvent(db, req, {
      action: 'result_check_not_found',
      rawCode: accessCodeParam ?? id,
      accessMethod,
      details: { result: 'student_not_found' },
    });
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (student.is_active === false) {
    const staffEarly = await resolveStaffResultBypass(db, student.school_id);
    await logResultAccessEvent(db, req, {
      action: 'result_check_blocked',
      studentId: student.id,
      studentName: student.full_name,
      schoolId: student.school_id,
      schoolName: student.school_name,
      rawCode: accessCodeParam ?? id,
      accessMethod,
      viewer: buildViewerIdentity({ staffBypass: staffEarly, parentCaptured: false, sessionAutoLinked: false }),
      details: { result: 'inactive_student' },
    });
    return NextResponse.json({ error: 'This student account is not active.' }, { status: 403 });
  }

  const expectedCode = accessCardCodeForStudent(student.id);
  const providedCode = normalizeAccessCardCode(accessCodeParam);
  let authorized = !!providedCode && accessCardCodeMatchesStudent(providedCode, student.id);
  if (!authorized && providedCode === expectedCode) authorized = true;
  if (!authorized) {
    // A valid report code or ID-card code for THIS student authorizes too — that's what
    // makes /result-check the single home for both ID-card and result scans.
    const viaCredential = await resolveStudentFromCode(db as any, accessCodeParam ?? id);
    if (viaCredential && viaCredential === student.id) authorized = true;
  }
  if (!authorized) {
    // Backward-compat: the OLDEST cards encoded the student's raw UUID as the scannable
    // code (QR → /verify/<uuid>). Possessing that UUID — which resolves to exactly this
    // student — authorizes viewing their published results, the same as the RC code does
    // for newer cards. The UUID is v4-random (not enumerable) and is no longer echoed by
    // any public endpoint, so this keeps legacy cards working without a broad exposure.
    const rawUuid = isStudentPortalUuid(accessCodeParam ?? id);
    if (rawUuid && rawUuid === String(student.id).toLowerCase()) authorized = true;
  }
  if (!authorized) {
    const staffEarly = await resolveStaffResultBypass(db, student.school_id);
    await logResultAccessEvent(db, req, {
      action: 'result_check_blocked',
      studentId: student.id,
      studentName: student.full_name,
      schoolId: student.school_id,
      schoolName: student.school_name,
      rawCode: accessCodeParam,
      accessMethod,
      viewer: buildViewerIdentity({ staffBypass: staffEarly, parentCaptured: false, sessionAutoLinked: false }),
      details: { result: accessCodeParam ? 'invalid_access_code' : 'missing_access_code' },
    });
    return NextResponse.json(
      {
        accessRequired: true,
        error: accessCodeParam ? 'Invalid result access code' : 'Result access code required',
      },
      { status: accessCodeParam ? 403 : 401 },
    );
  }

  const onboarded = await studentIsOnboarded(db, student.id);
  if (!onboarded) {
    const staffEarly = await resolveStaffResultBypass(db, student.school_id);
    await logResultAccessEvent(db, req, {
      action: 'result_check_blocked',
      studentId: student.id,
      studentName: student.full_name,
      schoolId: student.school_id,
      schoolName: student.school_name,
      rawCode: accessCodeParam ?? id,
      accessMethod,
      viewer: buildViewerIdentity({ staffBypass: staffEarly, parentCaptured: false, sessionAutoLinked: false }),
      details: { result: 'student_not_onboarded' },
    });
    return NextResponse.json(
      { error: 'This student number is not active yet. Contact your school or Rillcod admin.' },
      { status: 404 },
    );
  }

  const hasPublishedReports = await studentHasPublishedReports(db, student.id);
  if (!hasPublishedReports) {
    const firstName = firstNameOnly(student.full_name);
    const linkExistsPending = await isParentCaptured(db, student.id);
    const staffBypassPending = await resolveStaffResultBypass(db, student.school_id);
    const { resolveLoggedInParentCapture } = await import('@/lib/parent-claim/session-capture');
    const sessionPending = await resolveLoggedInParentCapture(db, student.id);
    const viewerIsLinkedParentPending = sessionPending.captured;
    const parentCapturedPending = linkExistsPending || sessionPending.captured;
    const sessionAutoLinkedPending = sessionPending.captured && sessionPending.autoLinked;
    const revealPending = parentCapturedPending || staffBypassPending.bypass;
    await logResultAccessEvent(db, req, {
      action: 'result_check_pending',
      studentId: student.id,
      studentName: student.full_name,
      schoolId: student.school_id,
      schoolName: student.school_name,
      rawCode: accessCodeParam ?? id,
      accessMethod,
      viewer: buildViewerIdentity({
        staffBypass: staffBypassPending,
        parentCaptured: parentCapturedPending,
        sessionAutoLinked: sessionAutoLinkedPending,
        viewerIsLinkedParent: viewerIsLinkedParentPending,
      }),
      details: { result: 'no_published_reports', encouraging: true },
    });
    return NextResponse.json({
      accessRequired: false,
      reportPending: true,
      codeAccepted: true,
      needsParentSetup: !revealPending,
      parentCaptured: parentCapturedPending,
      sessionAutoLinked: sessionAutoLinkedPending,
      staffBypass: staffBypassPending.bypass,
      staffRole: staffBypassPending.actorRole ?? null,
      staffName: staffBypassPending.actorName ?? null,
      pendingMessage: buildReportPendingMessage(revealPending ? firstName : null),
      student: {
        id: student.id,
        first_name: revealPending ? firstName : null,
        full_name: revealPending ? firstName : null,
        class_name: revealPending ? (student.section_class ?? null) : null,
        school_name: revealPending ? (student.school_name ?? null) : null,
      },
      recordGaps: await getStudentRecordGaps(db, student.id),
    });
  }

  // Consent lookup is an ENRICHMENT, not a gate on the result itself. If it fails for any
  // reason (schema drift, transient DB error) we must still surface the published result —
  // never 500 the whole scan. Degrade to "no consent form required" on error.
  let consent: Awaited<ReturnType<typeof getResultConsentAccessStatus>>;
  try {
    consent = await getResultConsentAccessStatus(db, {
      studentUserId: student.id,
      schoolId: student.school_id,
      classId: student.class_id,
      enrollmentType: student.enrollment_type,
    });
    await backfillParentLinkFromConsent(db, student.id, consent);
  } catch (consentErr) {
    console.warn('[result-check] consent enrichment failed (non-fatal):', consentErr);
    consent = { required: false, complete: true, form: null, formUrl: null, matchedLeadId: null };
  }

  const [{ data: reports, error }, { data: orgSettings }] = await Promise.all([
    db
      .from('student_progress_reports')
      .select(PUBLIC_PROGRESS_REPORT_SELECT)
      .eq('student_id', student.id)
      .eq('is_published', true)
      .returns<PublicProgressReportDbRow[]>(),
    db.from('report_settings').select('*').limit(1).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ordered = (reports ?? []).slice().sort(compareReportsByPeriodDesc);
  const publicReports = toPublicProgressReportList(ordered);
  const terms = publicReports.map((report) => ({
    id: report.id,
    label: [report.report_period, report.report_term].filter(Boolean).join(' · ') || 'Published Result',
    report_period: report.report_period,
    report_term: report.report_term,
    course_name: report.course_name,
    published_at: report.published_at || report.updated_at,
  }));

  // Backfill parent_student_links from a completed consent lead when staff matched the
  // form but the junction row was never written — keeps gate + response in sync.
  // Resolved unconditionally — previously this only ran when NO link existed, so for an
  // already-claimed child the real parent was indistinguishable from a stranger holding
  // the card, and every such view was logged as "Linked parent".
  const linkExists = await isParentCaptured(db, student.id);
  const { resolveLoggedInParentCapture } = await import('@/lib/parent-claim/session-capture');
  const session = await resolveLoggedInParentCapture(db, student.id);
  const viewerIsLinkedParent = session.captured;
  const parentCaptured = linkExists || session.captured;
  const sessionAutoLinked = session.captured && session.autoLinked;
  const recordGaps = await getStudentRecordGaps(db, student.id);
  const portalAccess = parentCaptured ? await resolveLinkedPortalAccess(db, student.id) : null;
  const staffBypass = await resolveStaffResultBypass(db, student.school_id);
  // Report unlocks after one-time parent setup (or staff). RC number alone identifies the child only.
  const revealIdentity = parentCaptured || staffBypass.bypass;
  const needsParentSetup = !parentCaptured && !staffBypass.bypass;
  const viewerIdentity = buildViewerIdentity({ staffBypass, parentCaptured, sessionAutoLinked, viewerIsLinkedParent });

  const latest = ordered[0] ?? null;
  await logResultAccessEvent(db, req, {
    action: needsParentSetup ? 'result_check_code_accepted' : 'result_check_verified',
    studentId: student.id,
    studentName: student.full_name,
    schoolId: student.school_id,
    schoolName: student.school_name,
    reportId: latest?.id ?? null,
    reportLabel: reportPeriodLabel(latest),
    rawCode: accessCodeParam,
    accessMethod,
    viewer: viewerIdentity,
    details: {
      result: needsParentSetup ? 'code_accepted_gate_locked' : 'verified',
      reports_count: ordered.length,
      latest_report_id: latest?.id ?? null,
      parent_captured: parentCaptured,
      viewer_is_linked_parent: viewerIsLinkedParent,
      staff_bypass: staffBypass.bypass,
      staff_role: staffBypass.actorRole ?? null,
      needs_parent_setup: needsParentSetup,
    },
  });

  const response = NextResponse.json({
    accessRequired: false,
    codeAccepted: true,
    needsParentSetup,
    consentPending: consent.required && !consent.complete,
    consentComplete: consent.required && consent.complete,
    parentCaptured,
    sessionAutoLinked,
    // Never expose linked-parent emails/login shortcuts to anonymous code holders.
    portalAccess: sessionAutoLinked ? portalAccess : null,
    recordGaps,
    needsGender: recordGaps.needsGender,
    staffBypass: staffBypass.bypass,
    staffRole: staffBypass.actorRole ?? null,
    staffName: staffBypass.actorName ?? null,
    student: publicStudentPayload(student, { revealIdentity }),
    reports: revealIdentity ? publicReports : [],
    terms: revealIdentity ? terms : [],
    orgSettings: revealIdentity ? (orgSettings ?? null) : null,
    form: consent.form,
    formUrl: consent.formUrl
      ? `${consent.formUrl}?returnTo=${encodeURIComponent(`/result-check/${encodeURIComponent(id)}?via=${encodeURIComponent(accessMethod === 'unknown' ? 'link' : accessMethod)}`)}`
      : null,
  });

  return response;
  } catch (err) {
    console.error('[result-check GET] unexpected failure:', err);
    await logResultAccessEvent(db, req, {
      action: 'result_check_error',
      rawCode: accessCodeParam ?? id,
      details: { result: 'unexpected_error', message: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ error: 'Result check failed. Please try again.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await checkCustomRateLimit({ key: `public-student-results-action:${getClientIp(req)}`, max: 40, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many actions. Please wait before trying again.', retryAfter: 60 },
        { status: 429 },
      );
    }
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing student code' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim().toLowerCase();
  if (!['print', 'download', 'resend_logins'].includes(action)) {
    return NextResponse.json({ error: 'Unsupported result action' }, { status: 400 });
  }

  const db = createAdminClient();
  const { searchParams } = new URL(req.url);
  const accessCodeParam = searchParams.get('accessCode');
  const accessMethod = resolveAccessMethod(
    searchParams.get('via') || (typeof body?.via === 'string' ? body.via : null),
    accessCodeParam ?? id,
  );

  try {
    const student = await resolveStudent(db, id);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const expectedCode = accessCardCodeForStudent(student.id);
    const providedCode = normalizeAccessCardCode(accessCodeParam);
    let authorized = !!providedCode && accessCardCodeMatchesStudent(providedCode, student.id);
    if (!authorized && providedCode === expectedCode) authorized = true;
    if (!authorized) {
      const viaCredential = await resolveStudentFromCode(db as any, accessCodeParam ?? id);
      if (viaCredential && viaCredential === student.id) authorized = true;
    }
    if (student.is_active === false || !authorized) {
      const staffEarly = await resolveStaffResultBypass(db, student.school_id);
      await logResultAccessEvent(db, req, {
        action: `result_check_${action}_blocked`,
        studentId: student.id,
        studentName: student.full_name,
        schoolId: student.school_id,
        schoolName: student.school_name,
        rawCode: accessCodeParam,
        accessMethod,
        viewer: buildViewerIdentity({ staffBypass: staffEarly, parentCaptured: false, sessionAutoLinked: false }),
        details: { result: student.is_active === false ? 'inactive_student' : 'invalid_access_code' },
      });
      return NextResponse.json({ error: 'Result access not verified' }, { status: 403 });
    }

    const onboarded = await studentIsOnboarded(db, student.id);
    if (!onboarded) {
      return NextResponse.json({ error: 'This student number is not active yet.' }, { status: 404 });
    }
    const hasPublishedReports = await studentHasPublishedReports(db, student.id);
    if (!hasPublishedReports) {
      return NextResponse.json({ error: 'No published result for this student number.' }, { status: 404 });
    }

    // Print / download / resend must match the GET gate — code alone is not enough.
    const staffBypass = await resolveStaffResultBypass(db, student.school_id);
    const linkExists = await isParentCaptured(db, student.id);
    const { resolveLoggedInParentCapture } = await import('@/lib/parent-claim/session-capture');
    const session = await resolveLoggedInParentCapture(db, student.id);
    const viewerIsLinkedParent = session.captured;
    const parentCaptured = linkExists || session.captured;
    const sessionAutoLinked = session.captured && session.autoLinked;
    const viewerIdentity = buildViewerIdentity({ staffBypass, parentCaptured, sessionAutoLinked, viewerIsLinkedParent });
    if (!parentCaptured && !staffBypass.bypass) {
      await logResultAccessEvent(db, req, {
        action: `result_check_${action}_blocked`,
        studentId: student.id,
        studentName: student.full_name,
        schoolId: student.school_id,
        schoolName: student.school_name,
        rawCode: accessCodeParam,
        accessMethod,
        viewer: viewerIdentity,
        details: { result: 'parent_setup_required' },
      });
      return NextResponse.json(
        { error: 'Parent setup is required before this action.', needsParentSetup: true },
        { status: 403 },
      );
    }

    if (action === 'resend_logins') {
      try {
        await checkCustomRateLimit({ key: `result-resend-logins:${getClientIp(req)}:${student.id}`, max: 5, window: 3600 });
      } catch (err) {
        if (err instanceof RateLimitError) {
          return NextResponse.json({ error: 'Too many resend attempts. Please wait an hour and try again.' }, { status: 429 });
        }
      }
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!email) return NextResponse.json({ error: 'Parent email is required.' }, { status: 400 });

      const result = await resendPortalLoginsForScan(db, {
        studentUserId: student.id,
        parentEmail: email,
        accessAuthorized: true,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
      }
      await logResultAccessEvent(db, req, {
        action: 'result_check_resend_logins',
        studentId: student.id,
        studentName: student.full_name,
        schoolId: student.school_id,
        schoolName: student.school_name,
        rawCode: accessCodeParam,
        accessMethod,
        viewer: viewerIdentity,
        details: {
          email_sent: result.credentials?.email ?? false,
          whatsapp_sent: result.credentials?.whatsapp ?? false,
        },
      });
      return NextResponse.json({ ok: true, credentials: result.credentials ?? null });
    }

    const reportId = typeof body?.reportId === 'string' ? body.reportId : null;
    let reportLabel: string | null = null;
    if (reportId) {
      const { data: report, error: reportError } = await db
        .from('student_progress_reports')
        .select('id, report_period, report_term, course_name')
        .eq('id', reportId)
        .eq('student_id', student.id)
        .eq('is_published', true)
        .maybeSingle();

      if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
      if (!report) return NextResponse.json({ error: 'Published report not found for this student.' }, { status: 404 });
      reportLabel = reportPeriodLabel(report);
    }

    await logResultAccessEvent(db, req, {
      action: `result_check_${action}`,
      studentId: student.id,
      studentName: student.full_name,
      schoolId: student.school_id,
      schoolName: student.school_name,
      reportId,
      reportLabel,
      rawCode: accessCodeParam,
      accessMethod,
      viewer: viewerIdentity,
      details: {
        result: 'recorded',
        report_id: reportId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[result-check POST] unexpected failure:', err);
    return NextResponse.json({ error: 'Result action failed. Please try again.' }, { status: 500 });
  }
}
