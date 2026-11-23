'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon, ArrowDownTrayIcon, ArrowPathIcon, BellIcon, CheckCircleIcon, ChevronDownIcon,
  ChevronRightIcon, ClipboardDocumentListIcon, ExclamationTriangleIcon,
  UserGroupIcon, UserIcon,
} from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { RoleBadge } from '@/components/accountability/RoleBadge';
import { CHART_COLORS, DonutChart, HorizontalBarChart } from '@/components/charts';

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  report_status: 'published' | 'draft' | 'missing';
  overall_grade: string | null;
  published_at: string | null;
};

/** The five week-package assets a class needs, and how many reach students. */
type ContentAccountability = {
  prepared: number;
  released: number;
  prepared_pct: number;
  released_pct: number;
  missing: string[];
  held_back: string[];
  weeks_touched: number;
  prepared_but_invisible: boolean;
  verdict: string;
};

type ClassDetail = {
  class_id: string;
  class_name: string;
  school_name: string | null;
  content?: ContentAccountability;
  true_students: number;
  withdrawn?: number;
  reports_total: number;
  published: number;
  drafts: number;
  missing: number;
  completion_pct: number;
  published_pct: number;
  status: 'complete' | 'drafts' | 'incomplete' | 'empty';
  students: StudentRow[];
};

export type TeacherWorkloadCard = {
  teacher_id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  school_name: string | null;
  class_count: number;
  true_students: number;
  withdrawn?: number;
  reports_total: number;
  published: number;
  drafts: number;
  missing: number;
  completion_pct: number;
  published_pct: number;
  all_classes_complete: boolean;
  all_published: boolean;
  has_true_students: boolean;
  classes_without_content?: number;
  classes_withholding_content?: number;
  content_prepared_pct?: number;
  content_released_pct?: number;
  last_active_at?: string | null;
  days_since_active?: number | null;
  attendance_days_14d?: number;
  cbt_exams_count?: number;
  study_materials_count?: number;
  performance_score?: number;
  status: 'complete' | 'drafts' | 'incomplete' | 'no_students' | 'no_classes';
  courses: string[];
  classes: ClassDetail[];
};

type Payload = {
  term_context?: { id: string; academic_year: string; term_label: string } | null;
  teachers: TeacherWorkloadCard[];
  summary: {
    teachers: number;
    complete: number;
    drafts: number;
    incomplete: number;
    no_students: number;
    no_classes: number;
  };
  generated_at?: string;
};

const CARD = 'bg-card shadow-sm border border-border rounded-2xl';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

const STATUS_META: Record<TeacherWorkloadCard['status'], {
  label: string; hint: string; tone: string; bg: string; border: string; bar: string;
}> = {
  complete: {
    label: 'Fully published',
    hint: 'Every true student has a published report',
    tone: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    bar: 'bg-emerald-500',
  },
  drafts: {
    label: 'Drafts pending',
    hint: 'Results written but not all published yet',
    tone: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    bar: 'bg-amber-500',
  },
  incomplete: {
    label: 'Incomplete',
    hint: 'Some true students still missing results',
    tone: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    bar: 'bg-rose-500',
  },
  no_students: {
    label: 'No true students',
    hint: 'Has classes but no students listed for this term',
    tone: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
    bar: 'bg-orange-500',
  },
  no_classes: {
    label: 'No classes',
    hint: 'Teacher account with no owned classes',
    tone: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    bar: 'bg-muted-foreground',
  },
};

function ProgressTrack({
  published, drafts, missing, size = 'md',
}: {
  published: number; drafts: number; missing: number; size?: 'sm' | 'md';
}) {
  const total = Math.max(1, published + drafts + missing);
  const h = size === 'sm' ? 'h-2' : 'h-2.5';
  return (
    <div className={`${h} w-full rounded-full overflow-hidden bg-muted flex`}>
      <div style={{ width: `${(published / total) * 100}%` }} className="bg-emerald-500 h-full" title={`${published} published`} />
      <div style={{ width: `${(drafts / total) * 100}%` }} className="bg-amber-500 h-full" title={`${drafts} drafts`} />
      <div style={{ width: `${(missing / total) * 100}%` }} className="bg-rose-500/80 h-full" title={`${missing} missing`} />
    </div>
  );
}

