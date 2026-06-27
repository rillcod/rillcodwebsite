import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { compareReportsByPeriodDesc } from '@/lib/reports/academic-period';

function normalizeCardCode(raw: string) {
  return decodeURIComponent(raw || '')
    .trim()
    .replace(/^RC-/i, '')
    .toLowerCase();
}

function normalizeAccessCode(raw: string | null | undefined) {
  const clean = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!clean) return '';
  return clean.startsWith('RC-') ? clean : `RC-${clean}`;
}

function schoolAccessCode(schoolName: string | null | undefined) {
  const words = String(schoolName || 'Rillcod')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stopWords = new Set(['THE', 'SCHOOL', 'ACADEMY', 'COLLEGE', 'INTERNATIONAL', 'NURSERY', 'PRIMARY', 'SECONDARY']);
  const key = words.find((word) => !stopWords.has(word)) || words[0] || 'RILLCOD';
  return `RC-${key.slice(0, 18)}`;
}

function publicStudentPayload(student: any) {
  return {
    id: student.id,
    full_name: student.full_name,
    school_name: student.school_name,
    is_active: student.is_active,
    enrollment_type: student.enrollment_type,
    avatar_url: student.avatar_url ?? null,
    class_name: student.section_class ?? null,
    enrolled_at: student.created_at,
    access_code: `RC-${student.id.slice(0, 8).toUpperCase()}`,
  };
}

async function resolveStudent(db: ReturnType<typeof createAdminClient>, rawId: string) {
  const code = normalizeCardCode(rawId);
  if (!code || code.length < 8) return null;

  const select = 'id, full_name, school_name, is_active, enrollment_type, avatar_url, section_class, class_id, created_at';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);

  const query = db
    .from('portal_users')
    .select(select)
    .eq('role', 'student');

  const { data, error } = isUuid
    ? await query.eq('id', code).limit(1)
    : await query.ilike('id', `${code}%`).limit(2);

  if (error || !data || data.length !== 1) return null;
  return data[0];
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

  const { searchParams } = new URL(req.url);
  const expectedCode = schoolAccessCode(student.school_name);
  const providedCode = normalizeAccessCode(searchParams.get('accessCode'));
  if (providedCode !== expectedCode) {
    return NextResponse.json(
      {
        accessRequired: true,
        error: providedCode ? 'Invalid school result access code' : 'School result access code required',
        student: publicStudentPayload(student),
      },
      { status: providedCode ? 403 : 401 },
    );
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
    student: publicStudentPayload(student),
    reports: ordered,
    terms,
    orgSettings: orgSettings ?? null,
  });
}
