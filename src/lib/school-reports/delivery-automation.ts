import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportInsights } from './insights';
import {
  applyDeliveryDeclarationToSnapshot,
  buildDeliveryDeclaration,
  buildTopicsCoveredFromDeclaration,
  loadDeliveryTopicCatalogForReport,
  reportingWeekCount,
  topicInReportRange,
  type DeliveryDeclaration,
  type DeliveryTopicOption,
} from './delivery-declaration';
import type { SchoolReportPolicy } from './report-policy';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';

type AnyClient = SupabaseClient<any>;

export type AutoDeliveryResult = {
  snapshot: SchoolReportSnapshot;
  topicsCovered?: string;
  autoApplied: boolean;
  autoSource?: DeliveryDeclaration['autoSource'];
};

const TRACKED_STATUSES = new Set(['completed', 'in_progress']);

/** Map curriculum week tracking rows to tickable catalog keys. */
export async function selectTopicKeysFromTracking(
  admin: AnyClient,
  schoolId: string,
  catalog: DeliveryTopicOption[],
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
): Promise<string[]> {
  if (!catalog.length) return [];

  const curriculumIds = [...new Set(catalog.map((row) => row.curriculumId).filter(Boolean))];
  if (!curriculumIds.length) return [];

  const { data: tracking } = await admin
    .from('curriculum_week_tracking')
    .select('curriculum_id,term_number,week_number,status')
    .eq('school_id', schoolId)
    .in('curriculum_id', curriculumIds);

  const trackedKeys = new Set(
    (tracking ?? [])
      .filter((row) => TRACKED_STATUSES.has(String(row.status || '').toLowerCase()))
      .filter((row) =>
        topicInReportRange(Number(row.term_number), Number(row.week_number), range),
      )
      .map((row) => `${row.curriculum_id}::${row.term_number}::${row.week_number}`),
  );

  return catalog.filter((topic) => trackedKeys.has(topic.key)).map((topic) => topic.key);
}

export function selectAllCatalogTopicKeys(catalog: DeliveryTopicOption[]): string[] {
  return catalog.map((topic) => topic.key);
}

function automationEnabled(policy: SchoolReportPolicy): boolean {
  return (
    policy.automation.autoApplyDeliveryFromTracking ||
    policy.automation.autoFillDeliveryOnRefresh
  );
}

/** Auto-build delivery declaration from tracking or catalog — never replaces manual staff picks. */
export async function tryAutoApplyDeliveryDeclaration(
  admin: AnyClient,
  input: {
    report: Pick<
      SchoolPerformanceReportRow,
      | 'school_id'
      | 'curriculum_start_term'
      | 'curriculum_start_week'
      | 'curriculum_end_term'
      | 'curriculum_end_week'
      | 'academic_year'
      | 'term_label'
      | 'academic_term_id'
      | 'snapshot'
    >;
    snapshot: SchoolReportSnapshot;
    policy: SchoolReportPolicy;
    existingDeclaration?: DeliveryDeclaration | null;
  },
): Promise<AutoDeliveryResult> {
  const existing = input.existingDeclaration ?? input.snapshot.deliveryDeclaration;
  if (existing?.manualOverride) {
    return { snapshot: input.snapshot, autoApplied: false };
  }
  if (!automationEnabled(input.policy)) {
    return { snapshot: input.snapshot, autoApplied: false };
  }

  const range = {
    startTerm: input.report.curriculum_start_term,
    startWeek: input.report.curriculum_start_week,
    endTerm: input.report.curriculum_end_term,
    endWeek: input.report.curriculum_end_week,
  };
  const reportingWeeks = reportingWeekCount(range);
  const academicTermNumber = Number(
    input.report.curriculum_start_term || input.snapshot.period?.academicTermNumber || 1,
  );

  const { catalog } = await loadDeliveryTopicCatalogForReport(admin, {
    schoolId: input.report.school_id,
    snapshot: input.snapshot,
    academicTermNumber,
    range,
  });

  if (!catalog.length) {
    return { snapshot: input.snapshot, autoApplied: false };
  }

  let selectedTopicKeys: string[] = [];
  let autoSource: DeliveryDeclaration['autoSource'] = 'catalog';

  if (input.policy.automation.autoApplyDeliveryFromTracking) {
    selectedTopicKeys = await selectTopicKeysFromTracking(admin, input.report.school_id, catalog, range);
    if (selectedTopicKeys.length) autoSource = 'tracking';
  }

  if (!selectedTopicKeys.length && input.policy.automation.autoFillDeliveryOnRefresh) {
    selectedTopicKeys = selectAllCatalogTopicKeys(catalog);
    autoSource = 'catalog';
  }

  if (!selectedTopicKeys.length) {
    return { snapshot: input.snapshot, autoApplied: false };
  }

  const declaration = buildDeliveryDeclaration({
    catalog,
    selectedTopicKeys,
    reportingWeeks,
    rangeStartWeek: input.report.curriculum_start_week,
    academicYear: input.report.academic_year,
    termLabel: input.report.term_label,
  });
  declaration.autoApplied = true;
  declaration.manualOverride = false;
  declaration.autoSource = autoSource;

  const nextSnapshot = applyDeliveryDeclarationToSnapshot(input.snapshot, declaration, catalog.length);
  nextSnapshot.insights = buildSchoolReportInsights(nextSnapshot);
  nextSnapshot.completeness = buildSchoolReportCompleteness(nextSnapshot);

  const topicsCovered = buildTopicsCoveredFromDeclaration(declaration, {
    schoolName: input.snapshot.school?.name || 'School',
    termLabel: input.report.term_label,
    academicTermNumber,
  });

  return { snapshot: nextSnapshot, topicsCovered, autoApplied: true, autoSource };
}

/** Re-apply a saved declaration after snapshot refresh (manual or prior auto). */
export function reapplySavedDeliveryDeclaration(
  snapshot: SchoolReportSnapshot,
  declaration: DeliveryDeclaration,
  catalogSize: number,
): SchoolReportSnapshot {
  const next = applyDeliveryDeclarationToSnapshot(snapshot, declaration, catalogSize);
  next.insights = buildSchoolReportInsights(next);
  next.completeness = buildSchoolReportCompleteness(next);
  return next;
}
