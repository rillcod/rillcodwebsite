import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  const { id } = await context.params;
  const { data: report, error } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canViewSchoolReport(actor, report)) return NextResponse.json({ error: 'You cannot view this report.' }, { status: 403 });
  const [{ data: school }, { data: creator }] = await Promise.all([
    actor.admin.from('schools').select('name').eq('id', report.school_id).maybeSingle(),
    actor.admin.from('portal_users').select('full_name').eq('id', report.created_by).maybeSingle(),
  ]);
  return NextResponse.json({ data: { ...report, school_name: school?.name || 'School', creator_name: creator?.full_name || 'Staff' }, role: actor.profile.role });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) return NextResponse.json({ error: 'Only authorised staff can update reports.' }, { status: 403 });
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 180);
    if (title.length < 3) return NextResponse.json({ error: 'Enter a clear title.' }, { status: 400 });
    updates.title = title;
  }
  if (body.narrative && typeof body.narrative === 'object' && !Array.isArray(body.narrative)) {
    const cleanList = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
    const executiveSummary = String(body.narrative.executiveSummary || '').trim().slice(0, 2400);
    if (!executiveSummary) return NextResponse.json({ error: 'The executive summary cannot be empty.' }, { status: 400 });
    updates.narrative = {
      executiveSummary,
      achievements: cleanList(body.narrative.achievements),
      concerns: cleanList(body.narrative.concerns),
      recommendations: cleanList(body.narrative.recommendations),
      nextPeriodFocus: cleanList(body.narrative.nextPeriodFocus),
    };
  }
  if (body.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(body.status)) return NextResponse.json({ error: 'Invalid report status.' }, { status: 400 });
    updates.status = body.status;
    if (body.status === 'published') { updates.published_at = new Date().toISOString(); updates.published_by = actor.user.id; }
  }
  const { error } = await actor.admin.from('school_performance_reports').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
