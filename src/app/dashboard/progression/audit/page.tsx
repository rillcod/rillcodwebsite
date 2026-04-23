'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon } from '@/lib/icons';
import { toast } from 'sonner';

type AuditRow = {
  id: string;
  lesson_plan_id: string;
  school_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  year_number: number | null;
  term_number: number | null;
  week_number: number | null;
  action_type: string;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};

export default function ProgressionAuditPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState(searchParams.get('action_type') ?? '');
  const [lessonPlanId, setLessonPlanId] = useState(searchParams.get('lesson_plan_id') ?? '');
  const [limit, setLimit] = useState(Math.min(200, Math.max(25, Number(searchParams.get('limit') ?? 50))));

  function exportCsv() {
    const header = [
      'created_at',
      'action_type',
      'lesson_plan_id',
      'school_id',
      'actor_id',
      'actor_role',
      'year_number',
      'term_number',
      'week_number',
      'reason',
      'before_state',
      'after_state',
    ];
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = rows.map((row) => [
      row.created_at,
      row.action_type,
      row.lesson_plan_id,
      row.school_id ?? '',
      row.actor_id ?? '',
      row.actor_role ?? '',
      row.year_number ?? '',
      row.term_number ?? '',
      row.week_number ?? '',
      row.reason ?? '',
      JSON.stringify(row.before_state ?? {}),
      JSON.stringify(row.after_state ?? {}),
    ].map(escape).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progression-audit-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (actionType) params.set('action_type', actionType);
      if (lessonPlanId) params.set('lesson_plan_id', lessonPlanId);
      const res = await fetch(`/api/progression/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows((json.data ?? []) as AuditRow[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audit');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadRows();
  }, [canView, actionType, lessonPlanId, limit]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">Progression Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Transparent trail for lock overrides, week edits while locked, and term status updates.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs">
            <option value="">All actions</option>
            <option value="override_unlock">override_unlock</option>
            <option value="week_edit_while_locked">week_edit_while_locked</option>
            <option value="term_status_change">term_status_change</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Limit</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lesson Plan</label>
          <input
            value={lessonPlanId}
            onChange={(e) => setLessonPlanId(e.target.value)}
            className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs"
            placeholder="lesson_plan_id"
          />
        </div>
        <button type="button" onClick={() => void loadRows()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30">
          Export CSV
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="border border-border rounded-xl p-3 bg-background/50">
            <p className="text-sm font-bold">{row.action_type}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {new Date(row.created_at).toLocaleString()} · Plan {row.lesson_plan_id} · Actor {row.actor_role ?? 'unknown'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Y{row.year_number ?? '-'} T{row.term_number ?? '-'} W{row.week_number ?? '-'} · School {row.school_id ?? '-'}
            </p>
            {row.reason && <p className="text-xs text-foreground mt-1">{row.reason}</p>}
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-bold text-cyan-300">View state diff</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <pre className="text-[10px] bg-black/20 border border-border rounded p-2 overflow-auto">{JSON.stringify(row.before_state ?? {}, null, 2)}</pre>
                <pre className="text-[10px] bg-black/20 border border-border rounded p-2 overflow-auto">{JSON.stringify(row.after_state ?? {}, null, 2)}</pre>
              </div>
            </details>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No audit rows found.</p>}
      </div>

      <details className="bg-card border border-border rounded-2xl p-4">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
          Advanced details
        </summary>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>Database: <code>public.progression_override_audit</code></p>
          <p>API: <code>GET /api/progression/audit</code></p>
          <p>Actions: <code>override_unlock</code>, <code>week_edit_while_locked</code>, <code>term_status_change</code></p>
        </div>
      </details>
    </div>
  );
}
