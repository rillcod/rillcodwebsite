'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';

type ChildOption = { id: string; full_name: string; user_id: string | null };
type PathItem = {
  enrollment_id: string;
  student_id: string;
  course_title: string;
  program_name: string;
  term_label: string;
  current_term: number;
  current_week: number;
  completion_pct: number;
  last_topic: string | null;
  enrollment_status: string;
  status_summary: string;
  visibility_mode?: 'full' | 'milestone';
};

export default function ParentPathProgressPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = profile?.role === 'parent';
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [paths, setPaths] = useState<PathItem[]>([]);

  async function load(childId?: string) {
    setLoading(true);
    try {
      const qs = childId ? `?child_id=${encodeURIComponent(childId)}` : '';
      const res = await fetch(`/api/progression/path-view${qs}`);
      const json = await res.json();
      if (!res.ok) return;
      const c = (json.data?.children ?? []) as ChildOption[];
      setChildren(c);
      if (!childId && c.length > 0) {
        setSelectedChildId(c[0].id);
        const r2 = await fetch(`/api/progression/path-view?child_id=${encodeURIComponent(c[0].id)}`);
        const j2 = await r2.json();
        if (r2.ok) setPaths((j2.data?.paths ?? []) as PathItem[]);
      } else {
        setPaths((json.data?.paths ?? []) as PathItem[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView]);

  if (authLoading || loading) return <div className="p-6 text-sm text-muted-foreground">Loading child path progress...</div>;
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Parent access required.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">Child Learning Path</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Same path visibility as student view, updated as teachers progress lessons week by week.
        </p>
        {children.length > 0 && (
          <div className="mt-3">
            <select
              value={selectedChildId}
              onChange={(e) => {
                setSelectedChildId(e.target.value);
                void load(e.target.value);
              }}
              className="px-3 py-2 bg-background border border-border rounded-xl text-sm"
            >
              {children.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
        )}
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
              <p className="text-xs text-muted-foreground">Status: {p.enrollment_status}</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.max(2, p.completion_pct)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Last taught topic: <span className="text-foreground">{p.last_topic ?? 'No topic recorded yet'}</span>
          </p>
        </div>
      ))}

      {paths.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          No active path found for this child yet.
        </div>
      )}
    </div>
  );
}
