"use client";

/**
 * The academic calendar, read from the one table that owns it.
 *
 * `academic_terms` is the single source of truth for sessions and terms across
 * the platform, so a partnership document dates itself from the same record the
 * timetable, the reports and the invoices do. Typing "next term" by hand is how
 * an MoU ends up commencing in a session the school does not run.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AcademicTermRow = {
  id: string;
  academic_year: string;
  term_label: string;
  term_number: number;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
};

/** "1st Term, 2025/2026" — the two columns that name a term, in reading order. */
export function termDisplay(term: AcademicTermRow): string {
  return `${term.term_label}, ${term.academic_year}`;
}

export function useAcademicTerms(): {
  terms: AcademicTermRow[];
  current: AcademicTermRow | null;
  loading: boolean;
} {
  const [terms, setTerms] = useState<AcademicTermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await createClient()
        .from("academic_terms")
        .select("id, academic_year, term_label, term_number, is_current, start_date, end_date")
        .order("academic_year", { ascending: false })
        .order("term_number", { ascending: true });
      if (!live) return;
      setTerms((data ?? []) as AcademicTermRow[]);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  return { terms, current: terms.find((t) => t.is_current) ?? null, loading };
}
