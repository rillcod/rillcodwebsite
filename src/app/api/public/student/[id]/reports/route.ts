import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { compareReportsByPeriodDesc } from '@/lib/reports/academic-period';
import { getResultConsentAccessStatus } from '@/lib/consent/result-access';

function normalizeCardAccessCode(raw: string | null | undefined) {
  const body = decodeURIComponent(String(raw || ''))
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const code = body.startsWith('RC') ? body.slice(2) : body;
  return code ? `RC-${code.slice(0, 8)}` : '';
}

function shortCardCode(studentId: string) {
  return `RC-${studentId.slice(0, 8).toUpperCase()}`;
}

function publicStudentPayload(student: any, includeAccessCode = false) {
  const payload: Record<string, unknown> = {
    id: student.id,
    full_name: student.full_name,
    school_name: student.school_name,
    is_active: student.is_active,
    enrollment_type: student.enrollment_type,
    avatar_url: student.avatar_url ?? null,
    class_name: student.section_class ?? null,
    enrolled_at: student.created_at,
  };
  if (includeAccessCode) payload.access_code = shortCardCode(student.id);
  return payload;
}

async function resolveStudent(db: ReturnType<typeof createAdminClient>, rawId: string) {
  const decoded = decodeURIComponent(rawId || '').trim();
  const decodedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)
    ? decoded.toLowerCase()
    : null;
  const codeBody = normalizeCardAccessCode(rawId).replace(/^RC-/, '').toLowerCase();
  if (!decodedUuid && codeBody.length !== 8) return null;

  const select = 'id, full_name, school_name, school_id, is_active, enrollment_type, avatar_url, section_class, class_id, created_at';

  const query = db
    .from('portal_users')
    .select(select)
    .eq('role', 'student')
    .neq('is_deleted', true);

  if (decodedUuid) {
    const { data, error } = await query.eq('id', decodedUuid).limit(1);
    if (error || !data || data.length !== 1) return null;
    return data[0];
  }

  const matches: any[] = [];
  for (let from = 0; matches.length < 2; from += 1000) {
    const { data, error } = await db
      .from('portal_users')
      .select(select)
      .eq('role', 'student')
      .neq('is_deleted', true)
      .range(from, from + 999);
    if (error || !data) return null;
    for (const student of data as any[]) {
      const studentId = String(student.id);
      if (studentId.toLowerCase().startsWith(codeBody)) {
        matches.push(student);
      }
      if (matches.length > 1) break;
    }
    if (data.length < 1000) break;
  }
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
        { error: 'Too many scans. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
        { status: 429 },
      );
    }
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing student code' }, { status: 400 });

  const db = createAdminClient();
  const student = await resolveStudent(db, id);
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  if (student.is_active === false) {
    return NextResponse.json({ error: 'This student account is not active.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const expectedCode = shortCardCode(student.id);
  const accessCodeParam = searchParams.get('accessCode');
  const providedCode = normalizeCardAccessCode(accessCodeParam);
  if (providedCode !== expectedCode) {
    return NextResponse.json(
      {
        accessRequired: true,
        error: accessCodeParam ? 'Invalid result access code' : 'Result access code required',
        student: publicStudentPayload(student),
      },
      { status: accessCodeParam ? 403 : 401 },
    );
  }

  const consent = await getResultConsentAccessStatus(db as any, {
    studentUserId: student.id,
    schoolId: student.school_id,
    classId: student.class_id,
  });

  if (consent.required && !consent.complete) {
    return NextResponse.json({
      accessRequired: false,
      consentRequired: true,
      oneTime: true,
      student: publicStudentPayload(student),
      form: consent.form,
      formUrl: consent.formUrl
        ? `${consent.formUrl}?returnTo=${encodeURIComponent(`/result-check/${encodeURIComponent(id)}`)}`
        : null,
      message: 'One-time parent consent and assessment is required before this result is released.',
    });
  }

  const [{ data: reports, error }, { data: orgSettings }] = await Promise.all([
    db
      .from('student_progress_reports')
      .select('*')
      .eq('student_id', student.id)
      .eq('is_published', true),
    db.from('report_settings').select('*').limit(1).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ordered = ((reports ?? []) as any[]).slice().sort(compareReportsByPeriodDesc);
  const terms = ordered.map((report) => ({
    id: report.id,
    label: [report.report_period, report.report_term].filter(Boolean).join(' · ') || 'Published Result',
    report_period: report.report_period,
    report_term: report.report_term,
    course_name: report.course_name,
    published_at: report.updated_at,
  }));

  return NextResponse.json({
    accessRequired: false,
    consentRequired: false,
    student: publicStudentPayload(student, true),
    reports: ordered,
    terms,
    orgSettings: orgSettings ?? null,
  });
}