function StatusPill({ status }: { status: TeacherWorkloadCard['status'] | ClassDetail['status'] }) {
  const key = status === 'empty' ? 'no_students' : status;
  const meta = STATUS_META[key as TeacherWorkloadCard['status']] || STATUS_META.incomplete;
  const label = status === 'empty' ? 'Empty class' : meta.label;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${meta.bg} ${meta.tone} ${meta.border}`}>
      {label}
    </span>
  );
}

function TeacherCard({
  teacher,
  expanded,
  onToggle,
  onNudge,
  nudging,
}: {
  teacher: TeacherWorkloadCard;
  expanded: boolean;
  onToggle: () => void;
  onNudge: (teacher: TeacherWorkloadCard) => void;
  nudging: boolean;
}) {
  const meta = STATUS_META[teacher.status];
  const [openClass, setOpenClass] = useState<string | null>(null);
  const perfScore = teacher.performance_score ?? 0;
  const daysIdle = teacher.days_since_active;
  const idleTone = daysIdle == null
    ? 'text-muted-foreground'
    : daysIdle >= 7
      ? 'text-rose-600 dark:text-rose-400 font-bold'
      : daysIdle >= 3
        ? 'text-amber-600 dark:text-amber-400 font-semibold'
        : 'text-emerald-600 dark:text-emerald-400 font-semibold';
  const lastActiveLabel = daysIdle == null
    ? 'No login recorded'
    : daysIdle === 0
      ? 'Active today'
      : `${daysIdle}d ago`;

  return (
    <article className={`${CARD} overflow-hidden transition-shadow hover:shadow-md`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5 flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
              <AcademicCapIcon className={`w-5 h-5 ${meta.tone}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-foreground truncate">
                  {teacher.full_name || '(unnamed teacher)'}
                </h3>
                <RoleBadge role="teacher" size="sm" />
                {!teacher.is_active && (
                  <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Inactive</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {teacher.email || '—'}
                {teacher.school_name ? ` · ${teacher.school_name}` : ''}
              </p>
              {teacher.courses.length > 0 && (
                <p className="text-[11px] text-violet-600/90 dark:text-violet-400/90 mt-1 line-clamp-1">
                  Courses: {teacher.courses.join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black tabular-nums ${
              perfScore >= 80
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : perfScore >= 50
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}>
              Score {perfScore}%
            </span>
            <StatusPill status={teacher.status} />
            {expanded
              ? <ChevronDownIcon className="w-5 h-5 text-muted-foreground" />
              : <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />}
          </div>
        </div>

        {/* Live Teacher Activity Pulse Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Last active: <span className={idleTone}>{lastActiveLabel}</span></span>
            <span>Attendance (14d): <strong className="text-foreground">{teacher.attendance_days_14d ?? 0} day{(teacher.attendance_days_14d ?? 0) === 1 ? '' : 's'}</strong></span>
            <span>Active Exams: <strong className="text-foreground">{teacher.cbt_exams_count ?? 0}</strong></span>
            <span>Materials: <strong className="text-foreground">{teacher.study_materials_count ?? 0}</strong></span>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              if (!nudging) onNudge(teacher);
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !nudging) {
                e.preventDefault();
                e.stopPropagation();
                onNudge(teacher);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 cursor-pointer"
          >
            <BellIcon className="w-3 h-3" />
            {nudging ? 'Sending…' : 'Nudge Teacher'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2">
            <div className={LABEL}>Classes</div>
            <div className="text-xl font-black tabular-nums text-foreground mt-0.5">{teacher.class_count}</div>
          </div>
          <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 px-3 py-2">
            <div className={LABEL}>True students</div>
            <div className="text-xl font-black tabular-nums text-sky-600 dark:text-sky-400 mt-0.5">{teacher.true_students}</div>
            {/* Shown, not dropped: otherwise a teacher's percentage improves as
                learners leave, which is the opposite of accountability. */}
            {(teacher.withdrawn ?? 0) > 0 && (
              <div className="text-[10px] font-bold text-orange-600 dark:text-orange-400 mt-0.5">
                +{teacher.withdrawn} withdrawn
              </div>
            )}
          </div>
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
            <div className={LABEL}>Published</div>
            <div className="text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">{teacher.published}</div>
          </div>
          <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 px-3 py-2">
            <div className={LABEL}>Missing</div>
            <div className="text-xl font-black tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">{teacher.missing}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-muted-foreground">Results coverage</span>
            <span className={meta.tone}>
              {teacher.published_pct}% published · {teacher.completion_pct}% written
            </span>
          </div>
          <ProgressTrack published={teacher.published} drafts={teacher.drafts} missing={teacher.missing} />
          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Published</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Draft</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Missing</span>
            {teacher.drafts > 0 && <span className="text-amber-600 dark:text-amber-400 font-bold">{teacher.drafts} draft{teacher.drafts === 1 ? '' : 's'}</span>}
          </div>
          <p className={`text-[11px] ${meta.tone}`}>{meta.hint}</p>
        </div>

        {/* Teaching content is separate from results: a teacher can publish
            every report and still have prepared nothing for students to open. */}
        {teacher.class_count > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-muted-foreground">Teaching content</span>
              <span className={
                (teacher.content_released_pct ?? 0) > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (teacher.content_prepared_pct ?? 0) > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }>
                {teacher.content_prepared_pct ?? 0}% prepared · {teacher.content_released_pct ?? 0}% released
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              {(teacher.classes_without_content ?? 0) > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {teacher.classes_without_content} class{(teacher.classes_without_content ?? 0) === 1 ? '' : 'es'} with nothing prepared
                </span>
              )}
              {(teacher.classes_withholding_content ?? 0) > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  {teacher.classes_withholding_content} prepared but never released
                </span>
              )}
              {(teacher.classes_without_content ?? 0) === 0
                && (teacher.classes_withholding_content ?? 0) === 0
                && (teacher.content_prepared_pct ?? 0) > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  Every class has content students can open
                </span>
              )}
            </div>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 sm:px-5 py-4 space-y-3">
          {teacher.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              This teacher has no classes assigned.
            </p>
          ) : (
            teacher.classes.map((klass) => {
              const open = openClass === klass.class_id;
              return (
                <div key={klass.class_id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenClass(open ? null : klass.class_id)}
                    className="w-full flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-foreground">{klass.class_name}</span>
                        <StatusPill status={klass.status} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {klass.school_name || '—'} · {klass.true_students} true student{klass.true_students === 1 ? '' : 's'}
                      </p>
                      {klass.content && (
                        <p className={`text-[11px] mt-0.5 font-semibold ${
                          klass.content.released === 5
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : klass.content.prepared === 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {klass.content.verdict}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 min-w-[10rem] flex-1 sm:flex-none sm:w-56">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                          <span>{klass.published} pub</span>
                          <span>{klass.missing} miss</span>
                        </div>
                        <ProgressTrack published={klass.published} drafts={klass.drafts} missing={klass.missing} size="sm" />
                      </div>
                      {open ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-border overflow-x-auto">
                      {klass.students.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                          No students in this class for the current term.
                        </p>
                      ) : (
                        <table className="w-full text-sm min-w-[560px]">
                          <thead>
                            <tr className="border-b border-border text-left bg-muted/30">
                              {['Student', 'Result status', 'Grade', 'Published'].map((h) => (
                                <th key={h} className={`${LABEL} px-3 py-2.5`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {klass.students.map((s) => (
                              <tr key={s.id} className="hover:bg-accent/30">
                                <td className="px-3 py-2.5">
                                  <div className="font-bold text-foreground">{s.full_name || '(no name)'}</div>
                                  <div className="text-[11px] text-muted-foreground">{s.email || '—'}</div>
                                </td>
                                <td className="px-3 py-2.5">
                                  {s.report_status === 'published' && (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                      <CheckCircleIcon className="w-3.5 h-3.5" /> Published
                                    </span>
                                  )}
                                  {s.report_status === 'draft' && (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                                      <ClipboardDocumentListIcon className="w-3.5 h-3.5" /> Draft only
                                    </span>
                                  )}
                                  {s.report_status === 'missing' && (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                                      <ExclamationTriangleIcon className="w-3.5 h-3.5" /> No result
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground font-semibold">
                                  {s.overall_grade || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                  {s.published_at
                                    ? new Date(s.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="px-3 py-2 border-t border-border flex flex-wrap items-center justify-end gap-3">
                        <Link
                          href={`/dashboard/attendance?class_id=${klass.class_id}`}
                          className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
                        >
                          Attendance →
                        </Link>
                        <Link
                          href={`/dashboard/classes/${klass.class_id}`}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          Open Class →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </article>
  );
}

export default function TeacherAccountabilityPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'idle_7d' | 'top_performers' | TeacherWorkloadCard['status']>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nudgingId, setNudgingId] = useState<string | null>(null);

  const handleNudgeTeacher = async (teacher: TeacherWorkloadCard) => {
    setNudgingId(teacher.teacher_id);
    try {
      const db = createClient();
      const missingParts: string[] = [];
      if (teacher.missing > 0) missingParts.push(`${teacher.missing} missing student report${teacher.missing === 1 ? '' : 's'}`);
      if (teacher.drafts > 0) missingParts.push(`${teacher.drafts} unpublished draft${teacher.drafts === 1 ? '' : 's'}`);
      if ((teacher.attendance_days_14d ?? 0) === 0 && teacher.class_count > 0) missingParts.push('attendance not marked in 14 days');
      if ((teacher.classes_without_content ?? 0) > 0) missingParts.push(`${teacher.classes_without_content} class(es) without prepared lessons`);
      const summaryText = missingParts.length > 0
        ? `Admin reminder: Please attend to ${missingParts.join(', ')}.`
        : 'Admin check-in: Great work keeping your classes, attendance, and reports up to date!';
      const { error: nErr } = await db.from('notifications').insert({
        user_id: teacher.teacher_id,
        title: 'Teacher Activity & Accountability Reminder',
        message: summaryText,
        type: missingParts.length > 0 ? 'warning' : 'info',
        source_type: 'accountability',
        action_url: '/dashboard/classes',
      });
      if (nErr) throw new Error(nErr.message);
      toast.success(`Reminder sent to ${teacher.full_name || 'teacher'}.`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not send reminder');
    } finally {
      setNudgingId(null);
    }
  };

  const exportTeacherScorecardCsv = () => {
    const rows = data?.teachers ?? [];
    if (rows.length === 0) return;
    const esc = (v: unknown) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'Teacher', 'Email', 'School', 'Performance Score (%)', 'Status',
      'Classes', 'True Students', 'Reports Published', 'Drafts', 'Missing',
      'Content Released (%)', 'Attendance Days (14d)', 'Active Exams', 'Study Materials', 'Days Since Active',
    ];
    const lines = [
      headers.join(','),
      ...rows.map((t) => [
        esc(t.full_name), esc(t.email), esc(t.school_name), esc(t.performance_score ?? 0),
        esc(STATUS_META[t.status]?.label ?? t.status), esc(t.class_count), esc(t.true_students),
        esc(t.published), esc(t.drafts), esc(t.missing), esc(t.content_released_pct ?? 0),
        esc(t.attendance_days_14d ?? 0), esc(t.cbt_exams_count ?? 0), esc(t.study_materials_count ?? 0),
        esc(t.days_since_active ?? 'Never'),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rillcod-teacher-scorecard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/accountability/teachers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load teacher workload');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.teachers ?? []).filter((t) => {
      if (filter === 'idle_7d') {
        if (t.days_since_active == null || t.days_since_active < 7) return false;
      } else if (filter === 'top_performers') {
        if ((t.performance_score ?? 0) < 80) return false;
      } else if (filter !== 'all' && t.status !== filter) {
        return false;
      }
      if (q && !(`${t.full_name ?? ''} ${t.email ?? ''} ${t.school_name ?? ''} ${t.courses.join(' ')}`)
        .toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, search]);

  const donut = useMemo(() => {
    const s = data?.summary;
    if (!s) return [];
    return [
      { label: 'Fully published', value: s.complete, color: CHART_COLORS.emerald },
      { label: 'Drafts pending', value: s.drafts, color: CHART_COLORS.amber },
      { label: 'Incomplete', value: s.incomplete, color: CHART_COLORS.rose },
                  { label: 'No students', value: s.no_students, color: '#f97316' },
      { label: 'No classes', value: s.no_classes, color: '#71717a' },
    ].filter((x) => x.value > 0);
  }, [data]);

  const leaderboard = useMemo(() => {
    return (data?.teachers ?? [])
      .filter((t) => t.has_true_students)
      .map((t) => ({
        label: t.full_name || 'Teacher',
        value: t.published_pct,
        color: t.status === 'complete' ? CHART_COLORS.emerald
          : t.status === 'drafts' ? CHART_COLORS.amber
            : CHART_COLORS.rose,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [data]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <ArrowPathIcon className="w-5 h-5 animate-spin text-violet-600 dark:text-violet-400" />
        Building teacher workload map…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`${CARD} p-6 text-sm text-rose-600 dark:text-rose-400 flex items-start gap-3`}>
        <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-bold">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const summary = data!.summary;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-card to-sky-500/5 p-5 sm:p-7">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-3">
              <AcademicCapIcon className="w-3.5 h-3.5" /> Teacher results accountability
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              What each teacher delivered
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Per class: students currently enrolled, whether reports exist, and whether those reports have been sent.
              Expand any teacher to audit every student line.
            </p>
            {data?.term_context && (
              <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-3">
                This term · {data.term_context.academic_year} · {data.term_context.term_label}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={exportTeacherScorecardCsv}
              disabled={!data?.teachers?.length}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-3.5 py-2 text-xs font-black uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Scorecard CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-60"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          ['all', summary.teachers, 'All teachers', 'text-foreground'],
          ['complete', summary.complete, 'Fully published', 'text-emerald-600 dark:text-emerald-400'],
          ['drafts', summary.drafts, 'Drafts pending', 'text-amber-600 dark:text-amber-400'],
          ['incomplete', summary.incomplete, 'Incomplete', 'text-rose-600 dark:text-rose-400'],
          ['no_students', summary.no_students, 'No true students', 'text-orange-600 dark:text-orange-400'],
          ['no_classes', summary.no_classes, 'No classes', 'text-muted-foreground'],
        ] as const).map(([key, value, label, tone]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`${CARD} p-3.5 text-left transition-all ${filter === key ? 'ring-2 ring-violet-500/40 border-violet-500/40' : 'hover:border-violet-500/30'}`}
          >
            <div className={`text-2xl font-black tabular-nums ${tone}`}>{value}</div>
            <div className={`${LABEL} mt-1`}>{label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className={`${CARD} p-4 sm:p-5 xl:col-span-4`}>
          <h3 className={`${LABEL} mb-2`}>Teacher status mix</h3>
          {donut.length > 0 ? (
            <>
              <DonutChart data={donut} height={200} centerValue={summary.teachers} centerLabel="Teachers" />
              <div className="mt-2 space-y-1">
                {donut.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-xs px-1">
                    <span className="flex items-center gap-2 font-bold">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="tabular-nums font-black text-muted-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No teachers yet.</p>
          )}
        </div>
        <div className={`${CARD} p-4 sm:p-5 xl:col-span-8`}>
          <h3 className={`${LABEL} mb-3`}>Publish completion leaderboard</h3>
          {leaderboard.length > 0 ? (
            <HorizontalBarChart data={leaderboard} height={260} valueLabel="Published %" formatValue={(v) => `${v}%`} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No teachers with true students yet.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted-foreground border-t border-border pt-3">
            <span className="flex items-center gap-1.5"><UserGroupIcon className="w-3.5 h-3.5" /> Students = currently enrolled in the class (not left / ended)</span>
            <span className="flex items-center gap-1.5"><CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Fully published = every true student has a published report</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{filtered.length}</strong> teacher{filtered.length === 1 ? '' : 's'}
            {filter === 'idle_7d' ? ' · Inactive 7d+' : filter === 'top_performers' ? ' · Top Performers (80%+)' : filter !== 'all' ? ` · ${STATUS_META[filter].label}` : ''}
          </p>
          <button
            type="button"
            onClick={() => setFilter(filter === 'top_performers' ? 'all' : 'top_performers')}
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase border ${filter === 'top_performers' ? 'bg-emerald-700 text-white border-emerald-700' : 'border-border bg-card text-foreground'}`}
          >
            Top Performers ({(data?.teachers ?? []).filter((t) => (t.performance_score ?? 0) >= 80).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === 'idle_7d' ? 'all' : 'idle_7d')}
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase border ${filter === 'idle_7d' ? 'bg-rose-700 text-white border-rose-700' : 'border-border bg-card text-foreground'}`}
          >
            Inactive 7d+ ({(data?.teachers ?? []).filter((t) => (t.days_since_active ?? 0) >= 7).length})
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teacher, email, school, course…"
          aria-label="Search teachers"
          className="w-full sm:w-72 bg-card border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((t) => (
          <TeacherCard
            key={t.teacher_id}
            teacher={t}
            expanded={expanded.has(t.teacher_id)}
            onToggle={() => toggle(t.teacher_id)}
            onNudge={(teacher) => void handleNudgeTeacher(teacher)}
            nudging={nudgingId === t.teacher_id}
          />
        ))}
        {filtered.length === 0 && (
          <div className={`${CARD} p-10 text-center text-sm text-muted-foreground`}>
            <UserIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No teachers match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
