'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@/lib/icons';
import { SegmentPanel } from '@/components/school-reports/SegmentPanel';
import type { DeliveryCheckpoint, DeliveryDeclaration, DeliveryTopicOption } from '@/lib/school-reports/delivery-declaration';
import { buildWeekSpanTimeline, buildDeliveryDeclaration, buildTopicsCoveredFromDeclaration, nigeriaTechPhaseLabel } from '@/lib/school-reports/delivery-declaration';
import { buildTopicsCoveredPresentation, type TopicsCoveredPresentation } from '@/lib/school-reports/topics-covered-presentation';

type CatalogResponse = {
  catalog: DeliveryTopicOption[];
  reportingWeeks: number;
  rangeStartWeek: number;
  range?: { startWeek: number };
  academicTermNumber: number;
  existingDeclaration: DeliveryDeclaration | null;
  resolvedCourses: Array<{ id: string; title: string; programme: string }>;
  missingCurriculumCourses: Array<{ id: string; title: string; programme: string }>;
  previousCheckpoint: {
    checkpoint: DeliveryCheckpoint;
    fromTermLabel: string;
    fromAcademicYear: string;
  } | null;
};

type Props = {
  reportId: string;
  lockVersion: number;
  disabled?: boolean;
  schoolName?: string;
  termLabel?: string;
  onApplied: (topicsCovered: string) => void;
  onLivePreviewChange?: (presentation: TopicsCoveredPresentation | null) => void;
  onLockVersionChange?: (next: number) => void;
};

const topicCheckboxClass =
  'mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30';
const tapRowClass =
  'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg px-1 py-2 text-[11px] leading-snug active:bg-muted/40';

