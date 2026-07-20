'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface FeedbackRow {
  id: string;
  user_name: string;
  type: string;
  rating: number | null;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

export default function AdminFeedbackQueue({ mode = 'admin' }: { mode?: 'admin' | 'teacher' }) {
  const isTeacherQueue = mode === 'teacher';
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/feedback', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to load feedback.');
        if (active) setRows(json.data || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load feedback.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => rows.filter((row) => {
    if (status === 'all') return true;
    if (status === 'active') return row.status === 'new' || row.status === 'in_progress';
    return row.status === status;
  }), [rows, status]);

  const activeCount = rows.filter((row) => row.status === 'new' || row.status === 'in_progress').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">{isTeacherQueue ? 'Current duty' : 'Customer care'}</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">{isTeacherQueue ? 'My assigned service work' : 'Feedback work queue'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{isTeacherQueue ? 'These cases are assigned only to you. Answer or close them before taking more work.' : 'Supervise all customer feedback, assignments, responses, and exceptions.'}</p>
        </div>
        {!isTeacherQueue ? <Link href="/dashboard/admin/operations-duty" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Manage staff duty</Link> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-bold uppercase text-muted-foreground">Active</p><p className="mt-2 text-3xl font-black">{activeCount}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-bold uppercase text-muted-foreground">Resolved</p><p className="mt-2 text-3xl font-black">{rows.filter((row) => row.status === 'resolved').length}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-bold uppercase text-muted-foreground">Total</p><p className="mt-2 text-3xl font-black">{rows.length}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['active', 'new', 'in_progress', 'resolved', 'closed', 'all'].map((value) => (
          <button key={value} onClick={() => setStatus(value)} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${status === value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
            {value.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading feedback...</p> : null}
      {error ? <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No feedback in this queue.</p> : null}

      <div className="space-y-3">
        {visible.map((row) => (
          <Link key={row.id} href={`/dashboard/feedback/${row.id}`} className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  <span>FB-{row.id.slice(0, 8)}</span><span>{row.type}</span>{row.rating ? <span>{row.rating}/5</span> : null}
                </div>
                <h2 className="mt-2 font-black text-foreground">{row.subject}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.message}</p>
                <p className="mt-3 text-xs text-muted-foreground">{row.user_name} - {new Date(row.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase text-muted-foreground">{row.status.replace('_', ' ')}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
