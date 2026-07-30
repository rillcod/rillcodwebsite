'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@/lib/icons';
import { WhatWeTaughtPreview } from '@/components/school-reports/WhatWeTaughtPreview';
import {
  buildDeliveryDeclaration,
  buildWeekSpanTimeline,
  nigeriaTechPhaseLabel,
  type DeliveryTopicOption,
} from '@/lib/school-reports/delivery-declaration';
import { buildTopicsCoveredPresentation } from '@/lib/school-reports/topics-covered-presentation';
import type { ReportSetupForm } from '@/lib/school-reports/ui/types';

type CatalogResponse = {
  catalog: DeliveryTopicOption[];
  reportingWeeks: number;
  rangeStartWeek: number;
  academicTermNumber: number;
  schoolProgrammes: Array<{ programme: string; course: string; enrolledStudents: number }>;
  resolvedCourses: Array<{ id: string; title: string; programme: string }>;
  suggestedTopicKeys: string[];
  missingCurriculumCourses: Array<{ id: string; title: string; programme: string }>;
  termLabel?: string;
  previousCheckpoint?: {
    checkpoint: { programme: string; course: string; topic: string; weekNumber: number };
    fromTermLabel: string;
    fromAcademicYear: string;
  } | null;
};

type Props = {
  form: ReportSetupForm;
  schoolName: string;
  termLabel: string;
  selectedTopicKeys: string[];
  onSelectedTopicKeysChange: (keys: string[]) => void;
  disabled?: boolean;
};

const topicCheckboxClass =
  'mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30';
const tapRowClass =
  'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg px-1 py-2 text-[11px] leading-snug active:bg-muted/40';

