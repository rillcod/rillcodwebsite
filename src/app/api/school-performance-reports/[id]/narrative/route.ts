import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import {
  rewriteSchoolReportNarrativeFields,
  type NarrativeFieldKey,
} from '@/lib/school-reports/narrative';
import { isSchoolReportUuid } from '@/lib/school-reports/ids';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

const ALL_FIELDS: NarrativeFieldKey[] = [
  'executiveSummary',
  'topicsCovered',
  'achievements',
  'concerns',
  'recommendations',
  'nextPeriodFocus',
];

/**
 * POST /api/school-performance-reports/[id]/narrative
 * Fast AI wording generator — does NOT rebuild the snapshot.
 * Body: { fields?: NarrativeFieldKey[], currentNarrative?: SchoolReportNarrative, expectedRevision: number }
 *
 * The generated wording is returned to the editor as an unsaved draft. The
 * normal PATCH/autosave path remains the single revision-aware write path.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can generate wording.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isSchoolReportUuid(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const requested = Array.isArray(body?.fields)
    ? (body.fields as string[]).filter((field): field is NarrativeFieldKey =>
        ALL_FIELDS.includes(field as NarrativeFieldKey),
      )
    : ALL_FIELDS;
  const fields = requested.length ? requested : ALL_FIELDS;

  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }
  if (report.status === 'published') {
    return NextResponse.json(
      { error: 'Published wording is locked. Unlock to draft before regenerating AI text.' },
      { status: 409 },
    );
  }

  const currentLock = Number(report.lock_version ?? 1);
  if (!Number.isInteger(body?.expectedRevision) || Number(body.expectedRevision) !== currentLock) {
    return NextResponse.json(
      {
        error: 'This report changed before AI drafting started. Reload the latest version and try again.',
        code: 'REPORT_CONFLICT',
        lockVersion: currentLock,
      },
      { status: 409 },
    );
  }

  const row = report as SchoolPerformanceReportRow;
  const supplied = body?.currentNarrative && typeof body.currentNarrative === 'object'
    ? body.currentNarrative as Partial<SchoolReportNarrative>
    : null;
  const list = (value: unknown, fallback: string[]) =>
    Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : fallback;
  const current: SchoolReportNarrative = {
    executiveSummary: String(supplied?.executiveSummary ?? row.narrative?.executiveSummary ?? '').trim(),
    topicsCovered: String(supplied?.topicsCovered ?? row.narrative?.topicsCovered ?? '').trim() || undefined,
    achievements: list(supplied?.achievements, Array.isArray(row.narrative?.achievements) ? row.narrative.achievements : []),
    concerns: list(supplied?.concerns, Array.isArray(row.narrative?.concerns) ? row.narrative.concerns : []),
    recommendations: list(supplied?.recommendations, Array.isArray(row.narrative?.recommendations) ? row.narrative.recommendations : []),
    nextPeriodFocus: list(supplied?.nextPeriodFocus, Array.isArray(row.narrative?.nextPeriodFocus) ? row.narrative.nextPeriodFocus : []),
  };

  try {
    const started = Date.now();
    const { narrative, usedAi } = await rewriteSchoolReportNarrativeFields(row.snapshot, current, fields);

    return NextResponse.json({
      success: true,
      narrative,
      fields,
      usedAi,
      persisted: false,
      lockVersion: currentLock,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    console.error('[school-report] narrative generate failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to generate wording.' },
      { status: 500 },
    );
  }
}
