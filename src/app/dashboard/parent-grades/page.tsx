'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ClipboardDocumentListIcon, AcademicCapIcon } from '@/lib/icons';

interface Child { id: string; full_name: string; school_name: string | null }
interface GradeItem {
  id: string;
  type: 'assignment' | 'exam';
  title: string;
  grade: number | string | null;
  max_score: number | null;
  status: string;
  submitted_at: string | null;
  feedback: string | null;
}

function gradeColor(grade: number | string | null, max: number | null) {
  if (grade == null) return 'text-muted-foreground';
  const pct = max ? (Number(grade) / max) * 100 : Number(grade);
  if (pct >= 70) return 'text-emerald-400';
  if (pct >= 55) return 'text-amber-400';
  return 'text-rose-400';
}

function ParentGradesContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);

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
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingGrades(true);
    fetch(`/api/parents/portal?section=grades&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        setGrades((data.grades ?? []) as GradeItem[]);
        setLoadingGrades(false);
      })
      .catch(err => {
        console.error('Failed to load grades:', err);
        setLoadingGrades(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Grades</h1>
        <p className="text-sm text-muted-foreground mt-1">Assignment and exam grades for your children.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => setSelectedId(child.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-none transition-all ${
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
        <div className="bg-card border border-border rounded-none p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Grades for {selectedChild.full_name}
          </p>

          {loadingGrades && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-none p-4 animate-pulse flex justify-between">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {!loadingGrades && grades.length === 0 && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No grades yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Grades appear here once assignments and exams are marked.
              </p>
            </div>
          )}

          {!loadingGrades && grades.length > 0 && (
            <div className="space-y-3">
              {grades.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-none p-5 hover:bg-white/5 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          item.type === 'exam'
                            ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}>
                          {item.type}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          item.status === 'graded' || item.status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="font-black text-foreground text-sm truncate">{item.title}</p>
                      {item.submitted_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(item.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-black tabular-nums ${gradeColor(item.grade, item.max_score)}`}>
                        {item.grade ?? '—'}
                        {item.max_score ? <span className="text-sm text-muted-foreground font-bold">/{item.max_score}</span> : ''}
                      </p>
                    </div>
                  </div>
                  {item.feedback && (
                    <div className="mt-3 p-3 bg-muted border border-border rounded-none">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Feedback</p>
                      <p className="text-xs text-foreground leading-relaxed">{item.feedback}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentGradesPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-none" />}>
      <ParentGradesContent />
    </Suspense>
  );
}
