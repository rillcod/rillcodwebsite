'use client';

import {
  calendarSessionLabel,
  formatClassOptionLabel,
  formatClassRowOptionLabel,
  hasSessionIdentity,
  sessionLabel,
  SESSION_SCOPE,
  sessionsMatch,
  type SessionLike,
} from '@/lib/reports/session-scope';
import { liveAcademicSession } from '@/lib/reports/academic-period';

export type { SessionLike };
export { formatClassOptionLabel, formatClassRowOptionLabel };

/**
 * Plain-language session identity so teachers never confuse:
 * - the class's current assignment
 * - the roster filter
 * - the report document they are actually editing
 */
export function ReportSessionContextBanner({
  context,
  workingSession,
  classSession,
  reportSession,
  rosterSession,
  showCalendarNow = true,
}: {
  context: 'write' | 'publish' | 'autofill';
  workingSession: SessionLike;
  classSession?: SessionLike | null;
  reportSession?: SessionLike | null;
  rosterSession?: SessionLike | null;
  showCalendarNow?: boolean;
}) {
  const working = sessionLabel(workingSession);
  const classLabel = sessionLabel(classSession);
  const reportLabel = sessionLabel(reportSession);
  const rosterLabel = sessionLabel(rosterSession);
  const calendarLabel = calendarSessionLabel();
  const live = liveAcademicSession();

  const classDiffersFromWorking = hasSessionIdentity(classSession) && hasSessionIdentity(workingSession)
    && !sessionsMatch(classSession, workingSession);
  const reportDiffersFromWorking = hasSessionIdentity(reportSession) && hasSessionIdentity(workingSession)
    && !sessionsMatch(reportSession, workingSession);
  const rosterDiffersFromReport = hasSessionIdentity(rosterSession) && hasSessionIdentity(reportSession)
    && !sessionsMatch(rosterSession, reportSession);
  const workingDiffersFromCalendar = hasSessionIdentity(workingSession)
    && !sessionsMatch(workingSession, { term: live.termLabel, period: live.periodLabel });

  const primaryTitle =
    context === 'write'
      ? 'Reports you save here belong to'
      : context === 'autofill'
        ? 'Auto-fill will use this session'
        : reportLabel
          ? 'This report belongs to'
          : 'Showing reports for';

  const primaryValue =
    context === 'publish' && reportLabel
      ? reportLabel
      : working || '— set term and year —';

  /**
   * Everything except the session itself is a note, not a task.
   *
   * These used to render as up to four stacked blocks. On a phone that filled the
   * screen before the teacher could reach a single score, and a wall of banners is
   * read as noise, so the one line that matters — which term this saves to — was
   * lost among the ones that do not. The session stays in view; the rest collapse
   * behind a count.
   *
   * A native details/summary rather than component state: it works before hydration,
   * is reachable by keyboard, and this banner is rendered on several screens that
   * should not each carry their own toggle.
   */
  const notes: Array<{ key: string; label: string; body: React.ReactNode }> = [];

  if (context === 'write' && reportLabel && reportDiffersFromWorking) {
    notes.push({
      key: 'open-report',
      label: 'Open report on file',
      body: (
        <>
          <span className="font-semibold text-foreground">{reportLabel}</span>. Scores save to the
          session above unless you change it.
        </>
      ),
    });
  }

  if (classDiffersFromWorking) {
    notes.push({
      key: 'class-session',
      label: `${SESSION_SCOPE.classAssignment} (different)`,
      body: (
        <>
          This class is now assigned to <span className="font-bold">{classLabel}</span>. That does{' '}
          <span className="font-bold">not</span> change documents already saved for{' '}
          <span className="font-bold">{working || 'another term'}</span>.
        </>
      ),
    });
  }

  if (context === 'publish' && rosterLabel) {
    notes.push({
      key: 'roster',
      label: `${SESSION_SCOPE.working} (roster filter)`,
      body: rosterDiffersFromReport && reportLabel ? (
        <>
          List filtered to <span className="font-bold">{rosterLabel}</span>, but this learner&apos;s open
          report is <span className="font-bold">{reportLabel}</span>. Use the term switcher above the
          report to open a different document.
        </>
      ) : (
        <>Learner list filtered to <span className="font-bold">{rosterLabel}</span>.</>
      ),
    });
  }

  if (showCalendarNow && workingDiffersFromCalendar && context !== 'publish') {
    notes.push({
      key: 'calendar',
      label: SESSION_SCOPE.calendar,
      body: (
        <>
          <span className="font-semibold text-foreground">{calendarLabel}</span>.
          {context === 'autofill'
            ? ' New auto-fill drafts follow the class session above, not the calendar.'
            : ' You can still write for another term — check the session line above before saving.'}
        </>
      ),
    });
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 sm:px-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-primary">
        {primaryTitle}
      </p>
      <p className="mt-0.5 text-sm font-black text-foreground">{primaryValue}</p>

      {notes.length > 0 ? (
        <details className="group mt-1.5">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground">
            <span
              aria-hidden
              className="inline-block transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {notes.length === 1 ? '1 note about this session' : `${notes.length} notes about this session`}
          </summary>
          <div className="mt-1.5 space-y-1.5 border-l-2 border-primary/20 pl-3">
            {notes.map((note) => (
              <p key={note.key} className="text-[11px] leading-5 text-muted-foreground">
                <span className="font-black uppercase tracking-wider text-foreground/70">{note.label}:</span>{' '}
                {note.body}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Compact strip for grades, lesson plans, attendance, etc. */
export function AcademicSessionScopeStrip({
  purpose,
  workingSession,
  classSession,
  hint,
}: {
  purpose: string;
  workingSession: SessionLike;
  classSession?: SessionLike | null;
  hint?: string;
}) {
  const working = sessionLabel(workingSession);
  const classLabel = sessionLabel(classSession);
  const classDiffers = hasSessionIdentity(classSession) && hasSessionIdentity(workingSession)
    && !sessionsMatch(classSession, workingSession);

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        {purpose} · {SESSION_SCOPE.working}
      </p>
      <p className="mt-0.5 text-sm font-bold text-foreground">{working || '— pick term and year —'}</p>
      {classDiffers ? (
        <p className="mt-1 text-[11px] leading-5 text-amber-900 dark:text-amber-100">
          {SESSION_SCOPE.classAssignment}: <span className="font-semibold">{classLabel}</span> — does not move saved work from{' '}
          <span className="font-semibold">{working}</span>.
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Parent portal — grades are live-term scoped; reports list all published terms. */
export function SessionCalendarRollNotice({ fromLabel }: { fromLabel: string | null }) {
  if (!fromLabel) return null;
  return (
    <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-200">
        Calendar advanced
      </p>
      <p className="mt-0.5 text-[11px] leading-5 text-foreground">
        Roster now follows <span className="font-bold">{calendarSessionLabel()}</span>.
        You were viewing <span className="font-bold">{fromLabel}</span> — those saved reports are still on file.
      </p>
    </div>
  );
}

/** Parent portal — inactive / withdrawn learner on roster. */
export function ParentChildEnrollmentBanner({
  enrollmentLabel,
  isActive,
}: {
  enrollmentLabel?: string | null;
  isActive?: boolean;
}) {
  if (isActive !== false && enrollmentLabel !== 'Inactive') return null;
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
        Learner status · {enrollmentLabel || 'Inactive'}
      </p>
      <p className="mt-0.5 text-[11px] leading-5 text-foreground">
        Not on the active class roster right now — you can still log in here. Published report cards from
        earlier terms stay on file (each card shows the session saved when the teacher published).
        Live grades and attendance only show the current school term.
      </p>
    </div>
  );
}

/** Parent portal — grades are live-term scoped; reports list all published terms. */
export function ParentPortalSessionBanner({
  mode,
  evidenceSession,
}: {
  mode: 'grades' | 'results';
  evidenceSession?: SessionLike | null;
}) {
  if (mode === 'grades') {
    const label = sessionLabel(evidenceSession) || calendarSessionLabel();
    return (
      <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          Assignment &amp; exam grades · {SESSION_SCOPE.evidence}
        </p>
        <p className="mt-0.5 text-sm font-bold text-foreground">{label}</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Only work from this school term appears here. Progress reports below may belong to other terms —
          each card shows the term the teacher saved when publishing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        Published progress reports · {SESSION_SCOPE.document}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-foreground">
        Each card shows the <span className="font-semibold">saved session</span> from when the teacher published —
        not necessarily the class&apos;s current term or today&apos;s calendar ({calendarSessionLabel()}).
      </p>
    </div>
  );
}