export function SetupDeliveryTopicsPanel({
  form,
  schoolName,
  termLabel,
  selectedTopicKeys,
  onSelectedTopicKeysChange,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<DeliveryTopicOption[]>([]);
  const [reportingWeeks, setReportingWeeks] = useState(8);
  const [rangeStartWeek, setRangeStartWeek] = useState(1);
  const [academicTermNumber, setAcademicTermNumber] = useState(1);
  const [schoolProgrammes, setSchoolProgrammes] = useState<CatalogResponse['schoolProgrammes']>([]);
  const [resolvedCourses, setResolvedCourses] = useState<CatalogResponse['resolvedCourses']>([]);
  const [missingCurriculumCourses, setMissingCurriculumCourses] = useState<CatalogResponse['missingCurriculumCourses']>([]);
  const [previousCheckpoint, setPreviousCheckpoint] = useState<CatalogResponse['previousCheckpoint']>(null);
  const autoSuggestedRef = useRef(false);
  const selectedTopicKeysRef = useRef(selectedTopicKeys);
  selectedTopicKeysRef.current = selectedTopicKeys;
  const onSelectedTopicKeysChangeRef = useRef(onSelectedTopicKeysChange);
  onSelectedTopicKeysChangeRef.current = onSelectedTopicKeysChange;
  const loadAbortRef = useRef<AbortController | null>(null);
  const selected = useMemo(() => new Set(selectedTopicKeys), [selectedTopicKeys]);

  const loadCatalog = useCallback(async () => {
    if (!form.schoolId || !form.academicTermId) return;
    setLoading(true);
    setError('');
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45000);
    try {
      const params = new URLSearchParams({
        schoolId: form.schoolId,
        academicTermId: form.academicTermId,
        curriculumStartTerm: String(form.curriculumStartTerm),
        curriculumStartWeek: String(form.curriculumStartWeek),
        curriculumEndTerm: String(form.curriculumEndTerm),
        curriculumEndWeek: String(form.curriculumEndWeek),
      });
      const response = await fetch(`/api/school-performance-reports/delivery-topics?${params.toString()}`, {
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load delivery topics.');
      const data = json as CatalogResponse;
      setMissingCurriculumCourses(data.missingCurriculumCourses || []);
      setCatalog(data.catalog || []);
      setReportingWeeks(data.reportingWeeks ?? 8);
      setRangeStartWeek(data.rangeStartWeek ?? form.curriculumStartWeek);
      setAcademicTermNumber(data.academicTermNumber || 1);
      setSchoolProgrammes(data.schoolProgrammes || []);
      setResolvedCourses(data.resolvedCourses || []);
      setPreviousCheckpoint(data.previousCheckpoint || null);

      if (
        !autoSuggestedRef.current &&
        selectedTopicKeysRef.current.length === 0 &&
        data.suggestedTopicKeys?.length
      ) {
        autoSuggestedRef.current = true;
        onSelectedTopicKeysChangeRef.current(data.suggestedTopicKeys);
      }
    } catch (loadError) {
      if (controller.signal.aborted) {
        if (timedOut && loadAbortRef.current === controller) {
          setError('Topic load timed out. Tap Reload topics to try again.');
        }
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load delivery topics.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [
    form.academicTermId,
    form.curriculumEndTerm,
    form.curriculumEndWeek,
    form.curriculumStartTerm,
    form.curriculumStartWeek,
    form.schoolId,
  ]);

  useEffect(() => {
    autoSuggestedRef.current = false;
    onSelectedTopicKeysChangeRef.current([]);
  }, [
    form.schoolId,
    form.academicTermId,
    form.curriculumStartTerm,
    form.curriculumStartWeek,
    form.curriculumEndTerm,
    form.curriculumEndWeek,
  ]);

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, DeliveryTopicOption[]>>();
    for (const row of catalog) {
      const programmes = map.get(row.programme) || new Map<string, DeliveryTopicOption[]>();
      const courses = programmes.get(row.course) || [];
      courses.push(row);
      programmes.set(row.course, courses);
      map.set(row.programme, programmes);
    }
    return [...map.entries()].map(([programme, courses]) => ({
      programme,
      courses: [...courses.entries()].map(([course, topics]) => ({ course, topics })),
    }));
  }, [catalog]);

  function setSelected(next: Set<string>) {
    onSelectedTopicKeysChange([...next]);
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  function toggleCourse(topics: DeliveryTopicOption[]) {
    const keys = topics.map((t) => t.key);
    const allSelected = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    for (const key of keys) {
      if (allSelected) next.delete(key);
      else next.add(key);
    }
    setSelected(next);
  }

  function toggleProgramme(topics: DeliveryTopicOption[]) {
    const keys = topics.map((topic) => topic.key);
    const allSelected = keys.every((key) => selected.has(key));
    const next = new Set(selected);
    for (const key of keys) {
      if (allSelected) next.delete(key);
      else next.add(key);
    }
    setSelected(next);
  }

  const presentation = useMemo(() => {
    if (!selectedTopicKeys.length || !catalog.length) return null;
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys,
      reportingWeeks,
      rangeStartWeek,
      termLabel,
    });
    return buildTopicsCoveredPresentation(declaration, {
      schoolName: schoolName || 'School',
      termLabel: termLabel || 'this term',
      academicTermNumber,
    });
  }, [academicTermNumber, catalog, rangeStartWeek, reportingWeeks, schoolName, selectedTopicKeys, termLabel]);

  const selectedTopics = useMemo(
    () => catalog.filter((topic) => selected.has(topic.key)),
    [catalog, selected],
  );
  const liveSpanPreview = useMemo(
    () => buildWeekSpanTimeline(selectedTopics, reportingWeeks, rangeStartWeek),
    [selectedTopics, reportingWeeks, rangeStartWeek],
  );
  const phase = nigeriaTechPhaseLabel(academicTermNumber);
  const selectedCount = selectedTopicKeys.length;
  const filledWeekCount = liveSpanPreview.filter((row) => row.topics.length > 0).length;

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-3 sm:mt-6 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-black">What we taught — confirm before draft</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Tick the module topics learners actually covered. This is saved into the draft when you generate — the editor
            picker is only for later edits.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || loading || !form.schoolId}
          onClick={() => void loadCatalog()}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-black disabled:opacity-50 sm:w-auto"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Reload topics
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          Loading syllabus topics for every enrolled course…
        </p>
      ) : null}

      {error ? <p className="text-[11px] font-semibold text-destructive break-words">{error}</p> : null}

      {presentation ? (
        <WhatWeTaughtPreview presentation={presentation} enrolledCourses={schoolProgrammes} />
      ) : schoolProgrammes.length ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-background/80 px-3 py-5 text-center sm:px-4">
          <p className="text-sm font-black text-foreground">What we taught preview</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {schoolProgrammes.length} course{schoolProgrammes.length === 1 ? '' : 's'} enrolled — tick topics below to
            fill this section before generating the draft.
          </p>
        </div>
      ) : null}

      {previousCheckpoint ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-950 break-words dark:text-amber-100">
          <span className="font-black">Continue from last term</span> ({previousCheckpoint.fromTermLabel}{' '}
          {previousCheckpoint.fromAcademicYear}): {previousCheckpoint.checkpoint.programme} ·{' '}
          {previousCheckpoint.checkpoint.course} — &quot;{previousCheckpoint.checkpoint.topic}&quot;
        </div>
      ) : null}

      {!loading && catalog.length ? (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground break-words">
            {phase} phase · {reportingWeeks}-week window · tick topics across{' '}
            {resolvedCourses.map((row) => `${row.programme} · ${row.title}`).join(' · ') || 'enrolled courses'}
          </p>
          <div className="max-h-[min(52dvh,22rem)] space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-background/80 p-2 touch-pan-y sm:max-h-72 sm:p-3">
            {grouped.map((group) => {
              const programmeTopics = group.courses.flatMap((item) => item.topics);
              const selectedInProgramme = programmeTopics.filter((topic) => selected.has(topic.key)).length;
              const allSelected = programmeTopics.length > 0 && selectedInProgramme === programmeTopics.length;
              return (
                <div key={group.programme}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleProgramme(programmeTopics)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-primary/5 px-2 py-2 text-left text-[10px] font-black uppercase tracking-wide text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    <span className="min-w-0 break-words text-left">
                      {allSelected ? '☑' : '☐'} {group.programme}
                    </span>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-black normal-case text-muted-foreground">
                      {selectedInProgramme}/{programmeTopics.length}
                    </span>
                  </button>
                  {group.courses.map(({ course, topics }) => {
                    const courseAll = topics.every((t) => selected.has(t.key));
                    return (
                      <div key={`${group.programme}::${course}`} className="mt-2 pl-1">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleCourse(topics)}
                          className="mb-1 min-h-10 w-full rounded-lg px-1 py-1.5 text-left text-[11px] font-black text-foreground hover:bg-muted/30 disabled:opacity-50"
                        >
                          <span className="break-words">{courseAll ? '☑' : '☐'} {course}</span>
                        </button>
                        <ul className="space-y-0.5 pl-1">
                          {topics.map((topic) => (
                            <li key={topic.key}>
                              <label className={tapRowClass}>
                                <input
                                  type="checkbox"
                                  className={topicCheckboxClass}
                                  checked={selected.has(topic.key)}
                                  disabled={disabled}
                                  onChange={() => toggle(topic.key)}
                                />
                                <span className="min-w-0 break-words">
                                  <span className="font-semibold text-muted-foreground">W{topic.weekNumber}</span> —{' '}
                                  {topic.topic}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {!loading && !catalog.length && form.schoolId ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-950 break-words dark:text-amber-100">
          No real curriculum topics were found for this window. Adjust the range or complete the curriculum in Academic
          Office; the report will not invent coverage.
        </p>
      ) : null}

      {missingCurriculumCourses.length ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-950 break-words dark:text-amber-100">
          <span className="font-black">Curriculum needed:</span>{' '}
          {missingCurriculumCourses.map((course) => `${course.programme} · ${course.title}`).join(', ')}.
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-3 border-t border-border/60 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-muted-foreground break-words">
            {selectedCount} topic{selectedCount === 1 ? '' : 's'} selected for the draft
            {filledWeekCount ? ` · paced across ${filledWeekCount} of ${reportingWeeks} weeks` : ''}
          </p>
          {selectedCount > 0 ? (
            <span className="inline-flex min-h-10 items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              Ready to bake into draft
            </span>
          ) : (
            <span className="inline-flex min-h-10 items-center text-[11px] font-black text-amber-700 dark:text-amber-300">
              Optional now — confirm topics in the draft editor if you skip here
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
