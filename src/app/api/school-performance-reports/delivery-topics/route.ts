import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { selectTopicKeysFromTracking } from '@/lib/school-reports/delivery-automation';
import {
  loadDeliveryTopicCatalogForReport,
  reportingWeekCount,
  type DeliveryCheckpoint,
} from '@/lib/school-reports/delivery-declaration';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
import type { DeliveryDeclaration } from '@/lib/school-reports/delivery-declaration';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

function boundedInt(value: string | null, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

async function loadPreviousCheckpoint(
  admin: SupabaseClient,
  schoolId: string,
  excludeReportId?: string | null,
): Promise<{ checkpoint: DeliveryCheckpoint; fromTermLabel: string; fromAcademicYear: string } | null> {
  const query = admin
    .from('school_performance_reports')
    .select('id, snapshot, term_label, academic_year, updated_at')
    .eq('school_id', schoolId)
    .order('updated_at', { ascending: false })
    .limit(12);

  const { data } = await query;
  for (const row of data ?? []) {
    if (excludeReportId && row.id === excludeReportId) continue;
    const decl = (row.snapshot as { deliveryDeclaration?: DeliveryDeclaration } | null)?.deliveryDeclaration;
    if (decl?.nextTermCheckpoint) {
      return {
        checkpoint: decl.nextTermCheckpoint,
        fromTermLabel: String(row.term_label || ''),
        fromAcademicYear: String(row.academic_year || ''),
      };
    }
  }
  return null;
}

async function loadStudentRows(admin: SupabaseClient, schoolId: string) {
  const { data: students } = await admin
    .from('portal_users')
    .select('id,class_id,full_name,section_class,grade,class_arm')
    .eq('role', 'student')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .limit(5000);
  return (students ?? []) as any[];
}

/**
 * GET /api/school-performance-reports/delivery-topics
 * Report mode: ?reportId=
 * Setup mode: ?schoolId=&academicTermId=&curriculumStartTerm=&curriculumStartWeek=&curriculumEndTerm=&curriculumEndWeek=
 */
export async function GET(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can load delivery topics.' }, { status: 403 });
  }

  const reportId = req.nextUrl.searchParams.get('reportId')?.trim();
  const setupSchoolId = req.nextUrl.searchParams.get('schoolId')?.trim();

  try {
  if (reportId) {
    if (!isSchoolReportUuid(reportId)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
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

    const academicTermNumber = Number(
      row.curriculum_start_term || academicTerm?.term_number || row.snapshot?.period?.academicTermNumber || 1,
    );
    const range = {
      startTerm: row.curriculum_start_term,
      startWeek: row.curriculum_start_week,
      endTerm: row.curriculum_end_term,
      endWeek: row.curriculum_end_week,
    };

    const studentRows = await loadStudentRows(actor.admin, row.school_id);
    const { catalog, resolvedCourses, schoolScope, missingCurriculumCourses } = await loadDeliveryTopicCatalogForReport(actor.admin, {
      schoolId: row.school_id,
      snapshot: row.snapshot,
      academicTermNumber,
      range,
      studentRows,
    });
    const reportingWeeks = reportingWeekCount(range);
    const previousCheckpoint = await loadPreviousCheckpoint(actor.admin, row.school_id, row.id);
    const suggestedTopicKeys = await selectTopicKeysFromTracking(actor.admin, row.school_id, catalog, range);

    return NextResponse.json({
      catalog,
      reportingWeeks,
      rangeStartWeek: range.startWeek,
      range,
      academicTermNumber,
      schoolProgrammes: schoolScope.map((item) => ({
        programme: item.programme,
        course: item.course,
        enrolledStudents: item.enrolledStudents,
      })),
      missingCurriculumCourses,
      resolvedCourses,
      existingDeclaration: row.snapshot?.deliveryDeclaration || null,
      previousCheckpoint,
      suggestedTopicKeys,
    });
  }

  if (!setupSchoolId) {
    return NextResponse.json({ error: 'reportId or schoolId is required.' }, { status: 400 });
  }
  if (!isSchoolReportUuid(setupSchoolId)) {
    return NextResponse.json({ error: 'Choose a valid school.' }, { status: 400 });
  }
  if (!canManageSchoolReport(actor, setupSchoolId)) {
    return NextResponse.json({ error: 'You cannot manage reports for this school.' }, { status: 403 });
  }

  const academicTermId = req.nextUrl.searchParams.get('academicTermId')?.trim();
  if (!academicTermId || !isSchoolReportUuid(academicTermId)) {
    return NextResponse.json({ error: 'academicTermId is required for setup delivery.' }, { status: 400 });
  }

  const startTerm = boundedInt(req.nextUrl.searchParams.get('curriculumStartTerm'), 1, 20);
  const startWeek = boundedInt(req.nextUrl.searchParams.get('curriculumStartWeek'), 1, 60);
  const endTerm = boundedInt(req.nextUrl.searchParams.get('curriculumEndTerm'), 1, 20);
  const endWeek = boundedInt(req.nextUrl.searchParams.get('curriculumEndWeek'), 1, 60);
  if (!startTerm || !startWeek || !endTerm || !endWeek || endTerm * 100 + endWeek < startTerm * 100 + startWeek) {
    return NextResponse.json({ error: 'Choose a valid curriculum term and week range.' }, { status: 400 });
  }

  const { data: academicTerm, error: termError } = await actor.admin
    .from('academic_terms')
    .select('term_number, term_label, academic_year')
    .eq('id', academicTermId)
    .maybeSingle();
  if (termError) return NextResponse.json({ error: termError.message }, { status: 500 });
  if (!academicTerm) {
    return NextResponse.json({ error: 'Academic term not found.' }, { status: 404 });
  }

  const academicTermNumber = Number(academicTerm.term_number || startTerm);
  const range = { startTerm, startWeek, endTerm, endWeek };
  const studentRows = await loadStudentRows(actor.admin, setupSchoolId);

  const { catalog, resolvedCourses, schoolScope, missingCurriculumCourses } = await loadDeliveryTopicCatalogForReport(actor.admin, {
    schoolId: setupSchoolId,
    academicTermNumber,
    range,
    studentRows,
  });

  const reportingWeeks = reportingWeekCount(range);
  const previousCheckpoint = await loadPreviousCheckpoint(actor.admin, setupSchoolId);
  const suggestedTopicKeys = await selectTopicKeysFromTracking(actor.admin, setupSchoolId, catalog, range);

  return NextResponse.json({
    catalog,
    reportingWeeks,
    rangeStartWeek: startWeek,
    range,
    academicTermNumber,
    schoolProgrammes: schoolScope.map((item) => ({
      programme: item.programme,
      course: item.course,
      enrolledStudents: item.enrolledStudents,
    })),
    resolvedCourses,
    existingDeclaration: null,
    previousCheckpoint,
    suggestedTopicKeys,
    termLabel: academicTerm.term_label,
    academicYear: academicTerm.academic_year,
    missingCurriculumCourses,
  });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load delivery topics.' },
      { status: 500 },
    );
  }
}
