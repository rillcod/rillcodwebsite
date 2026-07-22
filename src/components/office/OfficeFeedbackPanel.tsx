'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';
import { OfficeFeedbackDetailPanel } from './OfficeFeedbackDetailPanel';

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

type Props = { embedded?: boolean; mode?: 'admin' | 'teacher' };

export function OfficeFeedbackPanel({ embedded = false, mode = 'admin' }: Props) {
  const office = useOfficeOptional();
  const feedbackId = office?.feedbackId ?? null;
  const revision = office?.revision ?? 0;
  const isTeacherQueue = mode === 'teacher';
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (feedbackId) return;
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
    return () => {
      active = false;
    };
  }, [feedbackId, revision]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (status === 'all') return true;
        if (status === 'active') return row.status === 'new' || row.status === 'in_progress';
        return row.status === status;
      }),
    [rows, status],
  );

  const activeCount = rows.filter((row) => row.status === 'new' || row.status === 'in_progress').length;

  if (feedbackId) {
    return <OfficeFeedbackDetailPanel feedbackId={feedbackId} />;
  }

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl space-y-6 p-4 md:p-8'}>
      {!embedded ? (
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">
            {isTeacherQueue ? 'Current duty' : 'Customer care'}
          </p>
          <h1 className="mt-2 text-3xl font-black text-foreground">
            {isTeacherQueue ? 'My assigned service work' : 'Feedback work queue'}
          </h1>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Answer feedback here. Responses update the linked Help Request case and refresh Desk counts.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Active</p>
          <p className="mt-2 text-3xl font-black">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Resolved</p>
          <p className="mt-2 text-3xl font-black">{rows.filter((row) => row.status === 'resolved').length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Total</p>
          <p className="mt-2 text-3xl font-black">{rows.length}</p>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {['active', 'new', 'in_progress', 'resolved', 'closed', 'all'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`min-h-11 shrink-0 touch-manipulation rounded-full px-4 py-2 text-xs font-black uppercase ${
              status === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {value.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading feedback...</p> : null}
      {error ? <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No feedback in this queue.
        </p>
      ) : null}

      <div className="space-y-3">
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              if (office) office.openFeedback(row.id);
              else window.location.assign(`/dashboard/feedback/${row.id}`);
            }}
            className="block w-full touch-manipulation rounded-2xl border border-border bg-card p-5 text-left shadow-sm active:border-primary/50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  <span>FB-{row.id.slice(0, 8)}</span>
                  <span>{row.type}</span>
                  {row.rating ? <span>{row.rating}/5</span> : null}
                </div>
                <h2 className="mt-2 font-black text-foreground">{row.subject}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.message}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {row.user_name} - {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase text-muted-foreground">
                {row.status.replace('_', ' ')}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
