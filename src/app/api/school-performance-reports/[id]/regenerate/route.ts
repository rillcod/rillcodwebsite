import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { logAuditEvent } from '@/lib/observability/audit-events';
import { regenerateSchoolReportSnapshot } from '@/lib/school-reports/service';
import { recordSchoolReportEvent } from '@/lib/school-reports/revisions';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
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
  if (!isSchoolReportUuid(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const refreshNarrative = body?.refreshNarrative === true;
  const refreshAndReady = body?.refreshAndReady === true;
  const expectedRevision = Number(body?.expectedRevision);

  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }

  const currentLock = Number(report.lock_version ?? 1);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentLock) {
    return NextResponse.json(
      {
        error: 'This report changed before the refresh started. Reload the latest version and try again.',
        code: 'REPORT_CONFLICT',
        lockVersion: currentLock,
      },
      { status: 409 },
    );
  }

  if (report.status === 'published' && (refreshNarrative || refreshAndReady)) {
    return NextResponse.json(
      {
        error: 'Published wording is locked. Unlock to draft first if you need a new narrative.',
      },
      { status: 409 },
    );
  }

  if (report.status === 'published') {
    return NextResponse.json(
      {
        error: 'Published report books are frozen. Unlock to draft before refreshing snapshot data.',
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
      refreshAndReady: refreshAndReady && report.status !== 'published',
    });

    const updates: Record<string, unknown> = {
      snapshot: result.snapshot,
      updated_at: new Date().toISOString(),
      lock_version: currentLock + 1,
    };
    if (result.narrative) updates.narrative = result.narrative;

    const { data: updated, error: updateError } = await actor.admin
      .from('school_performance_reports')
      .update(updates)
      .eq('id', id)
      .eq('lock_version', currentLock)
      .select('id,lock_version')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json(
        {
          error: 'Another staff member saved this report during the refresh. Reload the latest version and try again.',
          code: 'REPORT_CONFLICT',
          lockVersion: currentLock,
        },
        { status: 409 },
      );
    }

    logAuditEvent('report.regenerate', {
      reportId: id,
      schoolId: report.school_id,
      refreshNarrative,
      learnerCount: Array.isArray(result.snapshot.learners) ? result.snapshot.learners.length : 0,
    });
    try {
      await recordSchoolReportEvent(actor.admin, {
        reportId: id,
        eventType: 'regenerated',
        actorId: actor.user.id,
        payload: {
          refreshNarrative,
          refreshAndReady,
          snapshotVersion: result.snapshot.snapshotVersion ?? null,
          autoAppliedDelivery: Boolean(result.autoAppliedDelivery),
          autoDeliverySource: result.autoDeliverySource || null,
        },
      });
    } catch (auditError) {
      console.error('[school-report] refresh audit event failed:', auditError);
    }

    return NextResponse.json({
      success: true,
      learnerCount: Array.isArray(result.snapshot.learners) ? result.snapshot.learners.length : 0,
      refreshedNarrative: Boolean(result.narrative),
      autoFilledTopics: Boolean(result.narrative?.topicsCovered && !String(report.narrative?.topicsCovered || '').trim()),
      autoAppliedDelivery: Boolean(result.autoAppliedDelivery),
      autoDeliverySource: result.autoDeliverySource || null,
      refreshAndReady,
      lockVersion: Number(updated.lock_version || currentLock + 1),
    });
  } catch (err) {
    console.error('[school-report] regenerate failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to regenerate report.' },
      { status: 500 },
    );
  }
}
