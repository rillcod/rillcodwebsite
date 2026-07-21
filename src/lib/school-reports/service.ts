import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportSnapshot, type SchoolReportRange } from './aggregate';
import { buildSchoolReportCompleteness } from './completeness';
import { createSchoolReportNarrative } from './narrative';
import { buildTopicsCoveredDraft } from './delivered-topics';
import { normalizeSchoolReportDesign } from './design';
import type { SchoolPerformanceReportRow, SchoolReportNarrative, SchoolReportStatus } from './types';

type AnyClient = SupabaseClient<any>;

export type SchoolReportRangeInput = SchoolReportRange;

function cleanNarrative(input: Partial<SchoolReportNarrative> | null | undefined): SchoolReportNarrative | null {
  if (!input || typeof input !== 'object') return null;
  const cleanList = (value: unknown) =>
    Array.isArray(value)
      ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : [];
  const executiveSummary = String(input.executiveSummary || '').trim().slice(0, 2400);
  if (!executiveSummary) return null;
  return {
    executiveSummary,
    topicsCovered: String(input.topicsCovered || '').trim().slice(0, 3200) || undefined,
    achievements: cleanList(input.achievements),
    concerns: cleanList(input.concerns),
    recommendations: cleanList(input.recommendations),
    nextPeriodFocus: cleanList(input.nextPeriodFocus),
  };
}

/** Rebuild snapshot (and optionally refresh AI narrative) for an existing report. */
export async function regenerateSchoolReportSnapshot(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  opts?: { refreshNarrative?: boolean },
): Promise<{ snapshot: SchoolPerformanceReportRow['snapshot']; narrative?: SchoolReportNarrative }> {
  const { data: academicTerm } = report.academic_term_id
    ? await admin
        .from('academic_terms')
        .select('term_number')
        .eq('id', report.academic_term_id)
        .maybeSingle()
    : { data: null };

  const snapshot = await buildSchoolReportSnapshot(admin, report.school_id, {
    startDate: report.period_start,
    endDate: report.period_end,
    curriculumStartTerm: report.curriculum_start_term,
    curriculumStartWeek: report.curriculum_start_week,
    curriculumEndTerm: report.curriculum_end_term,
    curriculumEndWeek: report.curriculum_end_week,
    academicTermId: report.academic_term_id || '',
    academicYear: report.academic_year,
    termLabel: report.term_label,
    academicTermNumber: Number(academicTerm?.term_number || report.snapshot?.period?.academicTermNumber || 1),
  });

  const previousVersion = Number(report.snapshot?.snapshotVersion || 1);
  snapshot.snapshotVersion = Number.isFinite(previousVersion) ? previousVersion + 1 : 2;
  snapshot.completeness = buildSchoolReportCompleteness(snapshot);

  if (opts?.refreshNarrative) {
    const narrative = await createSchoolReportNarrative(snapshot);
    return { snapshot, narrative };
  }

  const existingTopics = String(report.narrative?.topicsCovered || '').trim();
  if (!existingTopics) {
    const draft = buildTopicsCoveredDraft(snapshot);
    if (draft.trim()) {
      return {
        snapshot,
        narrative: {
          ...report.narrative,
          topicsCovered: draft,
        },
      };
    }
  }

  return { snapshot };
}

export async function applySchoolReportPatch(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
  body: {
    title?: unknown;
    narrative?: unknown;
    narrativePatch?: unknown;
    design?: unknown;
    autosave?: unknown;
    status?: unknown;
    forcePublish?: unknown;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string; missing?: string[] }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const published = report.status === 'published';

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 180);
    if (title.length < 3) return { ok: false, status: 400, error: 'Enter a clear title.' };
    if (published) return { ok: false, status: 409, error: 'Unpublish or archive before changing a published title.' };
    updates.title = title;
  }

  if (body.narrative && typeof body.narrative === 'object' && !Array.isArray(body.narrative)) {
    if (published) {
      return {
        ok: false,
        status: 409,
        error: 'Published report wording is locked. Set status to draft to edit, or regenerate a new draft.',
      };
    }
    const incoming = body.narrative as Partial<SchoolReportNarrative>;
    const merged: Partial<SchoolReportNarrative> = body.autosave === true
      ? {
          executiveSummary: incoming.executiveSummary ?? report.narrative.executiveSummary,
          topicsCovered: incoming.topicsCovered ?? report.narrative.topicsCovered,
          achievements: incoming.achievements ?? report.narrative.achievements,
          concerns: incoming.concerns ?? report.narrative.concerns,
          recommendations: incoming.recommendations ?? report.narrative.recommendations,
          nextPeriodFocus: incoming.nextPeriodFocus ?? report.narrative.nextPeriodFocus,
        }
      : incoming;
    const narrative = cleanNarrative(merged);
    if (!narrative) {
      if (body.autosave === true) return { ok: true };
      return { ok: false, status: 400, error: 'The executive summary cannot be empty.' };
    }
    updates.narrative = narrative;
  } else if (body.narrativePatch && typeof body.narrativePatch === 'object' && !Array.isArray(body.narrativePatch)) {
    if (published) {
      return {
        ok: false,
        status: 409,
        error: 'Published report wording is locked. Set status to draft to edit.',
      };
    }
    const patch = body.narrativePatch as Partial<SchoolReportNarrative>;
    const narrative = cleanNarrative({ ...report.narrative, ...patch });
    if (!narrative) return { ok: false, status: 400, error: 'The executive summary cannot be empty.' };
    updates.narrative = narrative;
  }

  if (body.design && typeof body.design === 'object' && !Array.isArray(body.design)) {
    if (published) {
      return {
        ok: false,
        status: 409,
        error: 'Published report design is locked. Set status to draft to edit layout.',
      };
    }
    updates.design = normalizeSchoolReportDesign(body.design as Partial<SchoolPerformanceReportRow['design']>);
  }

  if (body.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(String(body.status))) {
      return { ok: false, status: 400, error: 'Invalid report status.' };
    }
    const next = body.status as SchoolReportStatus;

    if (next === 'published') {
      const completeness =
        report.snapshot?.completeness || buildSchoolReportCompleteness(report.snapshot);
      const force = body.forcePublish === true;
      if (!completeness.readyToPublish && !force) {
        const missing = (completeness.items || [])
          .filter((item) => item.required && !item.ok)
          .map((item) => item.label);
        return {
          ok: false,
          status: 409,
          error: missing.includes('School invoice for this term')
            ? 'Attach a matching school invoice for this term (generate/label it in School Billing), refresh the snapshot, then publish.'
            : `Report is incomplete. Finish: ${missing.join(', ')}. Refresh snapshot after fixing, then publish.`,
          missing,
        };
      }
      updates.published_at = new Date().toISOString();
      updates.published_by = actorUserId;
    }

    updates.status = next;
    if (next === 'draft') {
      updates.published_at = null;
      updates.published_by = null;
    }
  }

  const { error } = await admin.from('school_performance_reports').update(updates).eq('id', report.id);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

export function hasLearnerRoster(snapshot: SchoolPerformanceReportRow['snapshot'] | null | undefined): boolean {
  return Array.isArray(snapshot?.learners) && snapshot!.learners!.length > 0;
}

export async function deleteSchoolReportBook(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
  actorRole: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (report.status === 'published') {
    return { ok: false, status: 409, error: 'Unpublish or archive this book before deleting it.' };
  }
  if (actorRole !== 'admin' && report.created_by !== actorUserId) {
    return { ok: false, status: 403, error: 'Only the creator or an admin can delete this draft.' };
  }
  const { error } = await admin.from('school_performance_reports').delete().eq('id', report.id);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
