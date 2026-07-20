import { NextRequest, NextResponse } from 'next/server';
import { canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { renderSchoolReportPdf } from '@/lib/school-reports/pdf';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report)) return NextResponse.json({ error: 'You cannot download this report.' }, { status: 403 });
  try {
    const buffer = await renderSchoolReportPdf(report as SchoolPerformanceReportRow);
    const safeName = String(report.title || 'school-performance-report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 90).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName || 'school-performance-report'}.pdf"`,
        'Cache-Control': report.status === 'published' ? 'private, max-age=300' : 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[school-report] PDF failed:', error);
    return NextResponse.json({ error: 'Unable to create the PDF report.' }, { status: 500 });
  }
}
