'use client';

/**
 * Course picker that answers itself.
 *
 * A plain <select> of every course in a programme forced a decision nobody had the information
 * to make: the list never said which edition the school had adopted, which had a curriculum, or
 * which the rest of the school already teaches. This asks /api/courses/recommend for that
 * evidence, applies the answer when it is unambiguous, and only opens the full list when there
 * is a genuine choice — or when someone asks to see it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AcademicCapIcon, ArrowPathIcon, CheckCircleIcon,
  ExclamationTriangleIcon, PencilSquareIcon,
} from '@/lib/icons';
import { curriculumStatusLabel, type CourseChoice, type CourseRecommendation } from '@/lib/courses/course-recommendation';

type Props = {
  /** Optional when `classId` is given — the server reads the class's programme. */
  programId?: string;
  schoolId?: string | null;
  grade?: string | null;
  classId?: string | null;
  classLabel?: string | null;
  value: string;
  onChange: (courseId: string, course: CourseChoice | null) => void;
  /** Programme not chosen yet, or the form is busy. */
  disabled?: boolean;
  label?: string;
  labelClass?: string;
};

const BADGE: Record<CourseChoice['status'], string> = {
  adopted: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  published: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/25',
  draft: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
  none: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25',
};

function StatusBadge({ status }: { status: CourseChoice['status'] }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${BADGE[status]}`}>
      {curriculumStatusLabel(status)}
    </span>
  );
}

export function SmartCourseSelect({
  programId, schoolId, grade, classId, classLabel,
  value, onChange, disabled, label = 'Course', labelClass,
}: Props) {
  const [result, setResult] = useState<CourseRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  // One auto-apply per scope. Without this, clearing the field would immediately refill it and
  // the user could never choose "none".
  const appliedScope = useRef<string>('');
  // Callers pass an inline arrow; holding it in a ref keeps the reconcile effect from re-running
  // on every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const scope = [programId ?? '', schoolId ?? '', grade ?? '', classId ?? ''].join('|');

  useEffect(() => {
    if (!programId && !classId) {
      setResult(null);
      setFailed(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(null);
    const query = new URLSearchParams();
    if (programId) query.set('program_id', programId);
    if (schoolId) query.set('school_id', schoolId);
    if (grade) query.set('grade', grade);
    if (classId) query.set('class_id', classId);
    if (classLabel) query.set('class_label', classLabel);
    if (value) query.set('current_course_id', value);

    fetch(`/api/courses/recommend?${query.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Could not load courses');
        return json.data as CourseRecommendation;
      })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((error) => { if (!cancelled) setFailed(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // `value` is deliberately excluded — refetching on every selection would fight the user.
  }, [programId, schoolId, grade, classId, classLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((choice: CourseChoice | null) => {
    onChange(choice?.id ?? '', choice);
    setBrowsing(false);
  }, [onChange]);

  // Reconcile the field with the evidence: drop a selection that no longer belongs to this
  // programme (changing school or grade can retire it), then apply a confident recommendation.
  useEffect(() => {
    if (!result) return;
    // Only retire a selection when there is a real list to judge it against. An empty
    // result means "nothing loaded for this scope", not "your course is wrong" — clearing
    // on that would silently drop a course a deep link had already set.
    if (value && result.options.length > 0 && !result.options.some((option) => option.id === value)) {
      onChangeRef.current('', null);
      return;
    }
    if (value || appliedScope.current === scope) return;
    if (!result.recommended || result.confidence === 'ambiguous' || result.confidence === 'none') return;
    appliedScope.current = scope;
    onChangeRef.current(result.recommended.id, result.recommended);
  }, [result, scope, value]);

  const selected = result?.options.find((option) => option.id === value) ?? null;
  const options = result?.options ?? [];
  const showList = browsing || (!!result && !selected && options.length > 0);

  if (!programId && !classId) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          Choose a programme first — the course is worked out from it.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className={labelClass}>{label}</label>
        {loading && <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-primary" />}
      </div>

      {failed && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{failed}</span>
        </div>
      )}

      {/* Settled: one line saying what was picked and why. */}
      {selected && !browsing && (
        <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-3.5">
          <div className="flex items-start gap-3">
            <AcademicCapIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-foreground">{selected.title}</p>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{result?.reason}</p>
              {!selected.teachable && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <ExclamationTriangleIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <span>No published curriculum for this course yet — the content engine has nothing official to build lessons from.</span>
                </p>
              )}
            </div>
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => setBrowsing(true)}
                disabled={disabled}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <PencilSquareIcon className="h-3 w-3" /> Change
              </button>
            )}
          </div>
        </div>
      )}

      {/* A real choice, or the user asked to see the list. */}
      {showList && (
        <div className="space-y-2">
          {result?.reason && !selected && (
            <p className="text-[11px] text-muted-foreground">{result.reason}</p>
          )}
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => apply(active ? null : option)}
                className={`w-full rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-primary/5'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {active
                    ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    : <span className="mt-1 h-3 w-3 flex-shrink-0 rounded-full border border-border" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{option.title}</span>
                      <StatusBadge status={option.status} />
                      {option.id === result?.recommended?.id && (
                        <span className="rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-primary">
                          Suggested
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{option.reasons.join(' · ')}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {browsing && selected && (
            <button
              type="button"
              onClick={() => setBrowsing(false)}
              className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          )}
        </div>
      )}

      {!loading && result && options.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          {result.reason}
        </div>
      )}

      {result && result.withoutCurriculum.length > 0 && (browsing || !selected) && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {result.withoutCurriculum.length} course{result.withoutCurriculum.length === 1 ? ' in' : 's in'} this programme
          {result.withoutCurriculum.length === 1 ? ' has' : ' have'} no curriculum yet
          {' '}({result.withoutCurriculum.map((option) => option.title).join(', ')}).
          Publishing one in Academic → Curriculum makes it teachable.
        </p>
      )}
    </div>
  );
}
