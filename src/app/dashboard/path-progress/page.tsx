'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';

type PathItem = {
  enrollment_id: string;
  course_title: string;
  program_name: string;
  enrollment_status: string;
  term_label: string;
  current_term: number;
  current_week: number;
  completed_weeks: number;
  total_weeks: number;
  completion_pct: number;
  last_topic: string | null;
  status_summary: string;
  term_statuses: Array<{ key: string; status: string }>;
  visibility_mode?: 'full' | 'milestone';
  can_view_full?: boolean;
};

export default function StudentPathProgressPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = profile?.role === 'student';
  const [loading, setLoading] = useState(true);
  const [paths, setPaths] = useState<PathItem[]>([]);

  useEffect(() => {
    if (!canView) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/progression/path-view');
        const json = await res.json();
        if (res.ok) setPaths((json.data?.paths ?? []) as PathItem[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [canView]);

  if (authLoading || loading) return <div className="p-6 text-sm text-muted-foreground">Loading path progress...</div>;
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Student access required.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">My Learning Path</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your school path and week-by-week position based on teacher progression updates.
        </p>
      </div>

      {paths.map((p) => (
        <div key={p.enrollment_id} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black">{p.course_title}</p>
              <p className="text-xs text-muted-foreground">{p.program_name} · {p.term_label}</p>
              <p className="text-xs text-muted-foreground mt-1">{p.status_summary}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-cyan-300 uppercase tracking-widest">
                {p.visibility_mode === 'milestone' ? 'Milestone view' : 'Full view'}
              </p>
              <p className="text-xs font-bold text-violet-300">Term {p.current_term} · Week {p.current_week}</p>
              <p className="text-xs text-muted-foreground">{p.completed_weeks}/{p.total_weeks} weeks completed</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.max(2, p.completion_pct)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Last taught topic: <span className="text-foreground">{p.last_topic ?? 'No topic recorded yet'}</span>
          </p>
          {p.can_view_full && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-bold text-cyan-300">Term status details</summary>
              <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                {p.term_statuses.map((s) => (
                  <li key={s.key}>{s.key}: <span className="text-foreground">{s.status}</span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      {paths.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          No active path found yet. Ask your teacher to link syllabus and generate progression in lesson plans.
          <div className="mt-2">
            <Link href="/dashboard/learning" className="text-cyan-300 font-bold hover:underline">Open Learning Center</Link>
          </div>
        </div>
      )}
    </div>
  );
}
