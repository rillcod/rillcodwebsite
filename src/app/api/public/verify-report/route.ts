import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { isParentCaptured } from '@/lib/parent-claim/captured';
import { resolveStaffResultBypass } from '@/lib/parent-claim/staff-bypass';

/**
 * Legacy public report-by-verification-code endpoint.
 * Full grades are only returned for linked parents or logged-in staff.
 * Everyone else is pointed at /result-check (the gated surface).
 */
export async function GET(request: Request) {
  try {
    await checkCustomRateLimit({ key: `public-report-verify:${getClientIp(request as any)}`, max: 20, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
        { status: 429 },
      );
    }
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  if (!/^[A-Z0-9_-]{12,80}$/.test(code)) {
    return NextResponse.json({ found: false, reason: 'invalid_code' }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: report, error } = await (admin as any)
    .from('student_progress_reports')
    .select('*')
    .eq('verification_code', code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ found: false, reason: 'notfound' }, { status: 404 });
  if (!report.is_published) return NextResponse.json({ found: false, reason: 'unpublished' }, { status: 403 });

  const parentCaptured = report.student_id ? await isParentCaptured(admin as any, report.student_id) : false;
  const staffBypass = await resolveStaffResultBypass(admin as any, report.school_id ?? null);
  const reveal = parentCaptured || staffBypass.bypass;
  const resultCheckPath = `/result-check/${encodeURIComponent(code)}`;

  if (!reveal) {
    return NextResponse.json({
      found: true,
      needsParentSetup: true,
      parentCaptured: false,
      staffBypass: false,
      redirect: resultCheckPath,
      message: 'Parent setup is required to view this report. Continue on the result check page.',
      report: null,
      orgSettings: null,
      otherReports: [],
      classRank: null,
    });
  }

  const { data: orgData } = await (admin as any)
    .from('report_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  let otherReports: any[] = [];
  if (report.student_id) {
    const { data: others } = await (admin as any)
      .from('student_progress_reports')
      .select(
        'id, report_term, report_period, course_name, report_date, overall_grade, overall_score, theory_score, practical_score, attendance_score, section_class, is_published',
      )
      .eq('student_id', report.student_id)
      .eq('is_published', true)
      .not('verification_code', 'is', null)
      .order('report_date', { ascending: false });
    otherReports = (others ?? []).map((row: any) => ({
      id: row.id,
      report_term: row.report_term,
      report_period: row.report_period,
      course_name: row.course_name,
      report_date: row.report_date,
      overall_grade: row.overall_grade,
      overall_score: row.overall_score,
      theory_score: row.theory_score,
      practical_score: row.practical_score,
      attendance_score: row.attendance_score,
      section_class: row.section_class,
      is_published: row.is_published,
    }));
  }

  let classRank: { position: number; classSize: number } | null = null;
  try {
    const myScore = typeof report.overall_score === 'number' ? report.overall_score : null;
    if (myScore !== null && report.school_id && report.section_class && (report.term_id || (report.report_term && report.report_period))) {
      let q = (admin as any)
        .from('student_progress_reports')
        .select('overall_score')
        .eq('school_id', report.school_id)
        .eq('section_class', report.section_class)
        .eq('is_published', true)
        .not('overall_score', 'is', null);
      if (report.term_id) {
        q = q.eq('term_id', report.term_id);
      } else {
        q = q.eq('report_term', report.report_term).eq('report_period', report.report_period);
      }
      if (report.course_name) q = q.eq('course_name', report.course_name);
      const { data: peers } = await q;
      const scores = ((peers ?? []) as Array<{ overall_score: number | null }>)
        .map(p => p.overall_score).filter((s): s is number => typeof s === 'number');
      if (scores.length >= 2) {
        const higher = scores.filter(s => s > myScore).length;
        const position = higher + 1;
        if (position <= Math.ceil(scores.length / 2)) {
          classRank = { position, classSize: scores.length };
        }
      }
    }
  } catch { /* rank is best-effort — never block verification */ }

  const {
    verification_code: _verificationCode,
    access_code: _accessCode,
    teacher_id: _teacherId,
    fee_amount: _feeAmount,
    fee_status: _feeStatus,
    fee_label: _feeLabel,
    show_payment_notice: _showPayment,
    ...safeReport
  } = report as Record<string, unknown>;

  return NextResponse.json({
    found: true,
    needsParentSetup: false,
    parentCaptured,
    staffBypass: staffBypass.bypass,
    report: safeReport,
    orgSettings: orgData ?? null,
    otherReports,
    classRank,
  });
}
