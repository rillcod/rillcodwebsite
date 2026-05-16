'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-context';

/** term_calendar shape: { "1": { start: "2025-09-01", end: "2025-12-15" }, "2": {...}, "3": {...} } */
export type TermCalendar = Record<string, { start?: string; end?: string }>;

interface AcademicYearContextValue {
  academicYear: string;           // the effective year (school override or platform default)
  platformYear: string;           // platform default
  schoolYear: string | null;      // school-specific override (null = using platform)
  termCalendar: TermCalendar | null; // configured term dates (school override or platform)
  loading: boolean;
  setAcademicYear: (year: string, schoolId?: string | null) => Promise<void>;
  yearOptions: string[];
}

function defaultYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function buildYearOptions(): string[] {
  const base = new Date().getFullYear();
  const years: string[] = [];
  for (let i = -1; i <= 2; i++) {
    years.push(`${base + i}/${base + i + 1}`);
  }
  return years;
}

const AcademicYearContext = createContext<AcademicYearContextValue>({
  academicYear: defaultYear(),
  platformYear: defaultYear(),
  schoolYear: null,
  termCalendar: null,
  loading: false,
  setAcademicYear: async () => {},
  yearOptions: buildYearOptions(),
});

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [platformYear, setPlatformYear] = useState(defaultYear());
  const [schoolYear, setSchoolYear] = useState<string | null>(null);
  const [termCalendar, setTermCalendar] = useState<TermCalendar | null>(null);
  const [loading, setLoading] = useState(true);

  const schoolId = profile?.school_id ?? null;

  const fetchYear = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const qs = schoolId ? `?school_id=${schoolId}` : '';
      const res = await fetch(`/api/settings/academic-year${qs}`, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        setPlatformYear(j.platform ?? defaultYear());
        setSchoolYear(j.school ?? null);
        if (j.term_calendar && typeof j.term_calendar === 'object') {
          setTermCalendar(j.term_calendar as TermCalendar);
        }
      }
    } catch {
      // fallback to auto-detect
    } finally {
      setLoading(false);
    }
  }, [schoolId, authLoading]);

  useEffect(() => { fetchYear(); }, [fetchYear]);

  const setAcademicYear = useCallback(async (year: string, targetSchoolId?: string | null) => {
    const body: any = { year };
    if (targetSchoolId) body.school_id = targetSchoolId;

    const res = await fetch('/api/settings/academic-year', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to save academic year');
    }

    if (targetSchoolId) {
      setSchoolYear(year);
    } else {
      setPlatformYear(year);
      if (!schoolYear) {} // effective updates automatically via memo
    }
  }, [schoolYear]);

  const academicYear = schoolYear ?? platformYear;

  return (
    <AcademicYearContext.Provider value={{
      academicYear,
      platformYear,
      schoolYear,
      termCalendar,
      loading,
      setAcademicYear,
      yearOptions: buildYearOptions(),
    }}>
      {children}
    </AcademicYearContext.Provider>
  );
}

export function useAcademicYear() {
  return useContext(AcademicYearContext);
}
