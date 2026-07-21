import { NextRequest, NextResponse } from 'next/server';
import { canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { resolveSchoolReportAudience, shapeSchoolReportForAudience } from '@/lib/school-reports/audience';
import { getPublishedRevision, hashReportPayload } from '@/lib/school-reports/revisions';
import { renderSchoolReportPdf } from '@/lib/school-reports/pdf';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const { id } = await context.params;
  const revisionParam = req.nextUrl.searchParams.get('revision');
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report)) {
    return NextResponse.json({ error: 'You cannot download this report.' }, { status: 403 });
  }

  let renderSource = report as SchoolPerformanceReportRow;
  let pdfHash: string | null = null;

  if (revisionParam) {
    const revisionNumber = Number(revisionParam);
    const { data: revision } = await actor.admin
      .from('school_report_revisions')
      .select('*')
      .eq('report_id', id)
      .eq('revision_number', revisionNumber)
      .maybeSingle();
    if (!revision || revision.status !== 'published') {
      return NextResponse.json({ error: 'Published revision not found.' }, { status: 404 });
    }
    renderSource = {
      ...(report as SchoolPerformanceReportRow),
      snapshot: revision.snapshot,
      narrative: revision.narrative,
      design: revision.design,
      status: 'published',
    };
    pdfHash = revision.pdf_hash;
  } else if (report.status === 'published') {
    const publishedRevision = await getPublishedRevision(actor.admin, report as SchoolPerformanceReportRow);
    if (publishedRevision) {
      renderSource = {
        ...(report as SchoolPerformanceReportRow),
        snapshot: publishedRevision.snapshot,
        narrative: publishedRevision.narrative,
        design: publishedRevision.design,
      };
      pdfHash = publishedRevision.pdf_hash;
    }
  }

  try {
    const audience = resolveSchoolReportAudience(actor.profile.role);
    const shapedSource =
      audience === 'school'
        ? shapeSchoolReportForAudience(renderSource, audience)
        : renderSource;
    const buffer = await renderSchoolReportPdf(shapedSource);
    const computedHash = hashReportPayload(shapedSource);
    if (pdfHash && pdfHash !== computedHash) {
      console.warn('[school-report] PDF hash mismatch for revision', { reportId: id, pdfHash, computedHash });
    }
    const safeName = String(report.title || 'school-performance-report')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90)
      .toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName || 'school-performance-report'}.pdf"`,
        'Cache-Control': report.status === 'published' ? 'private, max-age=300' : 'private, no-store',
        ...(pdfHash ? { 'X-Report-Pdf-Hash': pdfHash } : {}),
      },
    });
  } catch (error) {
    console.error('[school-report] PDF failed:', error);
    return NextResponse.json({ error: 'Unable to create the PDF report.' }, { status: 500 });
  }
}
