'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { brandAssets, companyInfo, contactInfo } from '@/config/brand';

type ReportRow = {
  id: string;
  reporter_role: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'closed';
  created_at: string;
  target_conversation_id: string | null;
};

const LETTERHEAD = {
  company: companyInfo.name,
  address: contactInfo.address,
  supportEmail: contactInfo.email,
  supportPhone: contactInfo.phone,
  logoPath: brandAssets.logo,
};

export default function CommunicationReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/progression/communication-reports');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reports');
      setRows((json.data ?? []) as ReportRow[]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function updateStatus(id: string, status: ReportRow['status']) {
    setSavingId(id);
    try {
      const res = await fetch('/api/progression/communication-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success('Report status updated');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="hidden print:flex items-start justify-between gap-4 border-b border-black pb-3">
        <div className="flex items-start gap-3">
          <img src={LETTERHEAD.logoPath} alt="Rillcod Academy logo" className="h-10 w-10 object-contain" />
          <div>
            <p className="text-lg font-black text-black">{LETTERHEAD.company}</p>
            <p className="text-xs text-black/70">{LETTERHEAD.address}</p>
            <p className="text-xs text-black/70">Support: {LETTERHEAD.supportEmail} · {LETTERHEAD.supportPhone}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-black">Communication Reports Queue</p>
          <p className="text-xs text-black/70">{new Date().toLocaleString()}</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">Communication Reports Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Review reported conversations and track moderation progress.</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Link href="/dashboard/progression/settings" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">Back to LMS Settings</Link>
          <Link href="/dashboard/progression/communication-safety" className="px-3 py-2 text-xs font-bold rounded-lg border border-primary/30 text-violet-300 hover:bg-primary/10">Open safety monitor</Link>
          <Link href="/dashboard/crm" className="px-3 py-2 text-xs font-bold rounded-lg border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10">Open CRM</Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30 print:hidden"
          >
            Print with company header
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 bg-background/50 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{row.reporter_role} report</p>
                <span className="text-[11px] font-bold text-violet-300">{row.status}</span>
              </div>
              <p className="text-sm text-foreground">{row.reason}</p>
              {row.details && <p className="text-xs text-muted-foreground">{row.details}</p>}
              <p className="text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              {row.target_conversation_id && (
                <p className="text-[11px] text-cyan-300">
                  CRM trace: <Link href="/dashboard/crm" className="underline">Open CRM</Link> and search conversation `{row.target_conversation_id}`
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => updateStatus(row.id, 'reviewing')} disabled={savingId === row.id} className="px-3 py-1.5 text-xs font-bold border border-border rounded-lg hover:bg-muted/30 disabled:opacity-50">Mark reviewing</button>
                <button type="button" onClick={() => updateStatus(row.id, 'closed')} disabled={savingId === row.id} className="px-3 py-1.5 text-xs font-bold border border-emerald-500/30 text-emerald-300 rounded-lg hover:bg-emerald-500/10 disabled:opacity-50">Close</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
