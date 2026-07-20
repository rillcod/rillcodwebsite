'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type DeskData = {
  summary: { needsAttention:number;unassigned:number;failedMessages:number;successfulMessages:number;automationProblems:number;automationHealthy:number };
  attention: Array<{ id:string;caseId:string;person:string;item:string;owner:string;reason:string;nextAction:string;dueAt:string|null;priority:string;restricted:boolean;updatedAt:string }>;
  activity: Array<{ id:string;person:string;item:string;kind:string;summary:string;channel:string;result:string;link:string|null;createdAt:string }>;
};

const resultLabel = (value: string) => ({ delivered:'Delivered',read:'Read',sent:'Sent',queued:'Waiting to send',failed:'Failed',suppressed:'Stopped by preference' }[value.toLowerCase()] || value);
const channelLabel = (value: string) => ({ email:'Email',whatsapp:'WhatsApp',in_app:'In the app',push:'Phone notification' }[value.toLowerCase()] || value);

export default function OfficeDeskPage() {
  const [data,setData]=useState<DeskData|null>(null);
  const [view,setView]=useState<'attention'|'messages'|'guide'>('attention');
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const response=await fetch('/api/admin/office-desk',{cache:'no-store'});const json=await response.json();if(!response.ok)throw new Error(json.error||'The office desk could not be loaded.');setData(json);}catch(reason){setError(reason instanceof Error?reason.message:'The office desk could not be loaded.');}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const visibleActivity=useMemo(()=>{const value=search.trim().toLowerCase();if(!value)return data?.activity||[];return (data?.activity||[]).filter(row=>`${row.person} ${row.item} ${row.kind} ${row.channel} ${row.result}`.toLowerCase().includes(value));},[data,search]);

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-xs font-black uppercase tracking-widest text-primary">Start here every day</p><h1 className="text-3xl font-black">Office Desk</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">See who needs help, what was sent, who owns each task, and whether the automatic office is working. Normal work continues without waiting for you.</p></div>
      <button onClick={()=>void load()} className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white">Refresh the desk</button>
    </header>

    {error?<p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">{error}</p>:null}
    {loading?<p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Preparing your office desk...</p>:null}

    {data?<>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={()=>setView('attention')} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-left"><p className="text-xs font-black uppercase text-amber-700">You should check</p><p className="mt-2 text-3xl font-black">{data.summary.needsAttention}</p><p className="mt-1 text-xs">Open items needing a person</p></button>
        <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-black uppercase text-muted-foreground">No staff owner yet</p><p className="mt-2 text-3xl font-black">{data.summary.unassigned}</p><p className="mt-1 text-xs text-muted-foreground">Assign these first</p></div>
        <div className={`rounded-2xl border p-5 ${data.summary.failedMessages?'border-rose-500/30 bg-rose-500/10':'border-emerald-500/30 bg-emerald-500/10'}`}><p className="text-xs font-black uppercase">Messages that failed</p><p className="mt-2 text-3xl font-black">{data.summary.failedMessages}</p><p className="mt-1 text-xs">Successful recently: {data.summary.successfulMessages}</p></div>
        <div className={`rounded-2xl border p-5 ${data.summary.automationProblems?'border-rose-500/30 bg-rose-500/10':'border-emerald-500/30 bg-emerald-500/10'}`}><p className="text-xs font-black uppercase">Automatic work problems</p><p className="mt-2 text-3xl font-black">{data.summary.automationProblems}</p><p className="mt-1 text-xs">Working normally: {data.summary.automationHealthy}</p></div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Office desk views">
        <button onClick={()=>setView('attention')} className={`rounded-xl px-4 py-2 text-sm font-black ${view==='attention'?'bg-primary text-white':'border border-border bg-card'}`}>1. Work needing attention</button>
        <button onClick={()=>setView('messages')} className={`rounded-xl px-4 py-2 text-sm font-black ${view==='messages'?'bg-primary text-white':'border border-border bg-card'}`}>2. Messages and activity</button>
        <button onClick={()=>setView('guide')} className={`rounded-xl px-4 py-2 text-sm font-black ${view==='guide'?'bg-primary text-white':'border border-border bg-card'}`}>3. Simple daily guide</button>
      </nav>

      {view==='attention'?<section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="text-lg font-black">Work needing a human</h2><p className="mt-1 text-sm text-muted-foreground">Begin at the top. Open the item, complete the next action, and record what happened.</p></div>
        {data.attention.length===0?<div className="p-10 text-center"><p className="text-xl font-black text-emerald-600">All clear</p><p className="mt-2 text-sm text-muted-foreground">The automatic office can continue working. Check again later.</p></div>:<div className="divide-y divide-border">{data.attention.map(row=><article key={row.id} className={`p-5 ${row.restricted?'bg-rose-500/5':''}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black">{row.reason}</span>{row.restricted?<span className="rounded-full bg-rose-500/10 px-2 py-1 text-[11px] font-black text-rose-600">Private: approved staff only</span>:null}</div><h3 className="mt-2 text-lg font-black">{row.person}</h3><p className="font-bold">Item: {row.item}</p><p className="mt-1 text-sm text-muted-foreground">Staff owner: {row.owner}</p><p className="mt-2 text-sm"><span className="font-black">Do next:</span> {row.nextAction}</p>{row.dueAt?<p className="mt-1 text-xs text-muted-foreground">Due: {new Date(row.dueAt).toLocaleString()}</p>:null}</div><Link href={`/dashboard/cases?id=${row.caseId}`} className="shrink-0 rounded-xl bg-primary px-4 py-3 text-center text-sm font-black text-white">Open this work</Link></div>
        </article>)}</div>}
      </section>:null}

      {view==='messages'?<section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="text-lg font-black">Messages and office activity</h2><p className="mt-1 text-sm text-muted-foreground">Search by a person’s name or the real item, such as assignment, onboarding, result, payment, or class.</p><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search a name or item" className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" /></div>
        {visibleActivity.length===0?<p className="p-10 text-center text-sm text-muted-foreground">No matching activity was found.</p>:<div className="divide-y divide-border">{visibleActivity.map(row=><article key={row.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-primary">{row.kind}</p><h3 className="mt-1 font-black">{row.person}</h3><p className="font-bold">{row.item}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{row.summary}</p></div><div className="text-right"><p className={`text-sm font-black ${row.result.toLowerCase()==='failed'?'text-rose-600':'text-emerald-600'}`}>{resultLabel(row.result)}</p><p className="text-xs text-muted-foreground">{channelLabel(row.channel)}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</p></div></div>{row.link?<Link href={row.link} className="mt-3 inline-block text-sm font-black text-primary">Open the related item</Link>:null}</article>)}</div>}
      </section>:null}

      {view==='guide'?<section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-black">Your five-minute morning check</h2><ol className="mt-4 space-y-3 text-sm"><li><b>1. Look at “You should check.”</b> If it is zero, no customer work is waiting.</li><li><b>2. Assign work with no staff owner.</b> Teachers handle teaching and class matters; the admin handles money, access, complaints, and exceptions.</li><li><b>3. Check failed messages.</b> Retry them from Message Problems if needed.</li><li><b>4. Check automatic work problems.</b> Green means leave it running. Red means open Scheduled Work and read the plain error.</li><li><b>5. Review the daily activity.</b> Search a person’s name when someone asks what happened.</li></ol></div>
        <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-black">What the system does without you</h2><ul className="mt-4 space-y-3 text-sm"><li>It sends approved reminders and service messages.</li><li>It records what was sent and whether it arrived.</li><li>It groups replies into one customer history.</li><li>It assigns ordinary work to available staff.</li><li>It raises late, failed, private, or unusual work for a person.</li><li>It respects finance controls and marketing permission.</li></ul><div className="mt-5 flex flex-wrap gap-2"><Link href="/dashboard/admin/operations-health" className="rounded-xl border border-border px-3 py-2 text-sm font-black">Scheduled Work</Link><Link href="/dashboard/admin/automation-controls" className="rounded-xl border border-border px-3 py-2 text-sm font-black">Automatic Work Settings</Link><Link href="/dashboard/admin/operations-duty" className="rounded-xl border border-border px-3 py-2 text-sm font-black">Staff on Duty</Link></div></div>
      </section>:null}
    </>:null}
  </div>;
}
