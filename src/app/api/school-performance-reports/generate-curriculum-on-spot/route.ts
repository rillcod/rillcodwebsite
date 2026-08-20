import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { resolveDeliveryTermNumber } from '@/lib/school-reports/delivery-declaration';
import { generateReportDeliveryCurriculum } from '@/lib/school-reports/generate-on-spot';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function boundedInt(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export async function POST(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can generate curricula.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
  const setupSchoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';

  try {
    if (reportId) {
      if (!isSchoolReportUuid(reportId)) {
        return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
      }
      const { data: report, error } = await actor.admin
        .from('school_performance_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
      if (!canManageSchoolReport(actor, report.school_id)) {
        return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
      }

      const row = report as SchoolPerformanceReportRow;
      const { data: academicTerm } = row.academic_term_id
        ? await actor.admin.from('academic_terms').select('term_number').eq('id', row.academic_term_id).maybeSingle()
        : { data: null };
      const range = {
        startTerm: row.curriculum_start_term || row.snapshot?.period?.curriculumStart?.term || row.snapshot?.period?.academicTermNumber || 1,
        startWeek: row.curriculum_start_week || row.snapshot?.period?.curriculumStart?.week || 1,
        endTerm: row.curriculum_end_term || row.curriculum_start_term || row.snapshot?.period?.curriculumEnd?.term || 1,
        endWeek: row.curriculum_end_week || row.snapshot?.period?.curriculumEnd?.week || 14,
      };
      const termNumber = resolveDeliveryTermNumber(
        row.curriculum_start_term,
        academicTerm?.term_number,
        row.snapshot?.period?.academicTermNumber,
      );
      const result = await generateReportDeliveryCurriculum(actor.admin, {
        schoolId: row.school_id,
        createdBy: actor.user.id,
        schoolName: row.snapshot?.school?.name ?? null,
        termLabel: row.term_label ?? null,
        termNumber,
        range,
        snapshot: row.snapshot,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (!isSchoolReportUuid(setupSchoolId)) {
      return NextResponse.json({ error: 'reportId or schoolId is required.' }, { status: 400 });
    }
    if (!canManageSchoolReport(actor, setupSchoolId)) {
      return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
    }

    const academicTermId = typeof body.academicTermId === 'string' ? body.academicTermId.trim() : '';
    if (!isSchoolReportUuid(academicTermId)) {
      return NextResponse.json({ error: 'academicTermId is required for setup generation.' }, { status: 400 });
    }
    const startTerm = boundedInt(body.curriculumStartTerm, 1, 20);
    const startWeek = boundedInt(body.curriculumStartWeek, 1, 60);
    const endTerm = boundedInt(body.curriculumEndTerm, 1, 20);
    const endWeek = boundedInt(body.curriculumEndWeek, 1, 60);
    if (!startTerm || !startWeek || !endTerm || !endWeek || endTerm * 100 + endWeek < startTerm * 100 + startWeek) {
      return NextResponse.json({ error: 'Choose a valid curriculum term and week range.' }, { status: 400 });
    }

    const [{ data: academicTerm, error: termError }, { data: school, error: schoolError }] = await Promise.all([
      actor.admin.from('academic_terms').select('term_number, term_label').eq('id', academicTermId).maybeSingle(),
      actor.admin.from('schools').select('name').eq('id', setupSchoolId).maybeSingle(),
    ]);
    if (termError) return NextResponse.json({ error: termError.message }, { status: 500 });
    if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 });
    if (!academicTerm) return NextResponse.json({ error: 'Academic term not found.' }, { status: 404 });

    const result = await generateReportDeliveryCurriculum(actor.admin, {
      schoolId: setupSchoolId,
      createdBy: actor.user.id,
      schoolName: school?.name ?? null,
      termLabel: academicTerm.term_label ?? null,
      termNumber: resolveDeliveryTermNumber(startTerm, academicTerm.term_number),
      range: { startTerm, startWeek, endTerm, endWeek },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to generate programme topics.' },
      { status: status === 409 ? 409 : 500 },
    );
  }
}
