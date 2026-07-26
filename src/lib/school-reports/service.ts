import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportSnapshot, type SchoolReportRange } from './aggregate';
import { buildSchoolReportCompleteness } from './completeness';
import {
  reapplySavedDeliveryDeclaration,
  tryAutoApplyDeliveryDeclaration,
} from './delivery-automation';
import { buildSchoolReportInsights } from './insights';
import { createSchoolReportNarrative } from './narrative';
import {
  applyDeliveryDeclarationToSnapshot,
  buildDeliveryDeclaration,
  buildTopicsCoveredFromDeclaration,
  loadDeliveryTopicCatalogForReport,
  normalizeReportingWeeks,
  reportingWeekCount,
} from './delivery-declaration';
import { resolveFinanceReportPeriod } from './loaders/finance';
import { loadSchoolReportPolicy } from './report-policy';
import {
  publishSchoolReportRevision,
  recordSchoolReportEvent,
  unlockSchoolReportForEditing,
} from './revisions';
import { buildTopicsCoveredDraft, buildReportTopicsPresentation } from './delivered-topics';
import {
  buildTopicsCoveredPresentation,
  resolveLeadershipNarrativeForDisplay,
} from './topics-covered-presentation';
import { normalizeSchoolReportDesign } from './design';
import { normalizeLeadershipReportStory } from './leadership-story';
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
    topicsCovered: normalizeLeadershipReportStory(String(input.topicsCovered || '').trim()) || undefined,
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
  opts?: { refreshNarrative?: boolean; refreshAndReady?: boolean },
): Promise<{
  snapshot: SchoolPerformanceReportRow['snapshot'];
  narrative?: SchoolReportNarrative;
  autoAppliedDelivery?: boolean;
  autoDeliverySource?: 'tracking' | 'catalog';
}> {
  const { data: academicTerm } = report.academic_term_id
    ? await admin
        .from('academic_terms')
        .select('term_number, academic_year, term_label, start_date, end_date')
        .eq('id', report.academic_term_id)
        .maybeSingle()
    : { data: null };

  const academicTermNumber = Number(
    academicTerm?.term_number || report.snapshot?.period?.academicTermNumber || 1,
  );
  const baseRange: SchoolReportRange = {
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
  };
  const canonicalPeriod = await resolveFinanceReportPeriod(admin, baseRange);
  const snapshot = await buildSchoolReportSnapshot(admin, report.school_id, {
    ...baseRange,
    startDate: canonicalPeriod.periodStart || baseRange.startDate,
    endDate: canonicalPeriod.periodEnd || baseRange.endDate,
    academicYear: canonicalPeriod.academicYear,
    termLabel: canonicalPeriod.termLabel,
    academicTermNumber: canonicalPeriod.academicTermNumber,
  });

  const existingDecl = report.snapshot?.deliveryDeclaration;
  const range = {
    startTerm: report.curriculum_start_term,
    startWeek: report.curriculum_start_week,
    endTerm: report.curriculum_end_term,
    endWeek: report.curriculum_end_week,
  };
  const policy = await loadSchoolReportPolicy(admin);
  let autoAppliedDelivery = false;
  let autoDeliverySource: 'tracking' | 'catalog' | undefined;

  if (existingDecl?.manualOverride && existingDecl.selectedTopicKeys?.length) {
    const { catalog } = await loadDeliveryTopicCatalogForReport(admin, {
      schoolId: report.school_id,
      snapshot: report.snapshot,
      academicTermNumber,
      range,
    });
    Object.assign(
      snapshot,
      reapplySavedDeliveryDeclaration(snapshot, existingDecl, catalog.length, report.design),
    );
  } else {
    const autoResult = await tryAutoApplyDeliveryDeclaration(admin, {
      report,
      snapshot,
      policy,
      existingDeclaration: existingDecl,
    });
    if (autoResult.autoApplied) {
      Object.assign(snapshot, autoResult.snapshot);
      autoAppliedDelivery = true;
      autoDeliverySource = autoResult.autoSource;
    } else if (existingDecl?.selectedTopicKeys?.length) {
      const { catalog } = await loadDeliveryTopicCatalogForReport(admin, {
        schoolId: report.school_id,
        snapshot: report.snapshot,
        academicTermNumber,
        range,
      });
      Object.assign(
        snapshot,
        reapplySavedDeliveryDeclaration(snapshot, existingDecl, catalog.length, report.design),
      );
    }
  }

  const previousVersion = Number(report.snapshot?.snapshotVersion || 1);
  snapshot.snapshotVersion = Number.isFinite(previousVersion) ? previousVersion + 1 : 2;
  snapshot.completeness = buildSchoolReportCompleteness(snapshot, report.design);

  const refreshNarrative =
    opts?.refreshNarrative === true
    || (opts?.refreshAndReady === true && policy.automation.refreshAndReadyIncludesNarrative);

  if (refreshNarrative) {
    const narrative = await createSchoolReportNarrative(snapshot);
    return { snapshot, narrative, autoAppliedDelivery, autoDeliverySource };
  }

  const existingTopics = String(report.narrative?.topicsCovered || '').trim();
  const hasStructuredDelivery = Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const presentation = buildReportTopicsPresentation(snapshot);
  const preservedLeadershipNarrative = resolveLeadershipNarrativeForDisplay(
    report.narrative?.topicsCovered,
    presentation,
    { fallbackDraft: buildTopicsCoveredDraft(snapshot) },
  );

  if (autoAppliedDelivery && hasStructuredDelivery && existingTopics && !preservedLeadershipNarrative) {
    return {
      snapshot,
      narrative: {
        ...report.narrative,
        topicsCovered: undefined,
      },
      autoAppliedDelivery,
      autoDeliverySource,
    };
  }

  if ((!existingTopics || autoAppliedDelivery) && !hasStructuredDelivery) {
    const draft = buildTopicsCoveredDraft(snapshot);
    if (draft.trim()) {
      return {
        snapshot,
        narrative: {
          ...report.narrative,
          topicsCovered: draft,
        },
        autoAppliedDelivery,
        autoDeliverySource,
      };
    }
  }

  return { snapshot, autoAppliedDelivery, autoDeliverySource };
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
  const deliveryOnlyChange =
    body.deliveryDeclaration !== undefined &&
    body.title === undefined &&
    body.narrative === undefined &&
    body.narrativePatch === undefined &&
    body.design === undefined &&
    body.status === undefined;
  const expectedRevision =
    body.expectedRevision === undefined || body.expectedRevision === null
      ? deliveryOnlyChange
        ? currentLock
        : null
      : body.expectedRevision;

  if (hasContentChange) {
    if (expectedRevision === null) {
      return {
        ok: false,
        status: 409,
        error: 'Missing revision token. Reload this report and try again.',
        lockVersion: currentLock,
      };
    }
    if (Number(expectedRevision) !== currentLock) {
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
    const nextDesign = normalizeSchoolReportDesign(body.design as Partial<SchoolPerformanceReportRow['design']>);
    updates.design = nextDesign;
    const nextSnapshot = { ...report.snapshot };
    nextSnapshot.completeness = buildSchoolReportCompleteness(nextSnapshot, nextDesign);
    updates.snapshot = nextSnapshot;
  }

  if (body.deliveryDeclaration && typeof body.deliveryDeclaration === 'object' && !Array.isArray(body.deliveryDeclaration)) {
    if (published && !unlocking) {
      return {
        ok: false,
        status: 409,
        error: 'Unlock this report before changing delivery topics.',
      };
    }
    const input = body.deliveryDeclaration as { selectedTopicKeys?: unknown; reportingWeeks?: unknown };
    const selectedTopicKeys = Array.isArray(input.selectedTopicKeys)
      ? input.selectedTopicKeys.map(String).filter(Boolean)
      : [];
    const range = {
      startTerm: report.curriculum_start_term,
      startWeek: report.curriculum_start_week,
      endTerm: report.curriculum_end_term,
      endWeek: report.curriculum_end_week,
    };
    const reportingWeeksFromRange = reportingWeekCount(range);
    const reportingWeeks = Number.isFinite(Number(input.reportingWeeks)) && Number(input.reportingWeeks) > 0
      ? normalizeReportingWeeks(Number(input.reportingWeeks))
      : reportingWeeksFromRange;
    const academicTermNumber = Number(report.snapshot?.period?.academicTermNumber || 1);
    const { data: academicTerm } = report.academic_term_id
      ? await admin.from('academic_terms').select('term_number').eq('id', report.academic_term_id).maybeSingle()
      : { data: null };
    const termNumber = Number(
      report.curriculum_start_term || academicTerm?.term_number || academicTermNumber,
    );
    const { data: school } = await admin.from('schools').select('name').eq('id', report.school_id).maybeSingle();
    const { catalog } = await loadDeliveryTopicCatalogForReport(admin, {
      schoolId: report.school_id,
      snapshot: report.snapshot,
      academicTermNumber: termNumber,
      range,
    });
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys,
      reportingWeeks,
      rangeStartWeek: report.curriculum_start_week,
      academicYear: report.academic_year,
      termLabel: report.term_label,
    });
    declaration.manualOverride = true;
    declaration.autoApplied = false;
    declaration.autoSource = undefined;
    const nextSnapshot = applyDeliveryDeclarationToSnapshot(report.snapshot, declaration, catalog.length);
    nextSnapshot.insights = buildSchoolReportInsights(nextSnapshot);
    nextSnapshot.completeness = buildSchoolReportCompleteness(nextSnapshot, report.design);
    const topicsCovered = buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: school?.name || report.snapshot?.school?.name || 'School',
      termLabel: report.term_label,
      academicTermNumber: termNumber,
    });
    const presentation = buildTopicsCoveredPresentation(declaration, {
      schoolName: school?.name || report.snapshot?.school?.name || 'School',
      termLabel: report.term_label,
      academicTermNumber: termNumber,
    });
    const preservedTopics = resolveLeadershipNarrativeForDisplay(
      report.narrative?.topicsCovered,
      presentation,
      { fallbackDraft: topicsCovered },
    );
    updates.snapshot = nextSnapshot;
    updates.narrative = cleanNarrative({
      ...report.narrative,
      topicsCovered: preservedTopics || undefined,
    }) || {
      ...report.narrative,
      topicsCovered: preservedTopics || undefined,
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
      const publishDesign = normalizeSchoolReportDesign(
        (updates.design as SchoolPerformanceReportRow['design']) ?? report.design,
      );
      const completeness =
        buildSchoolReportCompleteness(
          (updates.snapshot as typeof report.snapshot) ?? report.snapshot,
          publishDesign,
        );
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

  // Optimistic locking has to be enforced by the WRITE, not only by the check
  // above. `report` was read before this function ran, so two staff saving at the
  // same moment both see lock_version = N, both pass that guard, and both write
  // N+1 — the later write silently discarding the earlier author's work, which is
  // exactly the last-write-wins overwrite this column exists to prevent.
  // Scoping the update to the version we validated makes the loser match zero
  // rows, so it can be told to reload instead of destroying someone's edit.
  let updateQuery = admin.from('school_performance_reports').update(updates).eq('id', report.id);
  if (updates.lock_version !== undefined) {
    updateQuery = updateQuery.eq('lock_version', currentLock);
  }
  const { data: updatedRows, error } = await updateQuery.select('id');
  if (error) return { ok: false, status: 500, error: error.message, lockVersion: currentLock };

  if (updates.lock_version !== undefined && (updatedRows ?? []).length === 0) {
    const { data: fresh } = await admin
      .from('school_performance_reports')
      .select('lock_version,updated_at')
      .eq('id', report.id)
      .maybeSingle();
    const freshLock = Number(fresh?.lock_version ?? currentLock);
    return {
      ok: false,
      status: 409,
      code: 'REPORT_CONFLICT',
      error: 'This report was updated by another staff member.',
      lockVersion: freshLock,
      currentRevision: freshLock,
      updatedAt: fresh?.updated_at ?? report.updated_at,
    };
  }

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
