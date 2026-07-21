'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@/lib/icons';
import { SegmentPanel } from '@/components/school-reports/SegmentPanel';
import type { DeliveryCheckpoint, DeliveryDeclaration, DeliveryTopicOption } from '@/lib/school-reports/delivery-declaration';
import { nigeriaTechPhaseLabel } from '@/lib/school-reports/delivery-declaration';

type CatalogResponse = {
  catalog: DeliveryTopicOption[];
  reportingWeeks: number;
  academicTermNumber: number;
  existingDeclaration: DeliveryDeclaration | null;
  previousCheckpoint: {
    checkpoint: DeliveryCheckpoint;
    fromTermLabel: string;
    fromAcademicYear: string;
  } | null;
};

type Props = {
  reportId: string;
  disabled?: boolean;
  onApplied: (topicsCovered: string) => void;
};

export function DeliveryTopicsPicker({ reportId, disabled, onApplied }: Props) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<DeliveryTopicOption[]>([]);
  const [reportingWeeks, setReportingWeeks] = useState(12);
  const [academicTermNumber, setAcademicTermNumber] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previousCheckpoint, setPreviousCheckpoint] = useState<CatalogResponse['previousCheckpoint']>(null);
  const [spannedPreview, setSpannedPreview] = useState<DeliveryDeclaration['spannedWeeks']>([]);
  const [generatingCurriculum, setGeneratingCurriculum] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/school-performance-reports/delivery-topics?reportId=${encodeURIComponent(reportId)}`,
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load topics.');
      const data = json as CatalogResponse;
      setCatalog(data.catalog || []);
      setReportingWeeks(data.reportingWeeks || 12);
      setAcademicTermNumber(data.academicTermNumber || 1);
      setPreviousCheckpoint(data.previousCheckpoint || null);
      const keys = data.existingDeclaration?.selectedTopicKeys || [];
      setSelected(new Set(keys));
      setSpannedPreview(data.existingDeclaration?.spannedWeeks || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load topics.');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

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
        body: JSON.stringify({ deliveryDeclaration: { selectedTopicKeys: [...selected] } }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to save delivery.');
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
    try {
      const res = await fetch('/api/school-performance-reports/generate-curriculum-on-spot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate curriculum on the spot.');
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating curriculum.');
    } finally {
      setGeneratingCurriculum(false);
    }
  }

  const phase = nigeriaTechPhaseLabel(academicTermNumber);
  const selectedCount = selected.size;

  if (loading) {
    return (
      <SegmentPanel title="Manual delivery — tick topics handled" step={1} accent="#7a0606">
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          Loading syllabus topics for this report window…
        </p>
      </SegmentPanel>
    );
  }

  return (
    <SegmentPanel title="Manual delivery — tick topics handled" step={1} accent="#7a0606">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        No week tracking needed. Tick what learners actually covered this term — we intelligently span your selection
        across the <span className="font-black text-foreground">{reportingWeeks}-week</span> report window (
        {phase} phase) for a full delivery narrative, even when real pacing was slower.
      </p>

      {previousCheckpoint ? (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100">
          <span className="font-black">Continue from last term</span> ({previousCheckpoint.fromTermLabel}{' '}
          {previousCheckpoint.fromAcademicYear}):{' '}
          {previousCheckpoint.checkpoint.programme} · {previousCheckpoint.checkpoint.course} — &quot;
          {previousCheckpoint.checkpoint.topic}&quot; (Week {previousCheckpoint.checkpoint.weekNumber}).
        </div>
      ) : null}

      {error ? <p className="mt-2 text-[11px] font-semibold text-destructive">{error}</p> : null}

      {!catalog.length ? (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No active syllabus topics detected for this school in this term window. Generate a curriculum on the spot right now:
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
                Generating curriculum on the spot…
              </>
            ) : (
              '⚡ Generate Curriculum On The Spot'
            )}
          </button>
        </div>
      ) : (
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-3">
          {grouped.map((group) => (
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
                    className="flex w-full items-center justify-between rounded-lg bg-primary/5 px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-wide text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    <span>{allSelected ? '☑' : '☐'} {group.programme}</span>
                    <span className="normal-case text-muted-foreground">{selectedInProgramme}/{programmeTopics.length} topics</span>
                  </button>
                );
              })()}
              {group.courses.map(({ course, topics }) => {
                const courseKeys = topics.map((t) => t.key);
                const courseAll = courseKeys.every((k) => selected.has(k));
                return (
                  <div key={`${group.programme}::${course}`} className="mt-2">
                    <button
                      type="button"
                      disabled={disabled || applying}
                      onClick={() => toggleCourse(topics)}
                      className="mb-1 text-[11px] font-black text-foreground hover:text-primary disabled:opacity-50"
                    >
                      {courseAll ? '☑' : '☐'} {course}
                    </button>
                    <ul className="space-y-1 pl-3">
                      {topics.map((topic) => (
                        <li key={topic.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={selected.has(topic.key)}
                              disabled={disabled || applying}
                              onChange={() => toggle(topic.key)}
                            />
                            <span>
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="text-[11px] text-muted-foreground">
          {selectedCount} topic{selectedCount === 1 ? '' : 's'} selected
          {spannedPreview.length ? ` · spanned across ${spannedPreview.length} week slots` : ''}
        </p>
        <button
          type="button"
          disabled={disabled || applying || !selectedCount}
          onClick={() => void applyDeclaration()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
        >
          {applying ? (
            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-3.5 w-3.5" />
          )}
          Apply & span across {reportingWeeks} weeks
        </button>
      </div>

      {spannedPreview.length ? (
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer font-black text-foreground">Week span preview (saved on report)</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {spannedPreview.map((row) => (
              <li key={row.week}>
                {row.label}: {row.topics.join('; ')}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SegmentPanel>
  );
}
