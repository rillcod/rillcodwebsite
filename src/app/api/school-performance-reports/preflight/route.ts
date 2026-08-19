import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { logAuditEvent } from '@/lib/observability/audit-events';
import { runReportPreflight } from '@/lib/school-reports/preflight';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';

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
  if (!isSchoolReportUuid(schoolId) || !isSchoolReportUuid(academicTermId)) {
    return NextResponse.json({ error: 'schoolId and academicTermId are required.' }, { status: 400 });
  }
  if (!canManageSchoolReport(actor, schoolId)) {
    return NextResponse.json({ error: 'You cannot manage reports for this school.' }, { status: 403 });
  }

  const { data: term, error: termError } = await actor.admin
    .from('academic_terms')
    .select('academic_year,term_label,term_number,start_date,end_date')
    .eq('id', academicTermId)
    .maybeSingle();

  if (termError) return NextResponse.json({ error: termError.message }, { status: 500 });

  if (!term) {
    return NextResponse.json({ error: 'Academic term not found.' }, { status: 404 });
  }

  const startDate = req.nextUrl.searchParams.get('startDate') || term.start_date || '';
  const endDate = req.nextUrl.searchParams.get('endDate') || term.end_date || '';
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  logAuditEvent('report.preflight.start', { requestId, schoolId, academicTermId });

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
    logAuditEvent('report.preflight.complete', {
      requestId,
      schoolId,
      academicTermId,
      durationMs: Date.now() - startedAt,
      blocking: result.blocking,
      readyToGenerate: result.readyToGenerate,
    });
    return NextResponse.json({
      data: result,
      meta: { requestId, timestamp: new Date().toISOString() },
    });
  } catch (err: unknown) {
    logAuditEvent('report.preflight.failed', {
      requestId,
      schoolId,
      academicTermId,
      durationMs: Date.now() - startedAt,
      message: err instanceof Error ? err.message : 'Preflight failed.',
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preflight failed.', meta: { requestId } },
      { status: 500 },
    );
  }
}
