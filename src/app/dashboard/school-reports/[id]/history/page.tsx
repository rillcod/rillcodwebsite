'use client';

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import { ReportCollaborationPanel } from '@/components/school-reports/ReportCollaborationPanel';

type RevisionRow = {
  id: string;
  revisionNumber: number;
  status: string;
  publishedAt: string | null;
  changeReason: string | null;
  pdfHash: string | null;
  forcePublishOverride: { reason: string; missing: string[] } | null;
  createdAt: string;
};

type EventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  revision_id: string | null;
};

export default function SchoolReportHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [publishedRevisionNumber, setPublishedRevisionNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/school-performance-reports/${id}/revisions`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Unable to load revision history.');
        if (!cancelled) {
          setRevisions(json.data?.revisions ?? []);
          setEvents(json.data?.events ?? []);
          setPublishedRevisionNumber(json.data?.publishedRevisionNumber ?? null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Revision history</p>
          <h1 className="mt-2 text-2xl font-black">Report book timeline</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Immutable published revisions, unlock events, and admin overrides.
          </p>
        </div>
        <Link
          href={`/dashboard/school-reports/${id}`}
          className="rounded-xl border border-border px-4 py-2 text-sm font-black"
        >
          Back to editor
        </Link>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading history…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-black">Revisions</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3">#</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Published</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">PDF hash</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="p-3 font-black">
                        {row.revisionNumber}
                        {publishedRevisionNumber === row.revisionNumber ? ' · live' : ''}
                      </td>
                      <td className="p-3 capitalize">{row.status}</td>
                      <td className="p-3 text-muted-foreground">
                        {row.publishedAt ? new Date(row.publishedAt).toLocaleString() : '—'}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {row.forcePublishOverride ? (
                          <span className="text-amber-700">
                            Override: {row.forcePublishOverride.reason}
                          </span>
                        ) : (
                          row.changeReason || '—'
                        )}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-muted-foreground">
                        {row.pdfHash ? `${row.pdfHash.slice(0, 12)}…` : '—'}
                      </td>
                    </tr>
                  ))}
                  {!revisions.length ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No revisions recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <ReportCollaborationPanel reportId={id} />

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-black">Audit events</h2>
            <ul className="mt-4 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black capitalize">{event.event_type.replaceAll('_', ' ')}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {Object.keys(event.payload || {}).length ? (
                    <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
              {!events.length ? (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No audit events yet.
                </li>
              ) : null}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
