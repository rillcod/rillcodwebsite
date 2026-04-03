'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DocumentChartBarIcon, AcademicCapIcon, CheckCircleIcon } from '@/lib/icons';

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
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
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
        setReports((data.reports ?? []) as Report[]);
        setLoadingReports(false);
      })
      .catch(err => {
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
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border p-5 animate-pulse h-28" />
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
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                          <span>{report.instructor_name ? `Instructor: ${report.instructor_name}` : ''}</span>
                          <span>{report.report_date ? new Date(report.report_date).toLocaleDateString('en-GB') : ''}</span>
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
