import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import {
  rewriteSchoolReportNarrativeFields,
  type NarrativeFieldKey,
} from '@/lib/school-reports/narrative';
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
 * Body: { fields?: NarrativeFieldKey[], persist?: boolean }
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can generate wording.' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const requested = Array.isArray(body?.fields)
    ? (body.fields as string[]).filter((field): field is NarrativeFieldKey =>
        ALL_FIELDS.includes(field as NarrativeFieldKey),
      )
    : ALL_FIELDS;
  const fields = requested.length ? requested : ALL_FIELDS;
  const persist = body?.persist === true;

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

  const row = report as SchoolPerformanceReportRow;
  const current: SchoolReportNarrative = {
    executiveSummary: String(row.narrative?.executiveSummary || ''),
    topicsCovered: row.narrative?.topicsCovered,
    achievements: Array.isArray(row.narrative?.achievements) ? row.narrative.achievements : [],
    concerns: Array.isArray(row.narrative?.concerns) ? row.narrative.concerns : [],
    recommendations: Array.isArray(row.narrative?.recommendations) ? row.narrative.recommendations : [],
    nextPeriodFocus: Array.isArray(row.narrative?.nextPeriodFocus) ? row.narrative.nextPeriodFocus : [],
  };

  try {
    const started = Date.now();
    const { narrative, usedAi } = await rewriteSchoolReportNarrativeFields(row.snapshot, current, fields);

    if (persist) {
      const { error: updateError } = await actor.admin
        .from('school_performance_reports')
        .update({ narrative, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw new Error(updateError.message);
    }

    return NextResponse.json({
      success: true,
      narrative,
      fields,
      usedAi,
      persisted: persist,
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
