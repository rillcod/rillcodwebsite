import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportSnapshot, type SchoolReportRange } from './aggregate';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportInsights } from './insights';
import { createSchoolReportNarrative } from './narrative';
import {
  applyDeliveryDeclarationToSnapshot,
  buildDeliveryDeclaration,
  buildTopicsCoveredFromDeclaration,
  extractDeliveryTopicCatalog,
  reportingWeekCount,
} from './delivery-declaration';
import {
  publishSchoolReportRevision,
  recordSchoolReportEvent,
  unlockSchoolReportForEditing,
} from './revisions';
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

  const academicTermNumber = Number(
    academicTerm?.term_number || report.snapshot?.period?.academicTermNumber || 1,
  );
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
    academicTermNumber,
  });

  const existingDecl = report.snapshot?.deliveryDeclaration;
  if (existingDecl?.selectedTopicKeys?.length) {
    const range = {
      startTerm: report.curriculum_start_term,
      startWeek: report.curriculum_start_week,
      endTerm: report.curriculum_end_term,
      endWeek: report.curriculum_end_week,
    };
    const { data: curricula } = await admin
      .from('course_curricula')
      .select('id, content, courses(title, programs(name))')
      .eq('school_id', report.school_id)
      .eq('is_visible_to_school', true)
      .limit(1000);
    const catalog = extractDeliveryTopicCatalog(curricula || [], academicTermNumber, range);
    Object.assign(
      snapshot,
      applyDeliveryDeclarationToSnapshot(snapshot, existingDecl, catalog.length),
    );
    snapshot.insights = buildSchoolReportInsights(snapshot);
    snapshot.completeness = buildSchoolReportCompleteness(snapshot);
  }

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
    deliveryDeclaration?: unknown;
    expectedRevision?: unknown;
    forcePublishReason?: unknown;
    withdrawReason?: unknown;
  },
  opts?: { actorRole?: string },
): Promise<
  | { ok: true; lockVersion: number; revisionNumber?: number }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      missing?: string[];
      lockVersion?: number;
      currentRevision?: number;
      updatedAt?: string;
    }
> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const published = report.status === 'published';
  /** Unpublishing must work even when the client accidentally sends narrative/design in the same PATCH. */
  const unlocking = published && body.status === 'draft';

  const hasContentChange =
    body.title !== undefined ||
    body.narrative !== undefined ||
    body.narrativePatch !== undefined ||
    body.design !== undefined ||
    body.deliveryDeclaration !== undefined ||
    (body.status !== undefined && body.status !== report.status);

  const currentLock = Number(report.lock_version ?? 1);
  if (hasContentChange) {
    if (body.expectedRevision === undefined || body.expectedRevision === null) {
      return {
        ok: false,
        status: 409,
        error: 'Missing revision token. Reload this report and try again.',
        lockVersion: currentLock,
      };
    }
    if (Number(body.expectedRevision) !== currentLock) {
      return {
        ok: false,
        status: 409,
        code: 'REPORT_CONFLICT',
        error: 'This report was updated by another staff member.',
        lockVersion: currentLock,
        currentRevision: currentLock,
        updatedAt: report.updated_at,
      };
    }
    updates.lock_version = currentLock + 1;
  }

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 180);
    if (title.length < 3) return { ok: false, status: 400, error: 'Enter a clear title.' };
    if (published && !unlocking) {
      return { ok: false, status: 409, error: 'Unlock this report before changing the title.' };
    }
    updates.title = title;
  }

  if (body.narrative && typeof body.narrative === 'object' && !Array.isArray(body.narrative)) {
    if (published && !unlocking) {
      return {
        ok: false,
        status: 409,
        error: 'Published report wording is locked. Unlock to edit, or archive and create a new draft.',
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
      if (body.autosave === true) return { ok: true, lockVersion: currentLock };
      return { ok: false, status: 400, error: 'The executive summary cannot be empty.' };
    }
    updates.narrative = narrative;
  } else if (body.narrativePatch && typeof body.narrativePatch === 'object' && !Array.isArray(body.narrativePatch)) {
    if (published && !unlocking) {
      return {
        ok: false,
        status: 409,
        error: 'Published report wording is locked. Unlock to edit.',
      };
    }
    const patch = body.narrativePatch as Partial<SchoolReportNarrative>;
    const narrative = cleanNarrative({ ...report.narrative, ...patch });
    if (!narrative) return { ok: false, status: 400, error: 'The executive summary cannot be empty.' };
    updates.narrative = narrative;
  }

  if (body.design && typeof body.design === 'object' && !Array.isArray(body.design)) {
    if (published && !unlocking) {
      return {
        ok: false,
        status: 409,
        error: 'Published report design is locked. Unlock to edit layout.',
      };
    }
    updates.design = normalizeSchoolReportDesign(body.design as Partial<SchoolPerformanceReportRow['design']>);
  }

  if (body.deliveryDeclaration && typeof body.deliveryDeclaration === 'object' && !Array.isArray(body.deliveryDeclaration)) {
    if (published && !unlocking) {
      return {
        ok: false,
        status: 409,
        error: 'Unlock this report before changing delivery topics.',
      };
    }
    const input = body.deliveryDeclaration as { selectedTopicKeys?: unknown };
    const selectedTopicKeys = Array.isArray(input.selectedTopicKeys)
      ? input.selectedTopicKeys.map(String).filter(Boolean)
      : [];
    const range = {
      startTerm: report.curriculum_start_term,
      startWeek: report.curriculum_start_week,
      endTerm: report.curriculum_end_term,
      endWeek: report.curriculum_end_week,
    };
    const reportingWeeks = reportingWeekCount(range);
    const academicTermNumber = Number(report.snapshot?.period?.academicTermNumber || 1);
    const { data: academicTerm } = report.academic_term_id
      ? await admin.from('academic_terms').select('term_number').eq('id', report.academic_term_id).maybeSingle()
      : { data: null };
    const termNumber = Number(academicTerm?.term_number || academicTermNumber);
    const { data: school } = await admin.from('schools').select('name').eq('id', report.school_id).maybeSingle();
    const { data: curricula } = await admin
      .from('course_curricula')
      .select('id, content, courses(title, programs(name))')
      .eq('school_id', report.school_id)
      .eq('is_visible_to_school', true)
      .limit(1000);
    const catalog = extractDeliveryTopicCatalog(curricula || [], termNumber, range);
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys,
      reportingWeeks,
      rangeStartWeek: report.curriculum_start_week,
      academicYear: report.academic_year,
      termLabel: report.term_label,
    });
    const nextSnapshot = applyDeliveryDeclarationToSnapshot(report.snapshot, declaration, catalog.length);
    nextSnapshot.insights = buildSchoolReportInsights(nextSnapshot);
    nextSnapshot.completeness = buildSchoolReportCompleteness(nextSnapshot);
    const topicsCovered = buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: school?.name || report.snapshot?.school?.name || 'School',
      termLabel: report.term_label,
      academicTermNumber: termNumber,
    });
    updates.snapshot = nextSnapshot;
    updates.narrative = cleanNarrative({
      ...report.narrative,
      topicsCovered,
    }) || {
      ...report.narrative,
      topicsCovered,
    };
  }

  if (body.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(String(body.status))) {
      return { ok: false, status: 400, error: 'Invalid report status.' };
    }
    const next = body.status as SchoolReportStatus;

    if (next === 'draft' && published) {
      try {
        await unlockSchoolReportForEditing(admin, report, actorUserId);
        updates.status = 'draft';
        updates.published_at = null;
        updates.published_by = null;
      } catch (unlockError) {
        return {
          ok: false,
          status: 500,
          error: unlockError instanceof Error ? unlockError.message : 'Unable to unlock report.',
          lockVersion: currentLock,
        };
      }
    } else if (next === 'published') {
      const completeness =
        report.snapshot?.completeness || buildSchoolReportCompleteness(report.snapshot);
      const force = body.forcePublish === true;
      const overrideReason = String(body.forcePublishReason || '').trim();
      if (force && opts?.actorRole !== 'admin') {
        return {
          ok: false,
          status: 403,
          error: 'Only administrators can override publication requirements.',
          lockVersion: currentLock,
        };
      }
      if (force && overrideReason.length < 8) {
        return {
          ok: false,
          status: 400,
          error: 'Enter a clear override reason (at least 8 characters) for admin force-publish.',
          lockVersion: currentLock,
        };
      }
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
          lockVersion: currentLock,
        };
      }

      if (Object.keys(updates).length > 1 || body.narrative || body.design || body.deliveryDeclaration) {
        const { error: prePublishError } = await admin
          .from('school_performance_reports')
          .update(updates)
          .eq('id', report.id);
        if (prePublishError) {
          return { ok: false, status: 500, error: prePublishError.message, lockVersion: currentLock };
        }
      }

      const mergedReport = {
        ...report,
        snapshot: (updates.snapshot as typeof report.snapshot) ?? report.snapshot,
        narrative: (updates.narrative as typeof report.narrative) ?? report.narrative,
        design: (updates.design as typeof report.design) ?? report.design,
      };

      try {
        const publishedRevision = await publishSchoolReportRevision(admin, mergedReport, actorUserId, {
          changeReason: force ? overrideReason : 'Published to school',
          forceOverride: force
            ? { reason: overrideReason, missing: (completeness.items || []).filter((i) => i.required && !i.ok).map((i) => i.label) }
            : undefined,
        });
        return { ok: true, lockVersion: currentLock + 1, revisionNumber: publishedRevision.revision_number };
      } catch (publishError) {
        return {
          ok: false,
          status: 500,
          error: publishError instanceof Error ? publishError.message : 'Unable to publish report.',
          lockVersion: currentLock,
        };
      }
    } else if (next === 'archived') {
      if (published) {
        if (opts?.actorRole !== 'admin') {
          return {
            ok: false,
            status: 403,
            error: 'Only administrators can withdraw a published report.',
            lockVersion: currentLock,
          };
        }
        const withdrawReason = String(body.withdrawReason || '').trim();
        if (withdrawReason.length < 8) {
          return {
            ok: false,
            status: 400,
            error: 'Enter a clear withdrawal reason (at least 8 characters).',
            lockVersion: currentLock,
          };
        }
        try {
          const { withdrawSchoolReportPublication } = await import('./revisions');
          await withdrawSchoolReportPublication(admin, report, actorUserId, withdrawReason);
          return { ok: true, lockVersion: currentLock + 1 };
        } catch (withdrawError) {
          return {
            ok: false,
            status: 500,
            error: withdrawError instanceof Error ? withdrawError.message : 'Unable to withdraw report.',
            lockVersion: currentLock,
          };
        }
      }
      updates.status = next;
    } else {
      updates.status = next;
    }
  }

  const { error } = await admin.from('school_performance_reports').update(updates).eq('id', report.id);
  if (error) return { ok: false, status: 500, error: error.message, lockVersion: currentLock };
  const nextLock = Number(updates.lock_version ?? currentLock);
  if (updates.status && updates.status !== report.status && updates.status !== 'archived') {
    await recordSchoolReportEvent(admin, {
      reportId: report.id,
      eventType: 'revision_created',
      actorId: actorUserId,
      payload: { status: updates.status },
    });
  }
  return { ok: true, lockVersion: nextLock };
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
