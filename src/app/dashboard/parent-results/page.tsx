'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  DocumentChartBarIcon, AcademicCapIcon, ClipboardDocumentCheckIcon,
  TrophyIcon, UserIcon, HeartIcon, CheckCircleIcon, ShareIcon, PrinterIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Child { id: string; full_name: string; school_name: string | null; user_id: string | null }
interface Report {
  id: string;
  course_name: string;
  report_term: string;
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
}

function gradeColor(grade: string | null) {
  if (!grade) return 'text-muted-foreground';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'text-emerald-400';
  if (g.startsWith('B')) return 'text-blue-400';
  if (g.startsWith('C')) return 'text-amber-400';
  return 'text-rose-400';
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

function buildReportShareText(child: { full_name: string }, report: Report): string {
  const lines = [
    `📊 *Progress Report — ${child.full_name}*`,
    `📚 Course: ${report.course_name}`,
    `📅 Term: ${report.report_term}${report.report_date ? ` (${new Date(report.report_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })})` : ''}`,
    ``,
    report.theory_score != null     ? `🔬 Theory:      ${report.theory_score}%`      : null,
    report.practical_score != null  ? `🛠️ Practical:   ${report.practical_score}%`   : null,
    report.attendance_score != null ? `✅ Attendance:  ${report.attendance_score}%`  : null,
    report.overall_score != null    ? `📈 Overall:     ${report.overall_score}%`     : null,
    report.overall_grade            ? `🏆 Grade:       ${report.overall_grade}`      : null,
    ``,
    report.instructor_name ? `👨‍🏫 Instructor: ${report.instructor_name}` : null,
    ``,
    `_Shared from Rillcod Academy Portal_`,
  ].filter(Boolean).join('\n');
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

  useEffect(() => {
    if (!profile) return;
    setLoadingChildren(true);
    fetch('/api/parents/portal?section=children')
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
  }, [profile]); // eslint-disable-line

  useEffect(() => {
    if (!selectedId) return;
    setLoadingReports(true);
    fetch(`/api/parents/portal?section=results&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load report cards');
        setReports((data.reports ?? []) as Report[]);
        setLoadingReports(false);
      })
      .catch(err => {
        toast.error('Could not load progress reports for this student.');
        console.error('Failed to load reports:', err);
        setLoadingReports(false);
      });
  }, [selectedId]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);
  const avgScore = reports.length > 0
    ? Math.round(reports.reduce((s, r) => s + (r.overall_score ?? 0), 0) / reports.length)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Report Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">Published progress reports for your children.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => { setSelectedId(child.id); setExpandedId(null); }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border transition-all ${
                selectedId === child.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-orange-500/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
          <p className="text-xs text-muted-foreground mt-1">Contact admin to link your child to your account.</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
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
            <div className="space-y-4">
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

          {!loadingReports && reports.length === 0 && (
            <div className="bg-card border border-border p-8 text-center">
              <DocumentChartBarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No published reports</p>
              <p className="text-xs text-muted-foreground mt-1">Reports will appear here once published by the teacher.</p>
            </div>
          )}

          {!loadingReports && reports.length > 0 && (
            <div className="space-y-3">
              {reports.map(report => {
                const isOpen = expandedId === report.id;
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
                          {report.report_term}{report.report_date ? ` · ${new Date(report.report_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Mini score bars */}
                        <div className="hidden sm:flex items-center gap-3">
                          {[
                            { label: 'T', value: report.theory_score, title: 'Theory' },
                            { label: 'P', value: report.practical_score, title: 'Practical' },
                            { label: 'A', value: report.attendance_score, title: 'Attendance' },
                          ].map(({ label, value, title }) => (
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
                              <span className="text-[8px] font-black text-muted-foreground">{value ?? '—'}</span>
                            </div>
                          ))}
                        </div>

                        {/* Grade badge */}
                        <div className="text-center">
                          <p className={`text-2xl font-black ${gradeColor(report.overall_grade)}`}>{report.overall_grade ?? '—'}</p>
                          <p className="text-[9px] text-muted-foreground">{report.overall_score != null ? `${report.overall_score}%` : ''}</p>
                        </div>

                        <div className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-border px-6 py-5 space-y-5 bg-background/50">
                        {/* Score bars */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <ScoreBar label="Theory" value={report.theory_score} />
                            <ScoreBar label="Practical" value={report.practical_score} />
                            <ScoreBar label="Attendance" value={report.attendance_score} />
                            {report.participation_score != null && (
                              <ScoreBar label="Participation" value={report.participation_score} />
                            )}
                          </div>

                          {/* Milestones + strengths */}
                          <div className="space-y-3">
                            {(report.key_strengths) && (
                              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">Key Strengths</p>
                                <p className="text-xs text-foreground leading-relaxed">{report.key_strengths}</p>
                              </div>
                            )}
                            {report.areas_for_growth && (
                              <div className="p-3 bg-amber-500/5 border border-amber-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1">Areas for Growth</p>
                                <p className="text-xs text-foreground leading-relaxed">{report.areas_for_growth}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Milestones */}
                        {report.learning_milestones && report.learning_milestones.length > 0 && (
                          <div className="p-3 bg-muted border border-border">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Learning Milestones</p>
                            <ul className="space-y-1">
                              {report.learning_milestones.map((m, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
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
                                href={`https://wa.me/?text=${encodeURIComponent(buildReportShareText(selectedChild, report))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-all"
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