export function DeliveryTopicsPicker({ reportId, lockVersion, disabled, schoolName, termLabel, onApplied, onLivePreviewChange, onLockVersionChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<DeliveryTopicOption[]>([]);
  const [reportingWeeks, setReportingWeeks] = useState(1);
  const [rangeStartWeek, setRangeStartWeek] = useState(1);
  const [resolvedCourses, setResolvedCourses] = useState<CatalogResponse['resolvedCourses']>([]);
  const [academicTermNumber, setAcademicTermNumber] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [missingCurriculumCourses, setMissingCurriculumCourses] = useState<CatalogResponse['missingCurriculumCourses']>([]);
  const [previousCheckpoint, setPreviousCheckpoint] = useState<CatalogResponse['previousCheckpoint']>(null);
  const [spannedPreview, setSpannedPreview] = useState<DeliveryDeclaration['spannedWeeks']>([]);
  const [generatingCurriculum, setGeneratingCurriculum] = useState(false);
  /** Outcome of the last generation — staff must know if they got placeholders. */
  const [genNotice, setGenNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const hasCatalogRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  const loadCatalog = useCallback(async () => {
    setError('');
    // Soft refresh: don't tear down topic list if we already have a catalog.
    if (!hasCatalogRef.current) setLoading(true);
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45000);
    try {
      const response = await fetch(
        `/api/school-performance-reports/delivery-topics?reportId=${encodeURIComponent(reportId)}`,
        { signal: controller.signal },
      );
      const json = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to load topics (HTTP ${response.status}). Check your connection and try again.`);
      const data = json as CatalogResponse;
      const nextReportingWeeks = data.reportingWeeks ?? 1;
      const nextRangeStartWeek = data.rangeStartWeek ?? data.range?.startWeek ?? 1;
      const keys = data.existingDeclaration?.selectedTopicKeys || [];
      setCatalog(data.catalog || []);
      hasCatalogRef.current = (data.catalog || []).length > 0;
      setReportingWeeks(nextReportingWeeks);
      setRangeStartWeek(nextRangeStartWeek);
      setResolvedCourses(data.resolvedCourses || []);
      setMissingCurriculumCourses(data.missingCurriculumCourses || []);
      setPreviousCheckpoint(data.previousCheckpoint || null);
      setSelected(new Set(keys));
      setAcademicTermNumber(data.academicTermNumber || 1);
      if (data.catalog?.length && keys.length) {
        const savedTopics = data.catalog.filter((topic) => keys.includes(topic.key));
        setSpannedPreview(buildWeekSpanTimeline(savedTopics, nextReportingWeeks, nextRangeStartWeek));
      } else {
        setSpannedPreview(data.existingDeclaration?.spannedWeeks || []);
      }
    } catch (loadError) {
      if (controller.signal.aborted) {
        // A newer request or unmount may cancel this one. Only the active
        // request is allowed to show a genuine timeout to the user.
        if (timedOut && loadAbortRef.current === controller) {
          setError('Topic load timed out. Tap reload or try again.');
        }
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load topics.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [reportId]);

  useEffect(() => {
    void loadCatalog();
    return () => {
      loadAbortRef.current?.abort();
    };
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

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCourse(topics: DeliveryTopicOption[]) {
    const keys = topics.map((t) => t.key);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function toggleProgramme(topics: DeliveryTopicOption[]) {
    const keys = topics.map((topic) => topic.key);
    const allSelected = keys.every((key) => selected.has(key));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  async function applyDeclaration() {
    setApplying(true);
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDeclaration: {
            selectedTopicKeys: [...selected],
            reportingWeeks,
          },
          expectedRevision: lockVersion,
        }),
      });
      const json = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to save delivery (HTTP ${response.status}).`);
      if (json.lockVersion) onLockVersionChange?.(Number(json.lockVersion));
      const selectedTopics = catalog.filter((topic) => selected.has(topic.key));
      const declaration = buildDeliveryDeclaration({
        catalog,
        selectedTopicKeys: [...selected],
        reportingWeeks,
        rangeStartWeek,
      });
      setSpannedPreview(buildWeekSpanTimeline(selectedTopics, reportingWeeks, rangeStartWeek));
      const topicsCovered = buildTopicsCoveredFromDeclaration(declaration, {
        schoolName: schoolName || 'School',
        termLabel: termLabel || 'this term',
        academicTermNumber,
      });
      await loadCatalog();
      onApplied(topicsCovered);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to save delivery.');
    } finally {
      setApplying(false);
    }
  }

  async function generateCurriculumOnSpot() {
    setGeneratingCurriculum(true);
    setError('');
    setGenNotice(null);
    try {
      const res = await fetch('/api/school-performance-reports/generate-curriculum-on-spot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((json.error as string | undefined) || `Failed to generate curriculum on the spot (HTTP ${res.status}).`);
      await loadCatalog();

      const written = Number(json.createdCount ?? 0) + Number(json.updatedCount ?? 0);
      const ai = Number(json.aiCourseCount ?? 0);
      const unresolved = Array.isArray(json.unresolvedCourses) ? json.unresolvedCourses.length : 0;
      if (written === 0 && unresolved === 0) {
        setGenNotice({
          tone: 'ok',
          text: 'Every course already has real weekly topics for this window. Tick what was taught — they appear in the week span below.',
        });
      } else if (unresolved > 0) {
        setGenNotice({
          tone: 'warn',
          text: `${ai} course${ai === 1 ? '' : 's'} now have tickable topics; ${unresolved} could not be expanded. No placeholder topics were added.`,
        });
      } else {
        setGenNotice({
          tone: 'ok',
          text: `Weekly topics are ready for ${ai} course${ai === 1 ? '' : 's'}. Tick what was taught — they appear in this draft’s week span and What we taught preview.`,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating curriculum.');
    } finally {
      setGeneratingCurriculum(false);
    }
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const topic of visibleTopics) next.add(topic.key);
      return next;
    });
  }

  function clearAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const topic of visibleTopics) next.delete(topic.key);
      return next;
    });
  }

  const phase = nigeriaTechPhaseLabel(academicTermNumber);
  const selectedCount = selected.size;

  // Search across topic, course and programme so a long checklist can be
  // narrowed instead of scrolled. Filtering only affects what is SHOWN — ticks
  // made earlier stay selected even when hidden by the current search.
  const [selectedProgrammeFilter, setSelectedProgrammeFilter] = useState<string>('all');

  const programmeList = useMemo(() => {
    return Array.from(new Set(catalog.map((t) => t.programme).filter(Boolean)));
  }, [catalog]);

  const normalisedQuery = query.trim().toLowerCase();
  const matchesQuery = useCallback(
    (topic: DeliveryTopicOption) => {
      const matchesSearch =
        !normalisedQuery ||
        `${topic.topic} ${topic.course} ${topic.programme} w${topic.weekNumber}`
          .toLowerCase()
          .includes(normalisedQuery);
      const matchesProg =
        selectedProgrammeFilter === 'all' || topic.programme === selectedProgrammeFilter;
      return matchesSearch && matchesProg;
    },
    [normalisedQuery, selectedProgrammeFilter],
  );

  const visibleTopics = useMemo(() => catalog.filter(matchesQuery), [catalog, matchesQuery]);
  const visibleGrouped = useMemo(
    () =>
      grouped
        .map((group) => ({
          ...group,
          courses: group.courses
            .map((course) => ({ ...course, topics: course.topics.filter(matchesQuery) }))
            .filter((course) => course.topics.length > 0),
        }))
        .filter((group) => group.courses.length > 0),
    [grouped, matchesQuery],
  );
  const visibleSelectedCount = visibleTopics.filter((topic) => selected.has(topic.key)).length;
  const selectedTopics = useMemo(
    () => catalog.filter((topic) => selected.has(topic.key)),
    [catalog, selected],
  );
  const liveSpanPreview = useMemo(
    () => buildWeekSpanTimeline(selectedTopics, reportingWeeks, rangeStartWeek),
    [selectedTopics, reportingWeeks, rangeStartWeek],
  );
  const activeSpanPreview =
    spannedPreview.length >= reportingWeeks
      ? spannedPreview
      : liveSpanPreview.length
        ? liveSpanPreview
        : spannedPreview;
  const filledWeekCount = activeSpanPreview.filter((row) => row.topics.length > 0).length;

  useEffect(() => {
    if (!onLivePreviewChange) return;
    if (!selected.size || !catalog.length) {
      onLivePreviewChange(null);
      return;
    }
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys: [...selected],
      reportingWeeks,
      rangeStartWeek,
    });
    onLivePreviewChange(
      buildTopicsCoveredPresentation(declaration, {
        schoolName: schoolName || 'School',
        termLabel: termLabel || 'this term',
        academicTermNumber,
      }),
    );
  }, [
    academicTermNumber,
    catalog,
    onLivePreviewChange,
    rangeStartWeek,
    reportingWeeks,
    schoolName,
    selected,
    termLabel,
  ]);

  if (loading && catalog.length === 0) {
    return (
      <SegmentPanel title="Manual delivery — tick topics handled" step={1}>
        <div className="flex items-center gap-2.5 py-4 text-xs font-semibold text-primary">
          <ArrowPathIcon className="h-4 w-4 animate-spin text-primary" />
          Loading syllabus topics for this report window…
        </div>
      </SegmentPanel>
    );
  }

  return (
    <SegmentPanel title="Manual delivery — tick topics handled" step={1}>
      {loading ? (
        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-primary">
          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
          Refreshing topics…
        </p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Review every programme and course, then tick only the topics learners actually covered. Your confirmed selection is organised
        across the <span className="font-black text-foreground">{reportingWeeks}-week</span> report window (
        <span className="font-semibold text-primary">{phase}</span> phase). Unselected syllabus items stay in the bank for future terms — your ticked topics define this report&apos;s delivery story.
      </p>

      {previousCheckpoint ? (
        <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100 shadow-sm">
          <span className="font-black">Continue from last term</span> ({previousCheckpoint.fromTermLabel}{' '}
          {previousCheckpoint.fromAcademicYear}):{' '}
          <span className="font-bold text-amber-700 dark:text-amber-300">
            {previousCheckpoint.checkpoint.programme} · {previousCheckpoint.checkpoint.course}
          </span>
          {' '}— &quot;{previousCheckpoint.checkpoint.topic}&quot; (Week {previousCheckpoint.checkpoint.weekNumber}).
        </div>
      ) : null}

      {missingCurriculumCourses.length ? (
        <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-950 dark:text-amber-100 shadow-sm">
          <p className="font-black">Curriculum syllabus needed for active courses:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missingCurriculumCourses.map((course) => (
              <span
                key={`${course.programme}-${course.title}`}
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-100 border border-amber-500/30"
              >
                <span className="opacity-75">{course.programme}:</span> {course.title}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] opacity-90">
            Tap &quot;Generate Programme Syllabus Topics&quot; below to generate structured weekly lesson plans tailored to these courses.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-[11px] font-semibold text-destructive">{error}</p> : null}

      {genNotice ? (
        <div
          className={`mt-2.5 rounded-xl border px-3 py-2 text-[11px] shadow-sm transition-all ${
            genNotice.tone === 'warn'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 font-medium'
          }`}
        >
          {genNotice.text}
        </div>
      ) : null}

      {catalog.length ? (
        <div className="mt-3.5 space-y-2.5">
          {programmeList.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => setSelectedProgrammeFilter('all')}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${
                  selectedProgrammeFilter === 'all'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                All Programmes ({catalog.length})
              </button>
              {programmeList.map((prog) => {
                const count = catalog.filter((t) => t.programme === prog).length;
                const isSelected = selectedProgrammeFilter === prog;
                return (
                  <button
                    key={prog}
                    type="button"
                    onClick={() => setSelectedProgrammeFilter(prog)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${
                      isSelected
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {prog} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search topic, course or week…"
              className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:flex-1 transition-all"
            />
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={disabled || applying || !visibleTopics.length}
                onClick={selectAllVisible}
                className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
              >
                Tick all{normalisedQuery || selectedProgrammeFilter !== 'all' ? ' shown' : ''}
              </button>
              <button
                type="button"
                disabled={disabled || applying || !visibleSelectedCount}
                onClick={clearAllVisible}
                className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
              >
                Clear{normalisedQuery || selectedProgrammeFilter !== 'all' ? ' shown' : ''}
              </button>
              <button
                type="button"
                disabled={disabled || generatingCurriculum}
                onClick={() => void generateCurriculumOnSpot()}
                className="min-h-10 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-3 text-xs font-bold text-white hover:from-blue-700 hover:to-purple-700 shadow-sm transition-all disabled:opacity-50"
              >
                {generatingCurriculum ? (
                  <span className="flex items-center gap-1.5">
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </span>
                ) : (
                  'Generate Topics'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!catalog.length ? (
        <div className="mt-3.5 rounded-2xl border border-primary/30 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/50 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-purple-950/20 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-sm font-bold">
              📚
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Syllabus Topics Setup
              </h4>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                No syllabus topics are loaded for this report window yet.
                {resolvedCourses.length ? (
                  <>
                    {' '}Detected active courses for this school:
                  </>
                ) : null}
              </p>
              {resolvedCourses.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resolvedCourses.map((row) => (
                    <span
                      key={`${row.programme}-${row.title}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-background/80 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-2xs"
                    >
                      <span className="text-primary font-black uppercase text-[10px]">
                        {row.programme}
                      </span>
                      <span>·</span>
                      <span>{row.title}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click below to generate structured weekly lesson plans with learning objectives and review checkpoints.
              </p>
              <button
                type="button"
                disabled={disabled || generatingCurriculum}
                onClick={() => void generateCurriculumOnSpot()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2.5 text-xs font-black text-white hover:from-blue-700 hover:to-purple-700 shadow-md transition-all disabled:opacity-50"
              >
                {generatingCurriculum ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    Generating Programme Topics…
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Generate Programme Syllabus Topics</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 max-h-[min(55dvh,24rem)] space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-background/50 p-3 touch-pan-y sm:max-h-80 sm:p-4 shadow-inner">
          {visibleGrouped.map((group) => (
            <div
              key={group.programme}
              className="overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-2xs"
            >
              {(() => {
                const programmeTopics = group.courses.flatMap((item) => item.topics);
                const selectedInProgramme = programmeTopics.filter((topic) => selected.has(topic.key)).length;
                const allSelected = programmeTopics.length > 0 && selectedInProgramme === programmeTopics.length;
                return (
                  <button
                    type="button"
                    disabled={disabled || applying}
                    onClick={() => toggleProgramme(programmeTopics)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-foreground hover:from-primary/15 transition-all disabled:opacity-50 border-b border-border/40"
                  >
                    <span className="flex items-center gap-2 min-w-0 break-words">
                      <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${allSelected ? 'bg-primary text-white' : 'border border-border bg-background text-transparent'}`}>
                        ✓
                      </span>
                      <span>{group.programme}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-background/90 px-2.5 py-0.5 text-[10px] font-black normal-case text-primary border border-primary/20 shadow-2xs">
                      {selectedInProgramme}/{programmeTopics.length} topics
                    </span>
                  </button>
                );
              })()}
              <div className="p-2 space-y-3">
                {group.courses.map(({ course, topics }) => {
                  const courseKeys = topics.map((t) => t.key);
                  const courseAll = courseKeys.every((k) => selected.has(k));
                  const selectedInCourse = topics.filter((t) => selected.has(t.key)).length;
                  return (
                    <div
                      key={`${group.programme}::${course}`}
                      className="rounded-lg border border-border/50 bg-background/80 p-2.5 shadow-2xs"
                    >
                      <button
                        type="button"
                        disabled={disabled || applying}
                        onClick={() => toggleCourse(topics)}
                        className="mb-2 flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs font-bold text-foreground hover:bg-muted/40 transition-all disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2 break-words">
                          <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[9px] font-bold ${courseAll ? 'bg-primary text-white' : 'border border-border bg-card text-transparent'}`}>
                            ✓
                          </span>
                          <span className="text-primary font-black text-[10px] uppercase tracking-wide">
                            {group.programme}
                          </span>
                          <span>·</span>
                          <span className="font-black text-foreground">{course}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          {selectedInCourse}/{topics.length}
                        </span>
                      </button>
                      <ul className="space-y-1 pl-1">
                        {topics.map((topic) => {
                          const isSelected = selected.has(topic.key);
                          const isAssessment = /assessment|check|exam|capstone|showcase|review/i.test(topic.topic);
                          return (
                            <li key={topic.key}>
                              <label
                                className={`flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                                  isSelected
                                    ? 'bg-primary/10 text-foreground font-semibold border border-primary/20'
                                    : 'text-muted-foreground hover:bg-muted/40 border border-transparent'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className={topicCheckboxClass}
                                  checked={isSelected}
                                  disabled={disabled || applying}
                                  onChange={() => toggle(topic.key)}
                                />
                                <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  W{topic.weekNumber}
                                </span>
                                {isAssessment ? (
                                  <span className="inline-flex shrink-0 items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                    Review
                                  </span>
                                ) : null}
                                <span className="min-w-0 break-words leading-tight">
                                  {topic.topic}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3.5 flex flex-col gap-3 border-t border-border/80 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{selectedCount}</span> topic{selectedCount === 1 ? '' : 's'} selected
          {filledWeekCount ? (
            <span className="ml-1 text-primary font-semibold">
              · Paced across {filledWeekCount} of {reportingWeeks} week slots
            </span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={disabled || applying || !selectedCount}
          onClick={() => void applyDeclaration()}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-xs font-black text-white hover:from-blue-700 hover:to-purple-700 shadow-md transition-all disabled:opacity-50 sm:w-auto"
        >
          {applying ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-4 w-4" />
          )}
          Apply & span across {reportingWeeks} weeks
        </button>
      </div>

      {selectedCount > 0 ? (
        <details className="mt-3 text-xs text-muted-foreground rounded-xl border border-border/60 bg-muted/20 p-3 transition-all" open={!spannedPreview.length}>
          <summary className="cursor-pointer font-bold text-foreground hover:text-primary transition-colors">
            {spannedPreview.length ? 'Week span preview (saved on report)' : 'Live week span preview'}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pl-2">
            {activeSpanPreview.map((row) => (
              <li key={row.week} className={`flex items-start gap-2 text-[11px] leading-snug ${row.topics.length ? 'text-foreground font-medium' : 'text-muted-foreground/60'}`}>
                <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] font-bold border border-border/60">
                  {row.label}
                </span>
                <span className="min-w-0 break-words">
                  {row.topics.length ? (
                    <>
                      {row.programme ? (
                        <span className="text-primary font-bold">{row.programme} · {row.course} — </span>
                      ) : null}
                      {row.topics.join('; ')}
                    </>
                  ) : (
                    <span className="italic">No topics scheduled</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SegmentPanel>
  );
}
