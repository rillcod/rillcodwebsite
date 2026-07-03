import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

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
  // can switch academic year / term instead of being stuck on the single scanned term.
  // Only published reports, and only reachable via a valid code for this student.
  let otherReports: any[] = [];
  if (report.student_id) {
    const { data: others } = await (admin as any)
      .from('student_progress_reports')
      .select('id, report_term, report_period, course_name, verification_code, report_date, overall_grade, is_published')
      .eq('student_id', report.student_id)
      .eq('is_published', true)
      .not('verification_code', 'is', null)
      .order('report_date', { ascending: false });
    otherReports = others ?? [];
  }

  return NextResponse.json({ found: true, report, orgSettings: orgData ?? null, otherReports });
}
