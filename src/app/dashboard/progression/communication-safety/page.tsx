'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

type SafetyData = {
  abuse_events_24h: number;
  open_reports: number;
  open_escalations: number;
  top_abuse_reasons_7d: Array<{ label: string; count: number }>;
};

export default function CommunicationSafetyPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SafetyData | null>(null);

  useEffect(() => {
    fetch('/api/progression/communication-safety')
      .then((r) => r.json())
      .then((j) => setData((j.data ?? null) as SafetyData | null))
      .catch(() => toast.error('Failed to load communication safety metrics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading communication safety metrics...</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">No communication safety data available.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">Communication Safety Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">See abuse blocks, open reports, escalations, and recurring risk reasons.</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Link href="/dashboard/progression/settings" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">Back to LMS Settings</Link>
          <Link href="/dashboard/progression/communication-reports" className="px-3 py-2 text-xs font-bold rounded-lg border border-primary/30 text-violet-300 hover:bg-primary/10">Open reports queue</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Abuse blocks (24h)</p><p className="text-2xl font-black">{data.abuse_events_24h}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Open reports</p><p className="text-2xl font-black">{data.open_reports}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Open escalations</p><p className="text-2xl font-black">{data.open_escalations}</p></div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-black">Top abuse reasons (last 7 days)</h2>
        {data.top_abuse_reasons_7d.length === 0 ? (
          <p className="text-xs text-muted-foreground">No abuse events logged in the last 7 days.</p>
        ) : (
          data.top_abuse_reasons_7d.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border p-2 bg-background/50">
              <p className="text-xs text-foreground">{item.label}</p>
              <p className="text-xs font-black text-violet-300">{item.count}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
