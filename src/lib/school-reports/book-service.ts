import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportSnapshot } from './aggregate';
import { buildSchoolReportCompleteness } from './completeness';
import type { SchoolReportDesignSettings } from './design';
import { tryAutoApplyDeliveryDeclaration } from './delivery-automation';
import { createSchoolReportNarrative } from './narrative';
import { loadSchoolReportPolicy } from './report-policy';
import { ensureWorkingRevision } from './revisions';
import { applySetupDeliveryDeclaration } from './setup-delivery';
import type { SchoolReportRange } from './loaders';

type AnyClient = SupabaseClient<any>;

export type CreateSchoolReportBookInput = {
  schoolId: string;
  title: string;
  range: SchoolReportRange;
  createdBy: string;
  design?: SchoolReportDesignSettings | null;
  delivery?: {
    selectedTopicKeys: string[];
    reportingWeeks?: number;
  } | null;
};

/**
 * Create the one shared report book for a school and academic term.
 *
 * Both the staff-facing route and the scheduled term bootstrap use this exact
 * operation. The database unique index remains the final race guard, while the
 * caller can safely treat a duplicate insert as a request to open the existing
 * book instead of creating a second reporting world.
 */
export async function createSchoolReportBookDraft(
  admin: AnyClient,
  input: CreateSchoolReportBookInput,
): Promise<{ id: string; created: boolean }> {
  const policy = await loadSchoolReportPolicy(admin);
  let snapshot = await buildSchoolReportSnapshot(admin, input.schoolId, input.range);

  const setupResult = input.delivery?.selectedTopicKeys.length
    ? await applySetupDeliveryDeclaration(admin, input.schoolId, snapshot, input.range, {
        selectedTopicKeys: input.delivery.selectedTopicKeys,
        reportingWeeks: input.delivery.reportingWeeks,
      })
    : null;
  if (setupResult) snapshot = setupResult.snapshot;

  if (!setupResult) {
    const autoResult = await tryAutoApplyDeliveryDeclaration(admin, {
      report: {
        school_id: input.schoolId,
        curriculum_start_term: input.range.curriculumStartTerm,
        curriculum_start_week: input.range.curriculumStartWeek,
        curriculum_end_term: input.range.curriculumEndTerm,
        curriculum_end_week: input.range.curriculumEndWeek,
        academic_year: input.range.academicYear,
        term_label: input.range.termLabel,
        academic_term_id: input.range.academicTermId,
        snapshot,
        design: input.design ?? undefined,
      },
      snapshot,
      policy,
    });
    if (autoResult.autoApplied) snapshot = autoResult.snapshot;
  }

  const narrative = await createSchoolReportNarrative(snapshot);
  snapshot = {
    ...snapshot,
    completeness: buildSchoolReportCompleteness(snapshot, input.design),
  };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('school_performance_reports')
    .insert({
      school_id: input.schoolId,
      title: input.title,
      period_start: input.range.startDate,
      period_end: input.range.endDate,
      curriculum_start_term: input.range.curriculumStartTerm,
      curriculum_start_week: input.range.curriculumStartWeek,
      academic_term_id: input.range.academicTermId,
      academic_year: input.range.academicYear,
      term_label: input.range.termLabel,
      curriculum_end_term: input.range.curriculumEndTerm,
      curriculum_end_week: input.range.curriculumEndWeek,
      snapshot,
      narrative,
      design: input.design ?? null,
      status: 'draft',
      created_by: input.createdBy,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await admin
      .from('school_performance_reports')
      .select('id')
      .eq('school_id', input.schoolId)
      .eq('academic_term_id', input.range.academicTermId)
      .in('status', ['draft', 'published'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.id) return { id: String(existing.id), created: false };
  }
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Report record was not created.');

  const reportId = String(data.id);
  const { data: inserted, error: insertedError } = await admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', reportId)
    .single();
  if (insertedError || !inserted) {
    throw new Error(insertedError?.message || 'Report record could not be reloaded.');
  }
  await ensureWorkingRevision(admin, inserted as any, input.createdBy);
  return { id: reportId, created: true };
}
