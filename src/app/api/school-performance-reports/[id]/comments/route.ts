import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { addSchoolReportComment, listSchoolReportComments } from '@/lib/school-reports/comments';
import { logAuditEvent } from '@/lib/observability/audit-events';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can view report comments.' }, { status: 403 });
  }

  const { id } = await context.params;
  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('id,school_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot view comments on this report.' }, { status: 403 });
  }

  try {
    const comments = await listSchoolReportComments(actor.admin, id);
    return NextResponse.json({ data: { comments } });
  } catch (loadError) {
    return NextResponse.json(
      { error: loadError instanceof Error ? loadError.message : 'Unable to load comments.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can comment on reports.' }, { status: 403 });
  }

  const { id } = await context.params;
  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('id,school_id,working_revision_number')
    .eq('id', id)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot comment on this report.' }, { status: 403 });
  }

  let body = '';
  let revisionId: string | null = null;
  try {
    const json = await req.json();
    body = String(json.body || '');
    revisionId = json.revisionId ? String(json.revisionId) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const comment = await addSchoolReportComment(actor.admin, {
      reportId: id,
      authorId: actor.profile.id,
      body,
      revisionId,
    });
    logAuditEvent('report.comment', {
      reportId: id,
      commentId: comment.id,
      authorId: actor.profile.id,
      revisionNumber: report.working_revision_number ?? null,
    });
    return NextResponse.json({ data: { comment } }, { status: 201 });
  } catch (saveError) {
    return NextResponse.json(
      { error: saveError instanceof Error ? saveError.message : 'Unable to save comment.' },
      { status: 400 },
    );
  }
}
