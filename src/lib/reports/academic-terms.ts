import { createClient } from '@/lib/supabase/client';

// Row from the canonical public.academic_terms table (one source of truth for
// academic year + term, referenced by reports/lesson_plans/assignments/classes/
// timetables via term_id). See migration 20260726000011/12.
export interface AcademicTerm {
  id: string;
  academic_year: string;   // "2025/2026"
  term_number: number;     // 1 | 2 | 3
  term_label: string;      // "First Term"
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}

// All terms, newest first — for selectors/filters. Ordered by year then term so the
// list reads chronologically everywhere (matches the reports switcher ordering).
export async function fetchAcademicTerms(): Promise<AcademicTerm[]> {
  const { data } = await createClient()
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .order('academic_year', { ascending: false })
    .order('term_number', { ascending: false });
  return (data ?? []) as AcademicTerm[];
}

// The term containing today (NULL only in the short between-terms gaps).
export async function fetchCurrentAcademicTerm(): Promise<AcademicTerm | null> {
  const { data } = await createClient()
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .eq('is_current', true)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AcademicTerm) ?? null;
}

// Display label, e.g. "2025/2026 · First Term".
export const academicTermLabel = (t: Pick<AcademicTerm, 'academic_year' | 'term_label'>): string =>
  `${t.academic_year} · ${t.term_label}`;
