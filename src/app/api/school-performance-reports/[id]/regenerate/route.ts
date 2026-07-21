import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { regenerateSchoolReportSnapshot } from '@/lib/school-reports/service';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/school-performance-reports/[id]/regenerate
 * Rebuilds the frozen snapshot from live data for the same period/curriculum range.
 * Drafts can also refresh AI narrative; published books stay wording-locked unless moved to draft.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can regenerate reports.' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const refreshNarrative = body?.refreshNarrative === true;

  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }

  if (report.status === 'published' && refreshNarrative) {
    return NextResponse.json(
      {
        error: 'Published wording is locked. Set the report to draft first if you need a new narrative.',
      },
      { status: 409 },
    );
  }

  if (report.status === 'published') {
    return NextResponse.json(
      {
        error: 'Published report books are frozen. Unpublish to draft before refreshing snapshot data.',
      },
      { status: 409 },
    );
  }

  try {
    let academicTermNumber = Number(report.snapshot?.period?.academicTermNumber || 0);
    if (!academicTermNumber && report.academic_term_id) {
      const { data: term } = await actor.admin
        .from('academic_terms')
        .select('term_number')
        .eq('id', report.academic_term_id)
        .maybeSingle();
      academicTermNumber = Number(term?.term_number || 1);
    }
    if (!academicTermNumber) academicTermNumber = 1;

    const reportForRegen = {
      ...(report as SchoolPerformanceReportRow),
      snapshot: {
        ...(report as SchoolPerformanceReportRow).snapshot,
        period: {
          ...((report as SchoolPerformanceReportRow).snapshot?.period || {}),
          academicTermNumber,
        },
      },
    } as SchoolPerformanceReportRow;

    const result = await regenerateSchoolReportSnapshot(actor.admin, reportForRegen, {
      refreshNarrative: refreshNarrative && report.status !== 'published',
    });

    const updates: Record<string, unknown> = {
      snapshot: result.snapshot,
      updated_at: new Date().toISOString(),
    };
    if (result.narrative) updates.narrative = result.narrative;

    const { error: updateError } = await actor.admin
      .from('school_performance_reports')
      .update(updates)
      .eq('id', id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      success: true,
      learnerCount: Array.isArray(result.snapshot.learners) ? result.snapshot.learners.length : 0,
      refreshedNarrative: Boolean(result.narrative),
      autoFilledTopics: Boolean(result.narrative?.topicsCovered && !String(report.narrative?.topicsCovered || '').trim()),
    });
  } catch (err) {
    console.error('[school-report] regenerate failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to regenerate report.' },
      { status: 500 },
    );
  }
}
