'use client';

import { useEffect, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';

type Metrics = {
  casesOpened: number;
  casesResolved: number;
  activeCases: number;
  unassignedCases: number;
  slaPercent: number;
  averageResolutionHours: number;
  deliverySuccessPercent: number;
  deliveryFailures: number;
  satisfactionAverage: number | null;
  satisfactionResponses: number;
  helpfulOutcomes: number;
  restrictedOpen: number;
  marketing: { sent: number; viewed: number; converted: number; suppressed: number };
};

type Props = { embedded?: boolean };

export function OperationsPerformancePanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const revision = office?.revision ?? 0;
  const lastChange = office?.lastChange;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [channels, setChannels] = useState<Array<[string, number]>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (lastChange && !['cases', 'feedback', 'health', 'settings', 'desk', 'newsletters'].includes(lastChange)) return;
    let active = true;
    fetch('/api/admin/operations-performance', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!active) return;
        setMetrics(json.metrics);
        setChannels(json.channelBreakdown || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [revision, lastChange]);

  const cards = metrics
    ? [
        ['Cases opened', metrics.casesOpened],
        ['Cases resolved', metrics.casesResolved],
        ['Active cases', metrics.activeCases],
        ['Unassigned active', metrics.unassignedCases],
        ['First-response SLA', `${metrics.slaPercent}%`],
        ['Average resolution', `${metrics.averageResolutionHours}h`],
        ['Delivery success', `${metrics.deliverySuccessPercent}%`],
        ['Delivery failures', metrics.deliveryFailures],
        ['Customer satisfaction', metrics.satisfactionAverage ? `${metrics.satisfactionAverage}/5` : 'Waiting'],
        ['Outcome responses', metrics.satisfactionResponses],
        ['Helpful outcomes', metrics.helpfulOutcomes],
        ['Restricted incidents open', metrics.restrictedOpen],
      ]
    : [];

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Administration</p>
          <h1 className="text-2xl font-black">Office performance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thirty-day proof of speed, delivery, safety, marketing restraint, and customer value.
          </p>
        </header>
      ) : (
        <p className="text-sm text-muted-foreground">
          Delivery success counts provider-accepted sends plus delivered/read when status webhooks are connected.
        </p>
      )}
      {error ? <p className="rounded-xl bg-rose-500/10 p-4 text-rose-600 dark:text-rose-400">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>
      {metrics ? (
        <>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-black">Marketing accountability</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(metrics.marketing).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-muted p-4">
                  <p className="text-xs font-bold uppercase">{key}</p>
                  <p className="mt-1 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-black">Channel volume</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {channels.map(([channel, count]) => (
                <span key={channel} className="rounded-full bg-muted px-3 py-2 text-sm font-bold">
                  {channel}: {count}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading performance...</p>
      )}
    </div>
  );
}
