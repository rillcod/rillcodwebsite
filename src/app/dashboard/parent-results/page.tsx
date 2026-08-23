'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  DocumentChartBarIcon, AcademicCapIcon, ClipboardDocumentCheckIcon,
  TrophyIcon, UserIcon, HeartIcon, CheckCircleIcon, ShareIcon, PrinterIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { fetchWithTimeoutOrThrow } from '@/lib/async-timeout';
import { ParentPortalSessionBanner, ParentChildEnrollmentBanner } from '@/components/reports/ReportSessionContextBanner';
import { parseScoreAuthority, progressReportComplement, scoreAuthorityFromStanding } from '@/lib/reports/complement';
import { formatHostMark, hostLearningEvidence, hostSchoolScoreboard } from '@/lib/academic/host-marks';

interface Child {
  id: string;
  full_name: string;
  school_name: string | null;
  user_id: string | null;
  enrollment_label?: string;
  is_enrollment_active?: boolean;
  programme_standing?: string | null;
}
interface Report {
  id: string;
  course_name: string;
  report_term: string;
  report_period?: string | null;
  theory_score: number | null;
  practical_score: number | null;
  attendance_score: number | null;
  overall_score: number | null;
  overall_grade: string | null;
  is_published: boolean;
  report_date: string | null;
  instructor_name: string | null;
  learning_milestones: string[] | null;
  key_strengths: string | null;
  areas_for_growth: string | null;
  participation_score: number | null;
  engagement_metrics?: { classwork_score?: unknown; assessment_score?: unknown; score_authority?: unknown } | null;
}

