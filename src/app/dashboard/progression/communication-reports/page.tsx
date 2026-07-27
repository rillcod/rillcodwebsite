'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { brandAssets, companyInfo, contactInfo } from '@/config/brand';
import { ArrowLeftIcon, ShieldExclamationIcon, DocumentTextIcon, MagnifyingGlassIcon } from '@/lib/icons';

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
      toast.success('Investigation status updated');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-10 space-y-12 pb-32">
      {/* Official Letterhead (Print Only) */}
      <div className="hidden print:flex flex-col gap-6 border-b-2 border-black pb-8 mb-10">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <img src={LETTERHEAD.logoPath} alt="Logo" className="h-16 w-16 object-contain" />
            <div className="space-y-1">
              <p className="text-2xl font-black text-black tracking-tight">{LETTERHEAD.company}</p>
              <p className="text-xs text-black/60 font-bold uppercase tracking-[0.2em]">Official Safety Investigation Record</p>
              <p className="text-[10px] text-black/50 leading-tight whitespace-pre-line">{LETTERHEAD.address}</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs font-black text-black uppercase tracking-[0.2em]">Document Status: Internal Export</p>
            <p className="text-[10px] text-black/70">Generated: {new Date().toLocaleString()}</p>
            <p className="text-[10px] text-black/70">Support: {LETTERHEAD.supportEmail}</p>
          </div>
        </div>
      </div>

      {/* Hero Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3.5rem] p-10 sm:p-14 shadow-2xl print:hidden">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-violet-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        
        <Link href="/dashboard/progression/communication-safety" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Safety Monitor
        </Link>
        
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 relative z-10">
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-4">
              <ShieldExclamationIcon className="w-8 h-8 text-primary" />
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight">Investigation Desk</h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-2xl">
              Review queue for reported platform communications. Access evidence, trace 
              conversations in CRM, and manage moderation outcomes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-10 py-5 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.5rem] border border-border hover:bg-muted/30 transition-all shrink-0 bg-card shadow-2xl hover:border-primary/50"
          >
            Export Official Record
          </button>
        </div>
      </div>

      {/* Investigation List */}
      <div className="space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
             <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-48 text-center space-y-8 bg-card border-2 border-dashed border-border rounded-[4rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <DocumentTextIcon className="w-20 h-20 text-muted-foreground/20 mx-auto" />
            <div className="space-y-3 relative z-10">
              <p className="text-3xl font-black text-foreground tracking-tighter uppercase">Investigation Queue Clear</p>
              <p className="text-lg text-muted-foreground italic max-w-lg mx-auto leading-relaxed">
                No platform reports currently require administrative attention. System integrity is optimal.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {rows.map((row) => (
              <div key={row.id} className="group bg-card border border-border rounded-[3rem] p-10 sm:p-12 space-y-10 hover:border-primary/20 transition-all duration-500 shadow-2xl print:border-black print:rounded-none hover:shadow-[0_40px_100px_rgba(124,58,237,0.05)]">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="px-4 py-1.5 rounded-full bg-muted/50 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground border border-border">
                        {row.reporter_role} REPORT
                      </span>
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm ${
                        row.status === 'open' ? 'border-amber-500/20 text-amber-400 bg-amber-500/5' :
                        row.status === 'reviewing' ? 'border-blue-500/20 text-blue-400 bg-blue-500/5' :
                        'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
                      }`}>
                        {row.status}
                      </span>
                      <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">
                        {new Date(row.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h3 className="text-3xl font-black text-foreground tracking-tight leading-tight group-hover:text-primary transition-colors duration-500">{row.reason}</h3>
                  </div>
                  
                  {row.target_conversation_id && (
                    <Link 
                      href={`/dashboard/crm?search=${row.target_conversation_id}`}
                      className="inline-flex items-center gap-3 px-8 py-4 bg-primary/5 border border-primary/20 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all print:hidden shadow-sm"
                    >
                      <MagnifyingGlassIcon className="w-4 h-4" />
                      Trace Evidence in CRM
                    </Link>
                  )}
                </div>

                {row.details && (
                  <div className="p-8 bg-muted/10 border border-border/50 rounded-[2rem] shadow-inner relative overflow-hidden">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-4 opacity-50">Authorized Narrative</p>
                    <p className="text-xl text-foreground leading-relaxed italic opacity-90">"{row.details}"</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-border/50 print:hidden">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Investigation Ref: {row.id}</p>
                  <div className="flex gap-4">
                    {row.status !== 'reviewing' && (
                      <button 
                        type="button" 
                        onClick={() => updateStatus(row.id, 'reviewing')} 
                        disabled={savingId === row.id} 
                        className="px-8 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] border border-border rounded-2xl hover:bg-muted/30 disabled:opacity-50 transition-all shadow-sm"
                      >
                        Initiate Review
                      </button>
                    )}
                    {row.status !== 'closed' && (
                      <button 
                        type="button" 
                        onClick={() => updateStatus(row.id, 'closed')} 
                        disabled={savingId === row.id} 
                        className="px-8 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-600 text-white rounded-2xl hover:bg-emerald-500 disabled:opacity-50 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.2)]"
                      >
                        Finalize Case
                      </button>
                    )}
                  </div>
                </div>

                {/* Print-only details */}
                <div className="hidden print:block text-[10px] text-black/70 mt-4 border-t border-black/10 pt-4 font-mono">
                   <p>Conversation Trace ID: {row.target_conversation_id || 'N/A'}</p>
                   <p>Report Lifecycle Status: {row.status.toUpperCase()}</p>
                   <p>Evidence verified by Rillcod Trust & Safety Automation Protocol.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

