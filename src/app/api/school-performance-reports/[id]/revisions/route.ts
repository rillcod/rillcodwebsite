import { NextRequest, NextResponse } from 'next/server';
import { canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { listSchoolReportRevisions } from '@/lib/school-reports/revisions';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report)) {
    return NextResponse.json({ error: 'You cannot view this report history.' }, { status: 403 });
  }
  if (actor.profile.role === 'school') {
    return NextResponse.json({ error: 'Revision history is available to staff only.' }, { status: 403 });
  }

  try {
    const revisions = await listSchoolReportRevisions(actor.admin, id);
    const { data: events } = await actor.admin
      .from('school_report_events')
      .select('id,event_type,actor_id,payload,created_at,revision_id')
      .eq('report_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    return NextResponse.json({
      data: {
        revisions: revisions.map((row) => ({
          id: row.id,
          revisionNumber: row.revision_number,
          status: row.status,
          publishedAt: row.published_at,
          publishedBy: row.published_by,
          changeReason: row.change_reason,
          pdfHash: row.pdf_hash,
          forcePublishOverride: row.force_publish_override,
          createdAt: row.created_at,
        })),
        events: events ?? [],
        publishedRevisionNumber: report.published_revision_number,
        workingRevisionNumber: report.working_revision_number,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load revision history.' },
      { status: 500 },
    );
  }
}
