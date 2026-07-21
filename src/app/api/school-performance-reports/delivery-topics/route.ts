import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import {
  extractDeliveryTopicCatalog,
  reportingWeekCount,
  type DeliveryCheckpoint,
} from '@/lib/school-reports/delivery-declaration';
import type { DeliveryDeclaration } from '@/lib/school-reports/delivery-declaration';
import { curriculaAppliesToSchool, loadSchoolProgrammeScope } from '@/lib/school-reports/school-curriculum-scope';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

async function loadPreviousCheckpoint(
  admin: SupabaseClient,
  schoolId: string,
  currentReportId: string,
): Promise<{ checkpoint: DeliveryCheckpoint; fromTermLabel: string; fromAcademicYear: string } | null> {
  const { data } = await admin
    .from('school_performance_reports')
    .select('id, snapshot, term_label, academic_year, updated_at')
    .eq('school_id', schoolId)
    .neq('id', currentReportId)
    .order('updated_at', { ascending: false })
    .limit(12);

  for (const row of data ?? []) {
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

/**
 * GET /api/school-performance-reports/delivery-topics?reportId=
 * Topic catalog for manual report delivery — no syllabus week tracking required.
 */
export async function GET(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can load delivery topics.' }, { status: 403 });
  }

  const reportId = req.nextUrl.searchParams.get('reportId')?.trim();
  if (!reportId) return NextResponse.json({ error: 'reportId is required.' }, { status: 400 });

  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();
  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }

  const row = report as SchoolPerformanceReportRow;
  const { data: academicTerm } = row.academic_term_id
    ? await actor.admin.from('academic_terms').select('term_number').eq('id', row.academic_term_id).maybeSingle()
    : { data: null };

  const academicTermNumber = Number(
    academicTerm?.term_number || row.snapshot?.period?.academicTermNumber || 1,
  );
  const range = {
    startTerm: row.curriculum_start_term,
    startWeek: row.curriculum_start_week,
    endTerm: row.curriculum_end_term,
    endWeek: row.curriculum_end_week,
  };

  const { data: curricula } = await actor.admin
    .from('course_curricula')
    .select('id, course_id, school_id, content, courses(title, programs(name))')
    .or(`school_id.eq.${row.school_id},school_id.is.null`)
    .limit(1000);

  const { data: students } = await actor.admin
    .from('portal_users')
    .select('id,class_id,full_name,section_class,grade,class_arm')
    .eq('role', 'student')
    .eq('school_id', row.school_id)
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .limit(5000);

  const schoolScope = await loadSchoolProgrammeScope(actor.admin, row.school_id, (students ?? []) as any[]);
  const schoolCourseIds = new Set(schoolScope.map((item) => item.courseId).filter(Boolean) as string[]);
  const scopedCurricula = (curricula ?? []).filter((item: { school_id?: string | null; course_id?: string | null }) =>
    curriculaAppliesToSchool(item, row.school_id, schoolCourseIds),
  );

  const catalog = extractDeliveryTopicCatalog(scopedCurricula, academicTermNumber, range);
  const reportingWeeks = reportingWeekCount(range);
  const previousCheckpoint = await loadPreviousCheckpoint(actor.admin, row.school_id, row.id);

  return NextResponse.json({
    catalog,
    reportingWeeks,
    range,
    academicTermNumber,
    schoolProgrammes: schoolScope.map((item) => ({
      programme: item.programme,
      course: item.course,
      enrolledStudents: item.enrolledStudents,
    })),
    existingDeclaration: row.snapshot?.deliveryDeclaration || null,
    previousCheckpoint,
  });
}
