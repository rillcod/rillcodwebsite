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
import { resolveLinkedPortalAccess, resendPortalLoginsForScan } from '@/lib/parent-claim/portal-access';
import { accessCardCodeBody, accessCardCodeForStudent, accessCardCodeMatchesStudent, normalizeAccessCardCode } from '@/lib/access-card-code';
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

function publicStudentPayload(student: StudentAccessRow, includeAccessCode = false) {
  const payload: Record<string, Json> = {
    id: student.id,
    full_name: student.full_name,
    school_name: student.school_name,
    is_active: student.is_active,
    enrollment_type: student.enrollment_type,
    avatar_url: student.avatar_url ?? null,
    class_name: student.section_class ?? null,
    enrolled_at: student.created_at,
  };
  if (includeAccessCode) payload.access_code = accessCardCodeForStudent(student.id);
  return payload;
}

function auditCodeMetadata(rawCode: string | null | undefined) {
  const normalized = normalizeAccessCardCode(rawCode);
  return {
    code_present: !!rawCode,
    code_format_valid: !!normalized,
    code_suffix: normalized ? normalized.slice(-4) : null,
  };
}

async function logResultAccessEvent(
  db: ReturnType<typeof createAdminClient>,
  req: NextRequest,
  entry: {
    action: string;
    studentId?: string | null;
    schoolId?: string | null;
    rawCode?: string | null;
    details?: AuditDetails;
  },
) {
  try {
    const newValues: Json = {
      school_id: entry.schoolId ?? null,
      ...auditCodeMetadata(entry.rawCode),
      ...(entry.details ?? {}),
    };

    await db.from('audit_logs').insert({
      action: entry.action,
      resource_type: RESULT_ACCESS_RESOURCE,
      resource_id: entry.studentId ?? null,
      table_name: entry.studentId ? 'portal_users' : null,
      record_id: entry.studentId ?? null,
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      new_values: newValues,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[result-check audit] failed (non-fatal):', err);
  }
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
      code_source: 'fnv1a_uuid_v1',
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
  const decodedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)
    ? decoded.toLowerCase()
    : null;
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
  const student = await resolveStudent(db, id);
  if (!student) {
    await logResultAccessEvent(db, req, {
      action: 'result_check_not_found',
      rawCode: accessCodeParam ?? id,
      details: { result: 'student_not_found' },
    });
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  if (student.is_active === false) {
    await logResultAccessEvent(db, req, {
      action: 'result_check_blocked',
      studentId: student.id,
      schoolId: student.school_id,
      rawCode: accessCodeParam ?? id,
      details: { result: 'inactive_student' },
    });
    return NextResponse.json({ error: 'This student account is not active.' }, { status: 403 });
  }

  const expectedCode = accessCardCodeForStudent(student.id);
  const providedCode = normalizeAccessCardCode(accessCodeParam);
  let authorized = providedCode === expectedCode;
  if (!authorized) {
    // A valid report code or ID-card code for THIS student authorizes too — that's what
    // makes /result-check the single home for both ID-card and result scans.
    const viaCredential = await resolveStudentFromCode(db as any, accessCodeParam ?? id);
    if (viaCredential && viaCredential === student.id) authorized = true;
  }
  if (!authorized) {
    await logResultAccessEvent(db, req, {
      action: 'result_check_blocked',
      studentId: student.id,
      schoolId: student.school_id,
      rawCode: accessCodeParam,
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

  const consent = await getResultConsentAccessStatus(db, {
    studentUserId: student.id,
    schoolId: student.school_id,
    classId: student.class_id,
  });

  await backfillParentLinkFromConsent(db, student.id, consent);

  const [{ data: reports, error }, { data: orgSettings }] = await Promise.all([
    db
      .from('student_progress_reports')
      .select('*')
      .eq('student_id', student.id)
      .eq('is_published', true),
    db.from('report_settings').select('*').limit(1).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ordered: ProgressReportRow[] = (reports ?? []).slice().sort(compareReportsByPeriodDesc);
  const terms = ordered.map((report) => ({
    id: report.id,
    label: [report.report_period, report.report_term].filter(Boolean).join(' · ') || 'Published Result',
    report_period: report.report_period,
    report_term: report.report_term,
    course_name: report.course_name,
    published_at: report.updated_at,
  }));

  // Backfill parent_student_links from a completed consent lead when staff matched the
  // form but the junction row was never written — keeps gate + response in sync.
  const parentCaptured = await isParentCaptured(db, student.id);
  const recordGaps = await getStudentRecordGaps(db, student.id);
  const portalAccess = parentCaptured ? await resolveLinkedPortalAccess(db, student.id) : null;

  await logResultAccessEvent(db, req, {
    action: 'result_check_verified',
    studentId: student.id,
    schoolId: student.school_id,
    rawCode: accessCodeParam,
    details: {
      result: 'verified',
      reports_count: ordered.length,
      latest_report_id: ordered[0]?.id ?? null,
    },
  });

  return NextResponse.json({
    accessRequired: false,
    consentPending: consent.required && !consent.complete,
    consentComplete: consent.required && consent.complete,
    parentCaptured,
    portalAccess,
    recordGaps,
    needsGender: recordGaps.needsGender,
    student: publicStudentPayload(student, true),
    reports: ordered,
    terms,
    orgSettings: orgSettings ?? null,
    form: consent.form,
    formUrl: consent.formUrl
      ? `${consent.formUrl}?returnTo=${encodeURIComponent(`/result-check/${encodeURIComponent(id)}`)}`
      : null,
  });
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
  const student = await resolveStudent(db, id);
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const expectedCode = accessCardCodeForStudent(student.id);
  const providedCode = normalizeAccessCardCode(accessCodeParam);
  let authorized = providedCode === expectedCode;
  if (!authorized) {
    const viaCredential = await resolveStudentFromCode(db as any, accessCodeParam ?? id);
    if (viaCredential && viaCredential === student.id) authorized = true;
  }
  if (student.is_active === false || !authorized) {
    await logResultAccessEvent(db, req, {
      action: `result_check_${action}_blocked`,
      studentId: student.id,
      schoolId: student.school_id,
      rawCode: accessCodeParam,
      details: { result: student.is_active === false ? 'inactive_student' : 'invalid_access_code' },
    });
    return NextResponse.json({ error: 'Result access not verified' }, { status: 403 });
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
      schoolId: student.school_id,
      rawCode: accessCodeParam,
      details: {
        email_sent: result.credentials?.email ?? false,
        whatsapp_sent: result.credentials?.whatsapp ?? false,
      },
    });
    return NextResponse.json({ ok: true, credentials: result.credentials ?? null });
  }

  const reportId = typeof body?.reportId === 'string' ? body.reportId : null;
  if (reportId) {
    const { data: report, error: reportError } = await db
      .from('student_progress_reports')
      .select('id')
      .eq('id', reportId)
      .eq('student_id', student.id)
      .eq('is_published', true)
      .maybeSingle();

    if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: 'Published report not found for this student.' }, { status: 404 });
  }

  await logResultAccessEvent(db, req, {
    action: `result_check_${action}`,
    studentId: student.id,
    schoolId: student.school_id,
    rawCode: accessCodeParam,
    details: {
      result: 'recorded',
      report_id: reportId,
    },
  });

  return NextResponse.json({ ok: true });
}
