'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SuggestedCurriculumRange } from '@/lib/school-reports/curriculum-range';
import {
  endWeekForReportWindow,
  normalizeReportingWeeks,
  reportingWeekCount,
} from '@/lib/school-reports/delivery-declaration';
import { logAuditEvent } from '@/lib/observability/audit-events';
import { validateCurriculumOverrideReason } from '@/lib/school-reports/curriculum-override';
import type { ReportPreflightResult } from '@/lib/school-reports/preflight';
import { defaultSetupForm } from '@/lib/school-reports/ui/constants';
import type { SetupWorkflowStep } from '@/lib/school-reports/ui/workflow-steps';
import type { AcademicTerm, ReportSetupForm, SchoolOption } from '@/lib/school-reports/ui/types';

export function useSchoolReportSetup() {
  const router = useRouter();
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [step, setStep] = useState<SetupWorkflowStep>(1);
  const [form, setForm] = useState<ReportSetupForm>(defaultSetupForm());
  const [curriculumRangeHint, setCurriculumRangeHint] = useState<SuggestedCurriculumRange | null>(null);
  const [curriculumDetectionError, setCurriculumDetectionError] = useState<string | null>(null);
  const [detectingRange, setDetectingRange] = useState(false);
  const [preflight, setPreflight] = useState<ReportPreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [activeBooks, setActiveBooks] = useState<
    Array<{
      id: string;
      school_id: string;
      academic_term_id: string;
      status: string;
      term_label: string;
      academic_year: string;
      title?: string;
      updated_at?: string;
    }>
  >([]);

  const canManage = role === 'admin' || role === 'teacher';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/school-performance-reports', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load reports.');
      const loadedTerms: AcademicTerm[] = json.terms || [];
      const defaultTerm = loadedTerms.find((term) => term.is_current) || loadedTerms[0];
      setSchools(json.schools || []);
      setActiveBooks(json.activeBooks || []);
      setTerms(loadedTerms);
      setRole(json.role || '');
      setForm((current) => ({
        ...current,
        schoolId: current.schoolId || json.schools?.[0]?.id || '',
        academicTermId: current.academicTermId || defaultTerm?.id || '',
        curriculumStartTerm: current.academicTermId
          ? current.curriculumStartTerm
          : defaultTerm?.term_number || 1,
        curriculumEndTerm: current.academicTermId
          ? current.curriculumEndTerm
          : defaultTerm?.term_number || 1,
        startDate: current.academicTermId
          ? current.startDate
          : defaultTerm?.start_date || current.startDate,
        endDate: current.academicTermId ? current.endDate : defaultTerm?.end_date || current.endDate,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load setup data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyCurriculumRangeSuggestion(suggestion: SuggestedCurriculumRange) {
    const startWeek = Math.max(1, suggestion.curriculumStartWeek || 1);
    const rawWeeks = Math.max(1, suggestion.curriculumEndWeek - startWeek + 1);
    const windowWeeks = normalizeReportingWeeks(rawWeeks);
    setCurriculumRangeHint(suggestion);
    setForm((current) => ({
      ...current,
      curriculumStartTerm: suggestion.curriculumStartTerm,
      curriculumStartWeek: startWeek,
      curriculumEndTerm: suggestion.curriculumEndTerm,
      curriculumEndWeek: endWeekForReportWindow(startWeek, windowWeeks),
    }));
  }

  const detectCurriculumRange = useCallback(async (schoolId: string, academicTermId: string) => {
    if (!schoolId || !academicTermId) {
      setCurriculumRangeHint(null);
      setCurriculumDetectionError(null);
      return;
    }
    setDetectingRange(true);
    setCurriculumDetectionError(null);
    try {
      const response = await fetch(
        `/api/school-performance-reports/curriculum-range?schoolId=${encodeURIComponent(schoolId)}&academicTermId=${encodeURIComponent(academicTermId)}`,
        { cache: 'no-store' },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to detect delivery range.');
      const suggestion = json.data as SuggestedCurriculumRange;
      if (suggestion.status === 'query_failed' || suggestion.status === 'migration_missing') {
        setCurriculumRangeHint(suggestion);
        setCurriculumDetectionError(suggestion.correctiveAction || suggestion.hint);
        return;
      }
      applyCurriculumRangeSuggestion(suggestion);
    } catch (detectError) {
      setCurriculumRangeHint(null);
      setCurriculumDetectionError(
        detectError instanceof Error ? detectError.message : 'Network error while detecting delivery range.',
      );
    } finally {
      setDetectingRange(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage || !form.schoolId || !form.academicTermId) return;
    void detectCurriculumRange(form.schoolId, form.academicTermId);
  }, [canManage, detectCurriculumRange, form.academicTermId, form.schoolId]);

  const runPreflight = useCallback(async () => {
    if (!form.schoolId || !form.academicTermId) {
      setPreflight(null);
      return;
    }
    setPreflightLoading(true);
    try {
      const params = new URLSearchParams({
        schoolId: form.schoolId,
        academicTermId: form.academicTermId,
        startDate: form.startDate,
        endDate: form.endDate,
      });
      const response = await fetch(`/api/school-performance-reports/preflight?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Preflight failed.');
      setPreflight(json.data as ReportPreflightResult);
    } catch (preflightError) {
      setPreflight(null);
      setError(preflightError instanceof Error ? preflightError.message : 'Preflight failed.');
    } finally {
      setPreflightLoading(false);
    }
  }, [form.academicTermId, form.endDate, form.schoolId, form.startDate]);

  useEffect(() => {
    if (!canManage || !form.schoolId || !form.academicTermId) return;
    void runPreflight();
  }, [canManage, form.academicTermId, form.schoolId, runPreflight]);

  function chooseTerm(id: string) {
    const term = terms.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      academicTermId: id,
      ...(term
        ? {
            curriculumStartTerm: term.term_number,
            curriculumEndTerm: term.term_number,
            startDate: term.start_date || current.startDate,
            endDate: term.end_date || current.endDate,
          }
        : {}),
    }));
  }

  async function generate() {
    setWorking('generate');
    setError('');
    setInfo('');
    try {
      const overrideError = validateCurriculumOverrideReason(form, curriculumRangeHint);
      if (overrideError) throw new Error(overrideError);

      const response = await fetch('/api/school-performance-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          curriculumOverrideReason: form.curriculumOverrideReason.trim() || undefined,
          detectedCurriculum: curriculumRangeHint
            ? {
                curriculumStartTerm: curriculumRangeHint.curriculumStartTerm,
                curriculumStartWeek: curriculumRangeHint.curriculumStartWeek,
                curriculumEndTerm: curriculumRangeHint.curriculumEndTerm,
                curriculumEndWeek: curriculumRangeHint.curriculumEndWeek,
                status: curriculumRangeHint.status,
              }
            : undefined,
          deliveryDeclaration: {
            selectedTopicKeys: form.selectedTopicKeys,
            reportingWeeks: reportingWeekCount({
              startTerm: form.curriculumStartTerm,
              startWeek: form.curriculumStartWeek,
              endTerm: form.curriculumEndTerm,
              endWeek: form.curriculumEndWeek,
            }),
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to create report.');
      if (json.reused && json.message) setInfo(json.message);
      logAuditEvent(json.reused ? 'report.reuse' : 'report.create', { reportId: json.id, schoolId: form.schoolId });
      if (form.curriculumOverrideReason.trim()) {
        logAuditEvent('curriculum.override', {
          reportId: json.id,
          schoolId: form.schoolId,
          reason: form.curriculumOverrideReason.trim(),
        });
      }
      router.push(`/dashboard/school-reports/${json.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create report.');
    } finally {
      setWorking('');
    }
  }

  return {
    terms,
    schools,
    role,
    canManage,
    loading,
    working,
    error,
    info,
    form,
    setForm,
    curriculumRangeHint,
    curriculumDetectionError,
    detectingRange,
    preflight,
    preflightLoading,
    detectCurriculumRange,
    runPreflight,
    chooseTerm,
    generate,
    step,
    setStep,
    activeBooks,
  };
}
