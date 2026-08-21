import type { SupabaseClient } from '@supabase/supabase-js';
import { academicPeriodWeekCount, loadReportCurriculumRangeSuggestion } from './curriculum-range';
import { createSchoolReportBookDraft } from './book-service';
import { endWeekForReportWindow, normalizeReportingWeeks } from './delivery-declaration';

type AnyClient = SupabaseClient<any>;

type AcademicTerm = {
  id: string;
  academic_year: string;
  term_label: string;
  term_number: number;
  start_date: string | null;
  end_date: string | null;
};

type School = { id: string; name: string };

export type ReportBookBootstrapResult = {
  academicTermId: string;
  academicYear: string;
  termLabel: string;
  approvedSchools: number;
  alreadyOpen: number;
  created: number;
  raced: number;
  remaining: number;
  errors: string[];
};

async function readAll<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function automaticSchoolReportTitle(
  schoolName: string,
  term: Pick<AcademicTerm, 'term_label' | 'academic_year'>,
): string {
  return `${schoolName} · ${term.term_label} ${term.academic_year} Delivery Book`.slice(0, 180);
}

/**
 * Guarantee a shared draft book for every approved school in the current term.
 * Work is deliberately bounded per run; missing schools are selected before
 * slicing, so repeated scheduled runs always advance rather than rescanning the
 * same already-covered schools forever.
 */
export async function ensureCurrentTermSchoolReportBooks(
  admin: AnyClient,
  options: { limit?: number } = {},
): Promise<ReportBookBootstrapResult> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 8), 1), 25);
  const { data: terms, error: termError } = await admin
    .from('academic_terms')
    .select('id,academic_year,term_label,term_number,start_date,end_date')
    .eq('is_current', true)
    .order('start_date', { ascending: false })
    .limit(2);
  if (termError) throw new Error(`Current academic term could not be loaded: ${termError.message}`);
  if (!terms?.length) throw new Error('No current academic term is configured. Set one before report-book automation runs.');
  if (terms.length > 1) throw new Error('More than one academic term is marked current. Resolve the term settings before report-book automation runs.');

  const term = terms[0] as AcademicTerm;
  if (!term.start_date || !term.end_date || term.end_date < term.start_date) {
    throw new Error(`The current term (${term.term_label} ${term.academic_year}) needs valid start and end dates.`);
  }

  const [{ data: owner, error: ownerError }, schools, existing] = await Promise.all([
    admin
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    readAll<School>((from, to) =>
      admin
        .from('schools')
        .select('id,name')
        .eq('status', 'approved')
        .eq('is_active', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('name', { ascending: true })
        .range(from, to),
    ),
    readAll<{ school_id: string }>((from, to) =>
      admin
        .from('school_performance_reports')
        .select('school_id')
        .eq('academic_term_id', term.id)
        .in('status', ['draft', 'published'])
        .range(from, to),
    ),
  ]);

  if (ownerError) throw new Error(`Report-book owner could not be resolved: ${ownerError.message}`);
  if (!owner?.id) throw new Error('No active administrator is available to own automatically opened report books.');

  const existingSchoolIds = new Set(existing.map((row) => row.school_id));
  const missing = schools.filter((school) => !existingSchoolIds.has(school.id));
  const selected = missing.slice(0, limit);
  const errors: string[] = [];
  let created = 0;
  let raced = 0;

  for (const school of selected) {
    try {
      const suggestion = await loadReportCurriculumRangeSuggestion(admin, school.id, term.id);
      if (suggestion?.status === 'query_failed' || suggestion?.status === 'migration_missing') {
        throw new Error(suggestion.hint || 'Curriculum delivery range could not be detected.');
      }
      const fallbackWeeks = normalizeReportingWeeks(
        academicPeriodWeekCount(term.start_date, term.end_date) ?? 14,
      );
      const startTerm = suggestion?.curriculumStartTerm ?? term.term_number;
      const startWeek = suggestion?.curriculumStartWeek ?? 1;
      const endTerm = suggestion?.curriculumEndTerm ?? term.term_number;
      const endWeek = suggestion?.curriculumEndWeek ?? endWeekForReportWindow(startWeek, fallbackWeeks);

      const result = await createSchoolReportBookDraft(admin, {
        schoolId: school.id,
        title: automaticSchoolReportTitle(school.name, term),
        createdBy: String(owner.id),
        range: {
          startDate: term.start_date,
          endDate: term.end_date,
          academicTermId: term.id,
          academicYear: term.academic_year,
          termLabel: term.term_label,
          academicTermNumber: term.term_number,
          curriculumStartTerm: startTerm,
          curriculumStartWeek: startWeek,
          curriculumEndTerm: endTerm,
          curriculumEndWeek: endWeek,
        },
      });
      if (result.created) created += 1;
      else raced += 1;
    } catch (error) {
      errors.push(`${school.name}: ${error instanceof Error ? error.message : 'report book creation failed'}`);
    }
  }

  return {
    academicTermId: term.id,
    academicYear: term.academic_year,
    termLabel: term.term_label,
    approvedSchools: schools.length,
    alreadyOpen: existingSchoolIds.size,
    created,
    raced,
    remaining: Math.max(0, missing.length - created - raced),
    errors,
  };
}
