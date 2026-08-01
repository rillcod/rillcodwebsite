'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { LearningPathCard } from '@/components/progression/LearningPathCard';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';

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
  assignments_completed?: number;
  assignments_total?: number;
  latest_report?: {
    overall_grade: string | null;
    is_published: boolean | null;
  } | null;
  is_current_class_course?: boolean | null;
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
      const json = await fetchJsonWithTimeout(
        `/api/progression/path-view${qs}`,
        { data: { children: [], paths: [] } },
        'parent path progress',
      );
      const c = (json.data?.children ?? []) as ChildOption[];
      setChildren(c);
      if (!childId && c.length > 0) {
        setSelectedChildId(c[0].id);
        const j2 = await fetchJsonWithTimeout(
          `/api/progression/path-view?child_id=${encodeURIComponent(c[0].id)}`,
          { data: { paths: [] } },
          'parent selected child path progress',
        );
        setPaths((j2.data?.paths ?? []) as PathItem[]);
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
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4 mobile-page-root">
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
        <LearningPathCard key={p.enrollment_id} path={p} />
      ))}

      {paths.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          No active path found for this child yet.
        </div>
      )}
    </div>
  );
}
