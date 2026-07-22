import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportInsights } from './insights';
import {
  applyDeliveryDeclarationToSnapshot,
  buildDeliveryDeclaration,
  loadDeliveryTopicCatalogForReport,
  reportingWeekCount,
  type DeliveryDeclaration,
} from './delivery-declaration';
import type { SchoolReportRange } from './aggregate';
import type { SchoolReportSnapshot } from './types';

type AnyClient = SupabaseClient<any>;

export type SetupDeliveryInput = {
  selectedTopicKeys: string[];
  reportingWeeks?: number;
};

export type SetupDeliveryResult = {
  snapshot: SchoolReportSnapshot;
  topicsCovered: string;
  declaration: DeliveryDeclaration;
};

/** Apply wizard-confirmed delivery topics onto a fresh snapshot before the draft is created. */
export async function applySetupDeliveryDeclaration(
  admin: AnyClient,
  schoolId: string,
  snapshot: SchoolReportSnapshot,
  range: SchoolReportRange,
  input: SetupDeliveryInput,
): Promise<SetupDeliveryResult | null> {
  const keys = input.selectedTopicKeys.filter(Boolean);
  if (!keys.length) return null;

  const { data: students } = await admin
    .from('portal_users')
    .select('id, class_id, grade, section_class')
    .eq('role', 'student')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .limit(5000);

  const curriculumRange = {
    startTerm: range.curriculumStartTerm,
    startWeek: range.curriculumStartWeek,
    endTerm: range.curriculumEndTerm,
    endWeek: range.curriculumEndWeek,
  };
  const academicTermNumber = Number(range.academicTermNumber || snapshot.period?.academicTermNumber || 1);
  const reportingWeeks = input.reportingWeeks ?? reportingWeekCount(curriculumRange);

  const { catalog } = await loadDeliveryTopicCatalogForReport(admin, {
    schoolId,
    snapshot,
    academicTermNumber,
    range: curriculumRange,
    studentRows: (students ?? []) as any[],
  });

  if (!catalog.length) return null;

  const declaration = buildDeliveryDeclaration({
    catalog,
    selectedTopicKeys: keys,
    reportingWeeks,
    rangeStartWeek: range.curriculumStartWeek,
    academicYear: range.academicYear,
    termLabel: range.termLabel,
  });
  declaration.manualOverride = true;
  declaration.autoApplied = false;

  const nextSnapshot = applyDeliveryDeclarationToSnapshot(snapshot, declaration, catalog.length);
  nextSnapshot.insights = buildSchoolReportInsights(nextSnapshot);
  nextSnapshot.completeness = buildSchoolReportCompleteness(nextSnapshot);

  return { snapshot: nextSnapshot, topicsCovered: '', declaration };
}
