'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@/lib/icons';
import { SegmentPanel } from '@/components/school-reports/SegmentPanel';
import type { DeliveryCheckpoint, DeliveryDeclaration, DeliveryTopicOption } from '@/lib/school-reports/delivery-declaration';
import { buildWeekSpanTimeline, nigeriaTechPhaseLabel } from '@/lib/school-reports/delivery-declaration';

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
  onApplied: (topicsCovered: string) => void;
  onLockVersionChange?: (next: number) => void;
};

const topicCheckboxClass =
  'mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30';
const tapRowClass =
  'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg px-1 py-2 text-[11px] leading-snug active:bg-muted/40';

export function DeliveryTopicsPicker({ reportId, lockVersion, disabled, onApplied, onLockVersionChange }: Props) {
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
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load topics.');
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
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to save delivery.');
      if (json.lockVersion) onLockVersionChange?.(Number(json.lockVersion));
      await loadCatalog();
      onApplied('');
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate curriculum on the spot.');
      await loadCatalog();

      const ai = Number(json.aiCourseCount ?? 0);
      const unresolved = Array.isArray(json.unresolvedCourses) ? json.unresolvedCourses.length : 0;
      if (json.createdCount === 0) {
        setGenNotice({
          tone: unresolved ? 'warn' : 'ok',
          text: unresolved
            ? `${unresolved} course${unresolved === 1 ? '' : 's'} could not be expanded from reliable teaching evidence. No placeholder topics were added.`
            : 'Every course already has real weekly topics for this window.',
        });
      } else if (unresolved > 0) {
        setGenNotice({
          tone: 'warn',
          text: `${ai} course${ai === 1 ? '' : 's'} expanded from real context; ${unresolved} could not be verified and received no invented topics.`,
        });
      } else {
        setGenNotice({ tone: 'ok', text: `Real weekly topics expanded for ${ai} course${ai === 1 ? '' : 's'}. Review and tick only what was taught.` });
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
  const normalisedQuery = query.trim().toLowerCase();
  const matchesQuery = useCallback(
    (topic: DeliveryTopicOption) =>
      !normalisedQuery
      || `${topic.topic} ${topic.course} ${topic.programme} w${topic.weekNumber}`.toLowerCase().includes(normalisedQuery),
    [normalisedQuery],
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

  if (loading && catalog.length === 0) {
    return (
      <SegmentPanel title="Manual delivery — tick topics handled" step={1}>
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          Loading syllabus topics for this report window…
        </p>
      </SegmentPanel>
    );
  }

  return (
    <SegmentPanel title="Manual delivery — tick topics handled" step={1}>
      {loading ? (
        <p className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
          Refreshing topics…
        </p>
      ) : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Review every programme and course, then tick only the topics learners actually covered. Your confirmed selection is organised
        across the <span className="font-black text-foreground">{reportingWeeks}-week</span> report window (
        {phase} phase). Unselected syllabus items stay in the bank for future terms — your ticked topics define this report&apos;s delivery story.
      </p>

      {previousCheckpoint ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100">
          <span className="font-black">Continue from last term</span> ({previousCheckpoint.fromTermLabel}{' '}
          {previousCheckpoint.fromAcademicYear}):{' '}
          {previousCheckpoint.checkpoint.programme} · {previousCheckpoint.checkpoint.course} — &quot;
          {previousCheckpoint.checkpoint.topic}&quot; (Week {previousCheckpoint.checkpoint.weekNumber}).
        </div>
      ) : null}

      {missingCurriculumCourses.length ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100">
          <span className="font-black">Real curriculum still needed:</span>{' '}
          {missingCurriculumCourses.map((course) => `${course.programme} · ${course.title}`).join(', ')}.
          The report will not invent topics for these courses.
        </div>
      ) : null}

      {catalog.length ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Auto-delivery fills topics on refresh when week tracking exists. Tick and apply here anytime to take manual control — your picks are never overwritten.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] font-semibold text-destructive">{error}</p> : null}

      {genNotice ? (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
            genNotice.tone === 'warn'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
          }`}
        >
          {genNotice.text}
        </div>
      ) : null}

      {catalog.length ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topic, course or week…"
            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-[11px] text-foreground outline-none focus:border-primary sm:flex-1"
          />
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              disabled={disabled || applying || !visibleTopics.length}
              onClick={selectAllVisible}
              className="min-h-10 rounded-lg border border-border px-2.5 text-[11px] font-black text-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              Tick all{normalisedQuery ? ' shown' : ''}
            </button>
            <button
              type="button"
              disabled={disabled || applying || !visibleSelectedCount}
              onClick={clearAllVisible}
              className="min-h-10 rounded-lg border border-border px-2.5 text-[11px] font-black text-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              Clear{normalisedQuery ? ' shown' : ''}
            </button>
            <button
              type="button"
              disabled={disabled || generatingCurriculum}
              onClick={() => void generateCurriculumOnSpot()}
              className="min-h-10 rounded-lg border border-primary/40 px-2.5 text-[11px] font-black text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {generatingCurriculum ? 'Expanding…' : 'Expand real topics'}
            </button>
          </div>
        </div>
      ) : null}

      {!catalog.length ? (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No real curriculum topics were detected for this report window
            {resolvedCourses.length
              ? ` for ${resolvedCourses.map((row) => `${row.programme} · ${row.title}`).join(', ')}`
              : ''}
            . Expand from the course and available teaching evidence, then tick only what was actually covered. Placeholder topics are never added:
          </p>
          <button
            type="button"
            disabled={disabled || generatingCurriculum}
            onClick={() => void generateCurriculumOnSpot()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {generatingCurriculum ? (
              <>
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                Expanding real topics…
              </>
            ) : (
              'Expand real programme topics'
            )}
          </button>
        </div>
      ) : (
        <div className="mt-2 max-h-[min(52dvh,22rem)] space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/20 p-2 touch-pan-y sm:max-h-72 sm:p-3">
          {visibleGrouped.map((group) => (
            <div key={group.programme}>
              {(() => {
                const programmeTopics = group.courses.flatMap((item) => item.topics);
                const selectedInProgramme = programmeTopics.filter((topic) => selected.has(topic.key)).length;
                const allSelected = programmeTopics.length > 0 && selectedInProgramme === programmeTopics.length;
                return (
                  <button
                    type="button"
                    disabled={disabled || applying}
                    onClick={() => toggleProgramme(programmeTopics)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-primary/5 px-2 py-2 text-left text-[10px] font-black uppercase tracking-wide text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    <span className="min-w-0 break-words">{allSelected ? '☑' : '☐'} {group.programme}</span>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-black normal-case text-muted-foreground">
                      {selectedInProgramme}/{programmeTopics.length}
                    </span>
                  </button>
                );
              })()}
              {group.courses.map(({ course, topics }) => {
                const courseKeys = topics.map((t) => t.key);
                const courseAll = courseKeys.every((k) => selected.has(k));
                return (
                  <div key={`${group.programme}::${course}`} className="mt-2 pl-1">
                    <button
                      type="button"
                      disabled={disabled || applying}
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
                              disabled={disabled || applying}
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
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-muted-foreground break-words">
          {selectedCount} topic{selectedCount === 1 ? '' : 's'} selected
          {filledWeekCount
            ? ` · paced across ${filledWeekCount} of ${reportingWeeks} week slots in the ${reportingWeeks}-week window`
            : ''}
        </p>
        <button
          type="button"
          disabled={disabled || applying || !selectedCount}
          onClick={() => void applyDeclaration()}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-black text-white disabled:opacity-50 sm:w-auto"
        >
          {applying ? (
            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-3.5 w-3.5" />
          )}
          Apply & span across {reportingWeeks} weeks
        </button>
      </div>

      {selectedCount > 0 ? (
        <details className="mt-2 text-[11px] text-muted-foreground" open={!spannedPreview.length}>
          <summary className="cursor-pointer font-black text-foreground">
            {spannedPreview.length ? 'Week span preview (saved on report)' : 'Live week span preview'}
          </summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-3">
            {activeSpanPreview.map((row) => (
              <li key={row.week} className={row.topics.length ? 'text-foreground' : 'text-muted-foreground/70'}>
                {row.label}
                {row.topics.length
                  ? `: ${row.programme ? `${row.programme} · ${row.course} — ` : ''}${row.topics.join('; ')}`
                  : ': —'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SegmentPanel>
  );
}
