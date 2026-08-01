'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { LearningPathCard } from '@/components/progression/LearningPathCard';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';

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
  assignments_completed?: number;
  assignments_total?: number;
  assignment_completion_pct?: number;
  latest_report?: {
    overall_grade: string | null;
    overall_score: number | null;
    is_published: boolean | null;
    report_term: string | null;
    report_period: string | null;
  } | null;
  is_current_class_course?: boolean | null;
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
        const json = await fetchJsonWithTimeout(
          '/api/progression/path-view',
          { data: { paths: [] } },
          'student path progress',
        );
        setPaths((json.data?.paths ?? []) as PathItem[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [canView]);

  if (authLoading || loading) return <div className="p-6 text-sm text-muted-foreground">Loading path progress...</div>;
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Student access required.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4 mobile-page-root">
      <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-2">
            Academic Pathway
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">My Learning Path</h1>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            Your school path and week-by-week position based on teacher progression updates.
          </p>
        </div>
      </div>

      {paths.map((p) => (
        <LearningPathCard key={p.enrollment_id} path={p} showTermDetails />
      ))}

      {paths.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
          No active path found yet. Ask your teacher to link syllabus and generate progression in lesson plans.
          <div className="mt-2">
            <Link href="/dashboard/learning" className="text-cyan-700 dark:text-cyan-300 font-bold hover:underline">Open Learning Center</Link>
          </div>
        </div>
      )}
    </div>
  );
}
