import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { isParentCaptured } from '@/lib/parent-claim/captured';

// Public endpoint — no auth required. Uses service role to bypass RLS.
// Only returns published reports so drafts stay private.
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

  // Fetch org branding for the verify page to render the report card
  const { data: orgData } = await (admin as any)
    .from('report_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  // Also return this student's OTHER published reports so the verifier (e.g. a school)
  // can switch academic year / term, see progress across terms, and view an annual
  // summary. Only published reports, only reachable via a valid code for this student.
  let otherReports: any[] = [];
  if (report.student_id) {
    const { data: others } = await (admin as any)
      .from('student_progress_reports')
      .select('id, report_term, report_period, course_name, verification_code, report_date, overall_grade, overall_score, theory_score, practical_score, attendance_score, section_class, is_published')
      .eq('student_id', report.student_id)
      .eq('is_published', true)
      .not('verification_code', 'is', null)
      .order('report_date', { ascending: false });
    otherReports = others ?? [];
  }

  // Best-effort class position for the SCANNED term: rank by overall_score among the
  // same school + class + term + session (published only). Returns just the position &
  // class size — never any other student's data.
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
      // Always scope by full session (term_id or year+term) so ranks never mix years.
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
        // Only reveal class position to TOP-HALF students. A student ranked in the
        // lower half sees just their own percentage — we never publicly broadcast a
        // weak position. (top half = position within the first ceil(classSize/2)).
        if (position <= Math.ceil(scores.length / 2)) {
          classRank = { position, classSize: scores.length };
        }
      }
    }
  } catch { /* rank is best-effort — never block verification */ }

  // Has this student's REAL parent been captured (verified link)? Same rule everywhere.
  const parentCaptured = report.student_id ? await isParentCaptured(admin as any, report.student_id) : false;

  return NextResponse.json({ found: true, report, orgSettings: orgData ?? null, otherReports, classRank, parentCaptured });
}
