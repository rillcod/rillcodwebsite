import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

type TermMetrics = {
  reportId: string;
  title: string;
  termLabel: string;
  academicYear: string;
  periodEnd: string;
  status: string;
  activeStudents: number;
  studentsWithScores: number;
  averageScore: number;
  attendanceRate: number;
  learnersWithAttendance: number;
  curriculumCoverage: number;
  programmeCount: number;
};

function metricsFromReport(row: SchoolPerformanceReportRow): TermMetrics {
  const snapshot = row.snapshot as SchoolReportSnapshot;
  return {
    reportId: row.id,
    title: row.title,
    termLabel: row.term_label || snapshot?.period?.termLabel || 'Term',
    academicYear: row.academic_year || snapshot?.period?.academicYear || '',
    periodEnd: row.period_end,
    status: row.status,
    activeStudents: snapshot?.summary?.activeStudents ?? 0,
    studentsWithScores: snapshot?.summary?.studentsWithScores ?? 0,
    averageScore: snapshot?.summary?.averageScore ?? 0,
    attendanceRate: snapshot?.summary?.attendanceRate ?? 0,
    learnersWithAttendance: snapshot?.summary?.learnersWithAttendance ?? 0,
    curriculumCoverage: snapshot?.summary?.curriculumCoverage ?? 0,
    programmeCount: snapshot?.programmeCoursePerformance?.length ?? 0,
  };
}

/**
 * GET /api/school-performance-reports/[id]/cross-term
 * Compare this report with the most recent prior term book for the same school.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can view cross-term analytics.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isSchoolReportUuid(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot view this school report.' }, { status: 403 });
  }

  const current = report as SchoolPerformanceReportRow;
  const { data: siblings } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('school_id', current.school_id)
    .neq('id', id)
    .in('status', ['draft', 'published'])
    .order('period_end', { ascending: false })
    .limit(12);

  const previous = (siblings ?? [])
    .map((row: SchoolPerformanceReportRow) => row)
    .find(
      (row: SchoolPerformanceReportRow) =>
        row.academic_term_id !== current.academic_term_id ||
        String(row.period_end) < String(current.period_start),
    );

  return NextResponse.json({
    data: {
      current: metricsFromReport(current),
      previous: previous ? metricsFromReport(previous) : null,
    },
  });
}
