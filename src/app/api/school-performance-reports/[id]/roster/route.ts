import { NextRequest, NextResponse } from 'next/server';
import { canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { loadSchoolReportRoster } from '@/lib/school-reports/loaders/roster';
import { buildSchoolRosterPdfRows } from '@/lib/rosters/build-school-roster-pdf-rows';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

/** Live RC roster rows for a school report's school — used by analytics UI PDF export. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

  const { id } = await context.params;
  if (!isSchoolReportUuid(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const { data: report } = await actor.admin
    .from('school_performance_reports')
    .select('id, school_id, title, status')
    .eq('id', id)
    .maybeSingle();

  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report as SchoolPerformanceReportRow)) {
    return NextResponse.json({ error: 'You cannot export this roster.' }, { status: 403 });
  }

  try {
    const checkedAt = new Date().toISOString();
    const rosterLoad = await loadSchoolReportRoster(actor.admin, report.school_id, checkedAt);
    const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    const rows = buildSchoolRosterPdfRows(
      {
        studentRows: rosterLoad.data.studentRows,
        classNameById: rosterLoad.data.classNameById,
      },
      origin,
    );

    const { data: school } = await actor.admin
      .from('schools')
      .select('name')
      .eq('id', report.school_id)
      .maybeSingle();

    return NextResponse.json({
      rows,
      count: rows.length,
      schoolId: report.school_id,
      schoolName: school?.name ?? 'School',
      reportTitle: report.title,
      loadedStudents: rosterLoad.data.studentRows.length,
      skipped: Math.max(0, rosterLoad.data.studentRows.length - rows.length),
    });
  } catch (error) {
    console.error('[school-report/roster] failed:', error);
    return NextResponse.json({ error: 'Unable to build the roster export.' }, { status: 500 });
  }
}
