import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { runReportPreflight } from '@/lib/school-reports/preflight';

export const dynamic = 'force-dynamic';

/**
 * GET /api/school-performance-reports/preflight
 * Data-readiness checks before creating or regenerating a school report.
 */
export async function GET(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can run report preflight.' }, { status: 403 });
  }

  const schoolId = req.nextUrl.searchParams.get('schoolId') || '';
  const academicTermId = req.nextUrl.searchParams.get('academicTermId') || '';
  if (!schoolId || !academicTermId) {
    return NextResponse.json({ error: 'schoolId and academicTermId are required.' }, { status: 400 });
  }
  if (!canManageSchoolReport(actor, schoolId)) {
    return NextResponse.json({ error: 'You cannot manage reports for this school.' }, { status: 403 });
  }

  const { data: term } = await actor.admin
    .from('academic_terms')
    .select('academic_year,term_label,term_number,start_date,end_date')
    .eq('id', academicTermId)
    .maybeSingle();

  if (!term) {
    return NextResponse.json({ error: 'Academic term not found.' }, { status: 404 });
  }

  const startDate = req.nextUrl.searchParams.get('startDate') || term.start_date || '';
  const endDate = req.nextUrl.searchParams.get('endDate') || term.end_date || '';

  try {
    const result = await runReportPreflight(actor.admin, {
      schoolId,
      academicTermId,
      academicYear: term.academic_year,
      termLabel: term.term_label,
      academicTermNumber: Number(term.term_number) || 1,
      startDate,
      endDate,
    });
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preflight failed.' },
      { status: 500 },
    );
  }
}
