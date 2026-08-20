'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AcademicCapIcon, ArrowPathIcon, XMarkIcon } from '@/lib/icons';

type TrackId = 'basic5_to_6' | 'young_to_teen' | 'jss_to_ss';

type TrackDue = {
  track_id: TrackId;
  short_label: string;
  due_count: number;
  class_count: number;
};

type DueSchool = {
  school_id: string;
  school_name: string | null;
  young_to_teen_exit_grade: 'Basic 5' | 'Basic 6';
  tracks: TrackDue[];
};

type DueSnapshot = {
  show_menu: boolean;
  total_due: number;
  schools: DueSchool[];
};

type GraduationSlice = {
  class_id: string;
  class_name: string;
  due_students: number;
  plan: { promotable_count: number };
};

type GraduationPlan = {
  track_id: TrackId;
  track_label: string;
  school_id: string;
  school_name: string | null;
  slices: GraduationSlice[];
  total_promotable: number;
  total_held: number;
  blocked: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  dueSnapshot: DueSnapshot | null;
  onComplete?: () => void | Promise<void>;
};

/** Periodic session tool — only opened from More when learners are actually due. */
export function SessionPromotionModal({ open, onClose, dueSnapshot, onComplete }: Props) {
  const [schoolId, setSchoolId] = useState('');
  const [trackId, setTrackId] = useState<TrackId>('young_to_teen');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<GraduationPlan | null>(null);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyExit, setPolicyExit] = useState<'Basic 5' | 'Basic 6'>('Basic 6');

  const schools = dueSnapshot?.schools ?? [];
  const selectedSchool = useMemo(
    () => schools.find((school) => school.school_id === schoolId),
    [schools, schoolId],
  );

  const tracksForSchool = useMemo(() => {
    const row = schools.find((s) => s.school_id === schoolId);
    return row?.tracks ?? [];
  }, [schools, schoolId]);
  const trackLabel =
    tracksForSchool.find((track) => track.track_id === trackId)?.short_label
    ?? plan?.track_label
    ?? trackId;

  useEffect(() => {
    if (selectedSchool) setPolicyExit(selectedSchool.young_to_teen_exit_grade);
  }, [selectedSchool]);

  useEffect(() => {
    if (!open) {
      setPlan(null);
      setError('');
      setResultMsg('');
      setConfirmed(false);
      return;
    }
    const first = schools[0];
    if (first && !schoolId) {
      setSchoolId(first.school_id);
      setTrackId(first.tracks[0]?.track_id ?? 'young_to_teen');
    }
  }, [open, schools, schoolId]);

  useEffect(() => {
    if (tracksForSchool.length && !tracksForSchool.some((t) => t.track_id === trackId)) {
      setTrackId(tracksForSchool[0].track_id);
    } else if (tracksForSchool.length === 0) {
      setPlan(null);
      setConfirmed(false);
    }
  }, [tracksForSchool, trackId]);

  const loadPreview = useCallback(async () => {
    if (!schoolId || !trackId) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ school_id: schoolId, track: trackId });
      const res = await fetch(`/api/classes/graduate-teen?${qs}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not scan');
      setPlan(data.plan);
      setConfirmed(false);
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [schoolId, trackId]);

  useEffect(() => {
    if (open && schoolId && tracksForSchool.some((track) => track.track_id === trackId)) {
      void loadPreview();
    }
  }, [open, schoolId, trackId, tracksForSchool, loadPreview]);

  const updateExitGrade = async (nextExit: 'Basic 5' | 'Basic 6') => {
    if (!schoolId || nextExit === policyExit || applying) return;
    const previous = policyExit;
    setConfirmed(false);
    setPolicyExit(nextExit);
    setSavingPolicy(true);
    setError('');
    setResultMsg('');
    try {
      const res = await fetch('/api/classes/promotion-due', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          young_to_teen_exit_grade: nextExit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save school promotion policy');
      const nextTrack = data.snapshot?.schools?.[0]?.tracks?.[0]?.track_id as TrackId | undefined;
      if (nextTrack && nextTrack !== trackId) setTrackId(nextTrack);
      await onComplete?.();
      if (nextTrack === trackId) await loadPreview();
      if (!nextTrack) setPlan(null);
      setResultMsg(
        data.warning
          ?? `Young Innovators now move to Teen Developers after ${nextExit}.`,
      );
      setConfirmed(false);
    } catch (e) {
      setPolicyExit(previous);
      setError(e instanceof Error ? e.message : 'Could not save school promotion policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const applyPromotion = async () => {
    if (!plan || plan.total_promotable === 0 || !schoolId || !confirmed || savingPolicy) return;
    if (
      !confirm(
        `Move ${plan.total_promotable} learner${plan.total_promotable === 1 ? '' : 's'} (${trackLabel})?\n\nReports stay on their saved terms.`,
      )
    ) {
      return;
    }

    setApplying(true);
    setError('');
    setResultMsg('');
    try {
      const res = await fetch('/api/classes/graduate-teen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, track: trackId }),
      });
      const data = await res.json();
      if (!res.ok && !data.promoted) throw new Error(data.error || 'Promotion failed');
      setResultMsg(data.message ?? `Promoted ${data.promoted ?? 0} learners.`);
      onComplete?.();
      void loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promotion failed');
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="session-promotion-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="session-promotion-title" className="text-sm font-black text-foreground">
              Session promotion
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Class &amp; grade placement only — Teen is a programme category. Faster program progress
              at the same level stays in Learner Progress or Smart promote on each class.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {schools.length > 1 && (
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            >
              {schools.map((s) => (
                <option key={s.school_id} value={s.school_id}>{s.school_name ?? 'School'}</option>
              ))}
            </select>
          )}

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Young → Teen exit for this school
            </span>
            <select
              value={policyExit}
              disabled={savingPolicy || applying}
              onChange={(e) => void updateExitGrade(e.target.value as 'Basic 5' | 'Basic 6')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              <option value="Basic 5">After Basic 5</option>
              <option value="Basic 6">After Basic 6</option>
            </select>
          </label>

          {tracksForSchool.length > 1 && (
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value as TrackId)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            >
              {tracksForSchool.map((t) => (
                <option key={t.track_id} value={t.track_id}>
                  {t.short_label} ({t.due_count} due)
                </option>
              ))}
            </select>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
              Checking who is ready…
            </p>
          ) : null}

          {!loading && selectedSchool && tracksForSchool.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No learners are due. This school’s exit setting will be used automatically when its cohort is ready.
            </p>
          ) : null}

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
          {resultMsg ? <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{resultMsg}</p> : null}

          {plan && !loading ? (
            plan.total_promotable > 0 ? (
              <>
                <p className="text-xs font-bold text-foreground">
                  {plan.total_promotable} ready
                  {plan.total_held > 0 ? ` · ${plan.total_held} held` : ''}
                  {' · '}{trackLabel}
                </p>
                <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px]">
                  {plan.slices.map((slice) => (
                    <li key={slice.class_id} className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
                      <span className="truncate">{slice.class_name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{slice.plan.promotable_count} moving</span>
                    </li>
                  ))}
                </ul>
                <label className="flex cursor-pointer items-start gap-2 text-[11px]">
                  <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>Confirm {plan.track_label} for {plan.school_name ?? 'this school'}</span>
                </label>
                <button
                  type="button"
                  disabled={applying || savingPolicy || !confirmed}
                  onClick={() => void applyPromotion()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  {applying ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <AcademicCapIcon className="h-4 w-4" />}
                  Run ({plan.total_promotable})
                </button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {plan.blocked[0] ?? 'Nobody at an exit grade yet. Same-level program speed → Learner Progress.'}
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
