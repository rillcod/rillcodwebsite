'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  BoltIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@/lib/icons';
import type { IntelligentClassPromotionPlan } from '@/lib/progression/enrich-class-promotion';

type DestinationOption = {
  id: string;
  name: string | null;
  qa_grade_key: string | null;
  qa_grade_band: string | null;
};

type Props = {
  classId: string;
  activeStudentCount: number;
  selectedStudentIds?: string[];
  onComplete?: () => void;
};

export function ClassPromotionPanel({
  classId,
  activeStudentCount,
  selectedStudentIds,
  onComplete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<IntelligentClassPromotionPlan | null>(null);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [destinationId, setDestinationId] = useState<string>('');
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const [smartMode, setSmartMode] = useState(true);
  const [strictGate, setStrictGate] = useState(false);
  const [advanceCurriculum, setAdvanceCurriculum] = useState<'auto' | 'always' | 'never'>('auto');
  const [programmeBridgeConfirmed, setProgrammeBridgeConfirmed] = useState(false);

  const targetCount = selectedStudentIds?.length ?? activeStudentCount;

  const smartQuery = useCallback(
    (destOverride?: string) => {
      const params = new URLSearchParams();
      if (destOverride) params.set('destination_class_id', destOverride);
      if (selectedStudentIds?.length) params.set('student_ids', selectedStudentIds.join(','));
      if (!smartMode) params.set('smart_mode', '0');
      if (strictGate) params.set('strict_class_gate', '1');
      if (advanceCurriculum !== 'auto') params.set('advance_curriculum', advanceCurriculum);
      return params.toString() ? `?${params.toString()}` : '';
    },
    [selectedStudentIds, smartMode, strictGate, advanceCurriculum],
  );

  const loadPreview = useCallback(
    async (destOverride?: string) => {
      setLoading(true);
      setError('');
      try {
        const qs = smartQuery(destOverride);
        const res = await fetch(`/api/classes/${classId}/promote${qs}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load promotion preview');
        setPlan(data.plan);
        setDestinations(data.destination_options ?? []);
        const def = destOverride ?? data.plan?.default_destination_class_id ?? '';
        setDestinationId(def);
        setProgrammeBridgeConfirmed(false);
      } catch (e) {
        setPlan(null);
        setError(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    },
    [classId, smartQuery],
  );

  useEffect(() => {
    if (open) void loadPreview(destinationId || undefined);
  }, [open, smartMode, strictGate, advanceCurriculum, loadPreview]);

  const onDestinationChange = (nextId: string) => {
    setDestinationId(nextId);
    void loadPreview(nextId || undefined);
  };

  const applyPromotion = async () => {
    if (!plan || plan.promotable_count === 0) return;
    if (plan.has_programme_bridge && !programmeBridgeConfirmed) {
      setError('Confirm the Young Innovators → Teen Developers graduation before running.');
      return;
    }
    const intel = plan.intelligence;
    const sample = plan.moves.find((m) => !m.skipped);
    const bridgeMove = plan.moves.find((m) => !m.skipped && m.programme_transition);
    const destLabel = sample?.destination_class_name ?? 'the next class';
    const bridgeRoute = bridgeMove
      ? `${bridgeMove.from_grade} → ${bridgeMove.to_grade}`
      : 'programme transition';
    const bridgeNote = plan.has_programme_bridge
      ? `\n\n${plan.programme_transition_count} learner${plan.programme_transition_count === 1 ? '' : 's'} will graduate from Young Innovators to Teen Developers (${bridgeRoute}).`
      : '';
    if (
      !confirm(
        `Run smart promotion for ${plan.promotable_count} learner${plan.promotable_count === 1 ? '' : 's'} → ${destLabel}?${bridgeNote}\n\n`
        + `${intel.full} full (class + curriculum when eligible)\n`
        + `${intel.class_only} class only\n`
        + `${intel.hold} held\n\n`
        + 'Published report cards stay on their saved terms.',
      )
    ) {
      return;
    }

    setApplying(true);
    setError('');
    setResultMsg('');
    try {
      const res = await fetch(`/api/classes/${classId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apply: true,
          destination_class_id: destinationId || undefined,
          studentIds: selectedStudentIds?.length ? selectedStudentIds : undefined,
          smart_mode: smartMode,
          strict_class_gate: strictGate,
          advance_curriculum: advanceCurriculum,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.promoted) throw new Error(data.error || 'Promotion failed');
      setResultMsg(data.message ?? `Promoted ${data.promoted ?? 0} learners.`);
      if (data.failed?.length) {
        setError(data.failed.map((f: { error?: string }) => f.error).filter(Boolean).join(' · '));
      }
      onComplete?.();
      void loadPreview(destinationId || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promotion failed');
    } finally {
      setApplying(false);
    }
  };

  if (activeStudentCount === 0 && !selectedStudentIds?.length) return null;

  const nextGrade =
    plan?.source_grade_anchor && plan.moves.find((m) => !m.skipped)?.to_grade;
  const intel = plan?.intelligence;

  return (
    <div id="class-promotion-panel" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={open}
      >
        <SparklesIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground">Smart promote — new session</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Moves the class &amp; grade for the new session. Optional curriculum step when evidence passes —
            for moving faster in the program at the same level, use Learner Progress.
          </p>
        </div>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-emerald-500/20 pt-4">
          <div className="flex flex-wrap gap-2 text-[10px]">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-background px-2.5 py-1.5 font-bold">
              <input type="checkbox" checked={smartMode} onChange={(e) => setSmartMode(e.target.checked)} />
              Smart gates
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 font-bold">
              <input type="checkbox" checked={strictGate} onChange={(e) => setStrictGate(e.target.checked)} disabled={!smartMode} />
              Strict (hold below pass)
            </label>
            <select
              value={advanceCurriculum}
              onChange={(e) => setAdvanceCurriculum(e.target.value as 'auto' | 'always' | 'never')}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 font-bold"
              disabled={!smartMode}
            >
              <option value="auto">Curriculum: when eligible</option>
              <option value="always">Curriculum: always</option>
              <option value="never">Curriculum: never</option>
            </select>
          </div>

          {loading && !plan ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Scanning reports, attendance, destinations…
            </div>
          ) : null}

          {plan && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg border border-border bg-background px-2.5 py-1 font-black uppercase tracking-wider">
                  {plan.source_grade_anchor ?? 'Grade ?'}
                </span>
                <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
                  {nextGrade ?? 'Next'}
                </span>
                <span className="text-muted-foreground">· {plan.promotable_count} moving</span>
              </div>

              {plan.has_programme_bridge ? (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
                  <p className="flex items-start gap-2 font-black text-amber-900 dark:text-amber-100">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    Programme graduation — Young Innovators → Teen Developers
                  </p>
                  <p className="mt-1.5 leading-relaxed text-amber-950/90 dark:text-amber-50/90">
                    {plan.programme_transition_count} learner
                    {plan.programme_transition_count === 1 ? '' : 's'} move into the Teen Developers
                    category at {nextGrade ?? 'JSS 1'}. This is a category change, not program speed.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/30 bg-background/80 p-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={programmeBridgeConfirmed}
                      onChange={(e) => setProgrammeBridgeConfirmed(e.target.checked)}
                    />
                    <span className="font-bold leading-snug">
                      I confirm graduating these learners from Young Innovators to Teen Developers
                    </span>
                  </label>
                </div>
              ) : null}

              {intel && smartMode ? (
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                  <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-emerald-800 dark:text-emerald-200">
                    {intel.full} class + curriculum
                  </span>
                  <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-amber-800 dark:text-amber-200">
                    {intel.class_only} class only
                  </span>
                  {intel.hold > 0 ? (
                    <span className="rounded-lg bg-rose-500/15 px-2 py-1 text-rose-800 dark:text-rose-200">
                      {intel.hold} held
                    </span>
                  ) : null}
                  {intel.fast_track_hints > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 text-primary">
                      <BoltIcon className="h-3 w-3" />
                      {intel.fast_track_hints} fast-track
                    </span>
                  ) : null}
                </div>
              ) : null}

              {destinations.length > 0 && (
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Destination class
                  </span>
                  <select
                    value={destinationId}
                    onChange={(e) => onDestinationChange(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold"
                  >
                    <option value="">Auto — best match at this school</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.qa_grade_key ? ` · ${d.qa_grade_key}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {plan.blocked.map((reason) => (
                <p key={reason} className="text-xs text-amber-700 dark:text-amber-300">
                  {reason}
                </p>
              ))}

              {plan.skipped_count > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-bold text-foreground">
                    {plan.skipped_count} learner{plan.skipped_count === 1 ? '' : 's'} skipped / held
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-4 list-disc">
                    {plan.moves.filter((m) => m.skipped).map((m) => (
                      <li key={m.student_id}>
                        {m.student_name}: {m.skip_reason ?? 'Not eligible'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {intel && intel.fast_track_hints > 0 && (
                <p className="text-[11px] text-primary">
                  {intel.fast_track_hints} high scorer{intel.fast_track_hints === 1 ? '' : 's'} — use{' '}
                  <Link href="/dashboard/learner-progress?view=decisions" className="font-bold underline">
                    Learner Progress
                  </Link>{' '}
                  to jump extra ladder steps mid-year.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    applying
                    || plan.promotable_count === 0
                    || (plan.has_programme_bridge && !programmeBridgeConfirmed)
                  }
                  onClick={() => void applyPromotion()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {applying ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <AcademicCapIcon className="h-4 w-4" />
                  )}
                  Run smart promote ({plan.promotable_count})
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPreview(destinationId || undefined)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 py-2.5 text-xs font-black uppercase tracking-wider"
                >
                  Rescan
                </button>
                <Link
                  href="/dashboard/classes/add"
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-primary"
                >
                  Create missing class
                </Link>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resultMsg && !error && (
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{resultMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}
