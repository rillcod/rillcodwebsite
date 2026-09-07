'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTimeoutOrThrow } from '@/lib/async-timeout';
import type { EvidenceReviewItem } from '@/lib/academic/evidence-review';

export default function AcademicEvidenceReview({ classId }: { classId: string }) {
  const [data, setData] = useState<{ items: EvidenceReviewItem[]; truncated: boolean } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    const params = new URLSearchParams({ review: 'evidence' });
    if (classId) params.set('class_id', classId);
    void (async () => {
      try {
        const response = await fetchWithTimeoutOrThrow(`/api/academic-spine?${params}`, { cache: 'no-store' }, 'Assessment review is taking longer than expected. Please retry.', 25_000);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Assessment review could not be loaded.');
        if (!cancelled) setData(payload.data);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Assessment review could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [classId, attempt]);
  return <section id="assessment-review" className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 className="text-base font-bold">Review assessment links</h2>
    <p className="mt-1 text-sm text-muted-foreground">Check the original assessment and how its marks are used. Confirmed marks can still be used while other records are reviewed.</p>
    {error ? <div role="alert" className="mt-3 space-y-2"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-xl border border-border px-4">Retry assessment review</button></div>
      : !data ? <p role="status" className="mt-3 text-sm">Checking assessment links…</p>
      : <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto">
        {data.items.length === 0 && <p className="text-sm">No incomplete assessment links were found in this scope.</p>}
        {data.items.map(item => <article key={item.id} className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          {item.href && <Link prefetch={false} href={item.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary">Review assessment</Link>}
        </article>)}
        {data.truncated && <p className="text-sm text-muted-foreground">Showing the first 50 records from each group. Select a class above to narrow the review.</p>}
      </div>}
  </section>;
}
