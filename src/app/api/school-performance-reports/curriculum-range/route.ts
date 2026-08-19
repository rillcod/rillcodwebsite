import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { logAuditEvent } from '@/lib/observability/audit-events';
import { loadReportCurriculumRangeSuggestion } from '@/lib/school-reports/curriculum-range';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';

export const dynamic = 'force-dynamic';

/**
 * GET /api/school-performance-reports/curriculum-range
 * Report delivery helper — suggest curriculum term/week range from marked weeks.
 * Full curriculum workspace integration is intentionally out of scope here.
 */
export async function GET(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can load delivery range suggestions.' }, { status: 403 });
  }

  const schoolId = req.nextUrl.searchParams.get('schoolId') || '';
  const academicTermId = req.nextUrl.searchParams.get('academicTermId') || '';
  if (!isSchoolReportUuid(schoolId) || !isSchoolReportUuid(academicTermId)) {
    return NextResponse.json({ error: 'schoolId and academicTermId are required.' }, { status: 400 });
  }
  if (!canManageSchoolReport(actor, schoolId)) {
    return NextResponse.json({ error: 'You cannot manage reports for this school.' }, { status: 403 });
  }

  try {
    const suggestion = await loadReportCurriculumRangeSuggestion(actor.admin, schoolId, academicTermId);
    if (!suggestion) {
      return NextResponse.json({ error: 'Could not build a delivery range suggestion.' }, { status: 404 });
    }
    logAuditEvent('curriculum.detect', {
      schoolId,
      academicTermId,
      status: suggestion.status,
      source: suggestion.source,
    });
    return NextResponse.json({ data: suggestion, meta: { timestamp: new Date().toISOString() } });
  } catch (err: unknown) {
    logAuditEvent('curriculum.detect', {
      schoolId,
      academicTermId,
      status: 'failed',
      message: err instanceof Error ? err.message : 'Failed',
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load delivery range suggestion.' },
      { status: 500 },
    );
  }
}
