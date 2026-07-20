import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, canViewSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { applySchoolReportPatch, deleteSchoolReportBook } from '@/lib/school-reports/service';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

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
  return NextResponse.json({
    data: { ...report, school_name: school?.name || 'School', creator_name: creator?.full_name || 'Staff' },
    role: actor.profile.role,
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can update reports.' }, { status: 403 });
  }
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await applySchoolReportPatch(
    actor.admin,
    report as SchoolPerformanceReportRow,
    actor.user.id,
    body,
  );
  if (!result.ok) return NextResponse.json({ error: result.error, missing: result.missing }, { status: result.status });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can delete reports.' }, { status: 403 });
  }
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('*').eq('id', id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }
  const result = await deleteSchoolReportBook(
    actor.admin,
    report as SchoolPerformanceReportRow,
    actor.user.id,
    actor.profile.role,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
