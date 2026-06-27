'use client';

export type LearningPathCardItem = {
  enrollment_id: string;
  course_title: string;
  program_name: string;
  enrollment_status?: string | null;
  term_label: string;
  current_term: number;
  current_week: number;
  completed_weeks?: number | null;
  total_weeks?: number | null;
  completion_pct: number;
  assignments_completed?: number;
  assignments_total?: number;
  latest_report?: {
    overall_grade: string | null;
    overall_score?: number | null;
    is_published: boolean | null;
    report_term?: string | null;
    report_period?: string | null;
  } | null;
  is_current_class_course?: boolean | null;
  last_topic: string | null;
  status_summary: string;
  term_statuses?: Array<{ key: string; status: string }>;
  visibility_mode?: 'full' | 'milestone';
  can_view_full?: boolean;
};

export function LearningPathCard({ path, showTermDetails = false }: { path: LearningPathCardItem; showTermDetails?: boolean }) {
  const completed = path.completed_weeks ?? 0;
  const total = path.total_weeks ?? 0;
  const reportLabel = path.latest_report?.overall_grade ?? (
    typeof path.latest_report?.overall_score === 'number' ? `${Math.round(path.latest_report.overall_score)}%` : 'No report'
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm sm:text-base font-black text-foreground truncate">{path.course_title}</p>
            {path.is_current_class_course !== false && (
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                Current
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{path.program_name} · {path.term_label}</p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{path.status_summary}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:block sm:text-right shrink-0">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
              {path.visibility_mode === 'milestone' ? 'Milestone view' : 'Full view'}
            </p>
            <p className="text-xs font-bold text-foreground">Term {path.current_term} · Week {path.current_week}</p>
          </div>
          <div className="sm:mt-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Progress</p>
            <p className="text-xs font-bold text-foreground">{Math.round(path.completion_pct)}%</p>
          </div>
        </div>
      </div>

      <div className="mt-4 h-2.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, path.completion_pct))}%` }} />
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Last taught topic: <span className="text-foreground font-medium">{path.last_topic ?? 'No topic recorded yet'}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="font-black text-foreground">{path.assignments_completed ?? 0}/{path.assignments_total ?? 0}</p>
          <p className="text-muted-foreground">Assignments graded</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="font-black text-foreground">{reportLabel}</p>
          <p className="text-muted-foreground">{path.latest_report?.is_published ? 'Published report' : 'Report pending'}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="font-black text-foreground">{path.is_current_class_course === false ? 'Not current focus' : 'Current path'}</p>
          <p className="text-muted-foreground">{path.enrollment_status ? `Status: ${path.enrollment_status}` : 'Class course focus'}</p>
        </div>
      </div>

      {showTermDetails && path.can_view_full && path.term_statuses?.length ? (
        <details className="mt-3 rounded-xl border border-border bg-background p-3">
          <summary className="cursor-pointer text-[11px] font-bold text-primary">Term status details</summary>
          <ul className="mt-2 text-xs text-muted-foreground space-y-1">
            {path.term_statuses.map((s) => (
              <li key={s.key}>{s.key}: <span className="text-foreground">{s.status}</span></li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
