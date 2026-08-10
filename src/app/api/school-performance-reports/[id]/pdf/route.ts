import { NextRequest, NextResponse } from 'next/server';
import { canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { buildSchoolReportPdfBuffer } from '@/lib/school-reports/pdf-delivery';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const { id } = await context.params;
  if (!REPORT_ID.test(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const revisionParam = req.nextUrl.searchParams.get('revision');
  const { data: report, error: reportError } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (reportError) return NextResponse.json({ error: reportError.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report)) {
    return NextResponse.json({ error: 'You cannot download this report.' }, { status: 403 });
  }

  try {
    const { buffer, filename, pdfHash } = await buildSchoolReportPdfBuffer(
      actor.admin,
      report as SchoolPerformanceReportRow,
      actor.profile.role,
      revisionParam,
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': report.status === 'published' ? 'private, max-age=300' : 'private, no-store',
        ...(pdfHash ? { 'X-Report-Pdf-Hash': pdfHash } : {}),
      },
    });
  } catch (error) {
    console.error('[school-report] PDF failed:', error);
    return NextResponse.json({ error: 'Unable to create the PDF report.' }, { status: 500 });
  }
}