function gradeColor(grade: string | null) {
  if (!grade) return 'text-muted-foreground';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400';
  if (g.startsWith('B')) return 'text-primary';
  if (g.startsWith('C')) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function scoreBarColor(score: number | null) {
  if (score == null) return 'bg-muted-foreground/30';
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 55) return 'bg-amber-500';
  return 'bg-rose-500';
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-sm font-black text-foreground">{value ?? '—'}{value != null ? '%' : ''}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(value)}`}
          style={{ width: `${Math.min(value ?? 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Nigerian phone formatter for WhatsApp
function fmtWaPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  return digits;
}

function buildReportShareText(child: { full_name: string }, report: Report, copy = progressReportComplement('rillcod')): string {
  const board = hostSchoolScoreboard(report.engagement_metrics);
  const learning = hostLearningEvidence(report);
  const schoolLines = board
    ? [
        ...board.papers.map((row) => `${row.label}: ${formatHostMark(row.mark)}`),
        `${copy.overallCaption}: ${formatHostMark(board.total)}`,
        copy.learningCaption,
        learning.assignments != null ? `${copy.assignments}: ${learning.assignments}%` : null,
        learning.practical != null ? `${copy.practical}: ${learning.practical}%` : null,
      ]
    : [
        report.theory_score != null     ? `${copy.theory}: ${report.theory_score}%`      : null,
        report.practical_score != null  ? `${copy.practical}: ${report.practical_score}%`   : null,
        report.attendance_score != null ? `${copy.assignments}: ${report.attendance_score}%` : null,
        report.participation_score != null ? `${copy.attendance}: ${report.participation_score}%` : null,
        report.overall_score != null    ? `${copy.overallCaption}: ${report.overall_score}%`     : null,
      ];
  const lines = [
    `📊 *${copy.documentTitle} — ${child.full_name}*`,
    `📚 Course: ${report.course_name}`,
    `📅 Session: ${[report.report_period, report.report_term].filter(Boolean).join(' · ')}${report.report_date ? ` (${new Date(report.report_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })})` : ''}`,
    ``,
    ...schoolLines,
    report.overall_grade            ? `🏆 Grade:       ${report.overall_grade}`      : null,
    ``,
    report.instructor_name ? `👨‍🏫 Instructor: ${report.instructor_name}` : null,
    copy.parentNotice ? `` : null,
    copy.parentNotice,
    ``,
    `_Shared from Rillcod Technologies Portal_`,
  ].filter((line) => line !== null).join('\n');
  return lines;
}

function ParentResultsContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [childrenError, setChildrenError] = useState('');
  const [reportsError, setReportsError] = useState('');
  const [childrenRevision, setChildrenRevision] = useState(0);
  const [reportsRevision, setReportsRevision] = useState(0);
  const [enrollmentLabel, setEnrollmentLabel] = useState<string | null>(null);
  const [isEnrollmentActive, setIsEnrollmentActive] = useState<boolean | undefined>(undefined);
  const [programmeStanding, setProgrammeStanding] = useState<string>('optional');

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoadingChildren(true);
    setChildrenError('');
    fetchWithTimeoutOrThrow('/api/parents/portal?section=children', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load children');
        return data;
      })
      .then(data => {
        if (cancelled) return;
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        if (cancelled) return;
        setChildren([]);
        setSelectedId(null);
        setChildrenError(err instanceof Error ? err.message : 'Could not load student list.');
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
    return () => { cancelled = true; };
  }, [profile, childrenRevision]); // eslint-disable-line

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingReports(true);
    setReports([]);
    setReportsError('');
    setEnrollmentLabel(null);
    setIsEnrollmentActive(undefined);
    fetchWithTimeoutOrThrow(`/api/parents/portal?section=results&child_id=${selectedId}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load report cards');
        return data;
      })
      .then(data => {
        if (cancelled) return;
        if (!data.success) throw new Error(data.error || 'Failed to load report cards');
        setReports((data.reports ?? []) as Report[]);
        setEnrollmentLabel(data.enrollment_label ?? null);
        setIsEnrollmentActive(data.is_enrollment_active);
        setProgrammeStanding(data.programme_standing === 'compulsory' ? 'compulsory' : 'optional');
        setLoadingReports(false);
      })
      .catch(err => {
        if (cancelled) return;
        setReports([]);
        setReportsError(err instanceof Error ? err.message : 'Could not load progress reports.');
        toast.error('Could not load progress reports for this student.');
        console.error('Failed to load reports:', err);
        setLoadingReports(false);
      });
    return () => { cancelled = true; };
  }, [selectedId, reportsRevision]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);
  const pageCopy = progressReportComplement(
    scoreAuthorityFromStanding(selectedChild?.programme_standing ?? programmeStanding),
  );
  const scoredReports = reports.filter(report =>
    report.overall_score != null && Number.isFinite(Number(report.overall_score)),
  );
  const avgScore = scoredReports.length > 0
    ? Math.round(scoredReports.reduce((sum, report) => sum + Number(report.overall_score), 0) / scoredReports.length)
    : null;

  return (
    <div className="space-y-6 mobile-page-root">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">{pageCopy.parentPageTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1">{pageCopy.parentPageSubtitle}</p>
        {pageCopy.parentNotice ? (
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{pageCopy.parentNotice}</p>
        ) : null}
        {/*
          The grading guide used to be its own row in the parent sidebar, which put
          a reference page beside the five screens a parent actually visits. It
          belongs here instead: this is where a parent reads "B3" and wonders what
          it means.
        */}
        <a
          href="/dashboard/grades/waec"
          className="mt-2 inline-flex min-h-9 items-center text-xs font-bold text-primary underline-offset-4 hover:underline"
        >
          What do these grades mean?
        </a>
      </div>

      {/* Child Selector */}
      {childrenError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{childrenError} No unlinked-child state is shown until this check succeeds.</span>
          <button type="button" onClick={() => setChildrenRevision((value) => value + 1)} className="min-h-11 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black">Try again</button>
        </div>
      ) : null}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => { setSelectedId(child.id); setExpandedId(null); }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border transition-all ${
                selectedId === child.id
                  ? 'bg-primary border-primary text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}>
              {child.full_name}
              {child.is_enrollment_active === false ? (
                <span className="ml-1.5 opacity-70">· {child.enrollment_label || 'Inactive'}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && !childrenError && children.length === 0 && (
        <div className="bg-card border border-border p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
          <p className="text-xs text-muted-foreground mt-1">Contact admin to link your child to your account.</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4 mobile-page-root">
          <ParentPortalSessionBanner mode="results" />
          <ParentChildEnrollmentBanner
            enrollmentLabel={enrollmentLabel ?? selectedChild.enrollment_label}
            isActive={isEnrollmentActive ?? selectedChild.is_enrollment_active}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Reports for {selectedChild.full_name}
            </p>
            {avgScore != null && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Avg Score</span>
                <span className={`text-sm font-black ${scoreBarColor(avgScore).replace('bg-', 'text-')}`}>{avgScore}%</span>
              </div>
            )}
          </div>

          {loadingReports && (
            <div className="space-y-4 mobile-page-root">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border p-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-2/3 animate-pulse opacity-50" />
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingReports && reportsError ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
              <ExclamationTriangleIcon className="h-8 w-8 text-rose-600 dark:text-rose-400" />
              <p className="text-sm text-rose-700 dark:text-rose-300">{reportsError} No empty report state is shown until this check succeeds.</p>
              <button type="button" onClick={() => setReportsRevision((value) => value + 1)} className="min-h-11 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black">Try again</button>
            </div>
          ) : null}

          {!loadingReports && !reportsError && reports.length === 0 && (
            <div className="bg-card border border-border p-8 text-center">
              <DocumentChartBarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No published reports</p>
              <p className="text-xs text-muted-foreground mt-1">Reports will appear here once published by the teacher.</p>
            </div>
          )}

          {!loadingReports && !reportsError && reports.length > 0 && (
            <div className="space-y-3 mobile-page-root">
              {reports.map(report => {
                const isOpen = expandedId === report.id;
                const copy = progressReportComplement(
                  parseScoreAuthority(report.engagement_metrics) === 'host_school'
                    || (selectedChild?.programme_standing ?? programmeStanding) === 'compulsory'
                    ? 'host_school'
                    : 'rillcod',
                );
                return (
                  <div key={report.id} className="bg-card border border-border overflow-hidden">
                    {/* Summary row — always visible */}
                    <button
                      className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-all"
                      onClick={() => setExpandedId(isOpen ? null : report.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-foreground text-sm truncate">{report.course_name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {[report.report_period, report.report_term].filter(Boolean).join(' · ')}{report.report_date ? ` · ${new Date(report.report_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Mini score bars */}
                        <div className="hidden sm:flex items-center gap-3">
                          {(() => {
                            const board = hostSchoolScoreboard(report.engagement_metrics);
                            const rings = board
                              ? board.papers.map((row) => ({
                                  label: row.kind === 'examination' ? 'Ex' : row.kind === 'second_test' ? '2' : '1',
                                  value: row.mark.percent,
                                  title: `${row.label}: ${formatHostMark(row.mark)}`,
                                  display: formatHostMark(row.mark),
                                }))
                              : [
                                  { label: 'T', value: report.theory_score, title: copy.theory, display: report.theory_score != null ? String(report.theory_score) : '—' },
                                  { label: 'P', value: report.practical_score, title: copy.practical, display: report.practical_score != null ? String(report.practical_score) : '—' },
                                  { label: 'As', value: report.attendance_score, title: copy.assignments, display: report.attendance_score != null ? String(report.attendance_score) : '—' },
                                  { label: 'At', value: report.participation_score, title: copy.attendance, display: report.participation_score != null ? String(report.participation_score) : '—' },
                                ];
                            return rings.map(({ label, value, title, display }) => (
                            <div key={label} title={title} className="flex flex-col items-center gap-1">
                              <div className="w-8 h-8 relative">
                                <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                                  <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
                                  <circle
                                    cx="18" cy="18" r="14" fill="none" strokeWidth="3"
                                    stroke={value != null && value >= 70 ? '#10b981' : value != null && value >= 55 ? '#f59e0b' : '#f43f5e'}
                                    strokeDasharray={`${(value ?? 0) * 0.88} 88`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-foreground">{label}</span>
                              </div>
                              <span className="text-[8px] font-black text-muted-foreground">{display}</span>
                            </div>
                            ));
                          })()}
                        </div>

                        {/* Grade badge */}
                        <div className="text-center">
                          <p className={`text-2xl font-black ${gradeColor(report.overall_grade)}`}>{report.overall_grade ?? '—'}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {(() => {
                              const board = hostSchoolScoreboard(report.engagement_metrics);
                              if (board) return formatHostMark(board.total);
                              return report.overall_score != null ? `${report.overall_score}%` : '';
                            })()}
                          </p>
                        </div>

                        <div className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-border px-6 py-5 space-y-5 bg-background/50">
                        {copy.parentNotice ? (
                          <p className="text-xs leading-5 text-muted-foreground">{copy.parentNotice}</p>
                        ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-3 mobile-page-root">
                            {(() => {
                              const board = hostSchoolScoreboard(report.engagement_metrics);
                              const learning = hostLearningEvidence(report);
                              if (board) {
                                return (
                                  <>
                                    {board.papers.map((row) => (
                                      <div key={row.kind} className="flex justify-between text-sm">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{row.label}</span>
                                        <span className="font-black">{formatHostMark(row.mark)}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-sm border-t border-border pt-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest">{copy.overallCaption}</span>
                                      <span className="font-black">{formatHostMark(board.total)}</span>
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pt-2">{copy.learningCaption}</p>
                                    {copy.learningNote ? <p className="text-xs text-muted-foreground">{copy.learningNote}</p> : null}
                                    <ScoreBar label={copy.assignments} value={learning.assignments} />
                                    <ScoreBar label={copy.practical} value={learning.practical} />
                                    <ScoreBar label={copy.classwork} value={learning.classwork} />
                                    <ScoreBar label={copy.attendance} value={learning.attendance} />
                                  </>
                                );
                              }
                              return (
                                <>
                            <ScoreBar label={copy.theory} value={report.theory_score} />
                            <ScoreBar label={copy.practical} value={report.practical_score} />
                            <ScoreBar label={copy.assignments} value={report.attendance_score} />
                            {report.participation_score != null && (
                              <ScoreBar label={copy.attendance} value={report.participation_score} />
                            )}
                                </>
                              );
                            })()}
                          </div>

                          {/* Milestones + strengths */}
                          <div className="space-y-3 mobile-page-root">
                            {(report.key_strengths) && (
                              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">Key Strengths</p>
                                <p className="text-xs text-foreground leading-relaxed">{report.key_strengths}</p>
                              </div>
                            )}
                            {report.areas_for_growth && (
                              <div className="p-3 bg-amber-500/5 border border-amber-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">Areas for Growth</p>
                                <p className="text-xs text-foreground leading-relaxed">{report.areas_for_growth}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Milestones */}
                        {report.learning_milestones && report.learning_milestones.length > 0 && (
                          <div className="p-3 bg-muted border border-border">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Learning Milestones</p>
                            <ul className="space-y-1 mobile-page-root">
                              {report.learning_milestones.map((m, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                                  <span className="text-xs text-foreground">{m}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border flex-wrap">
                          <span className="text-[10px] text-muted-foreground">
                            {report.instructor_name ? `Instructor: ${report.instructor_name}` : ''}
                            {report.report_date ? `  ·  ${new Date(report.report_date).toLocaleDateString('en-GB')}` : ''}
                          </span>
                          <div className="flex items-center gap-2">
                            {/* Print */}
                            <button
                              onClick={() => window.print()}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-border hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
                            >
                              <PrinterIcon className="w-3.5 h-3.5" /> Print
                            </button>
                            {/* WhatsApp share */}
                            {selectedChild && (
                              <a
                                href={`https://wa.me/?text=${encodeURIComponent(buildReportShareText(selectedChild, report, copy))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-all"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.139.565 4.143 1.548 5.877L.057 23.43a.75.75 0 0 0 .928.928l5.554-1.49A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.45 10.45 0 0 1-5.348-1.467l-.383-.228-3.975 1.066 1.067-3.894-.25-.4A10.451 10.451 0 0 1 1.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/></svg>
                                Share
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentResultsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border" />}>
      <ParentResultsContent />
    </Suspense>
  );
}
