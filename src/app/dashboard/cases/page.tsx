'use client';

import { useEffect, useMemo, useState } from 'react';

type CaseRow = { id:string; subject:string; category:string; status:string; priority:string; requester_name?:string|null; assigned_to?:string|null; channels:string[]; first_response_due_at?:string|null; updated_at:string; events?:CaseEvent[] };
type CaseEvent = { id:string; channel:string; direction:string; subject?:string|null; body:string; created_at:string };

export default function CommunicationCasesPage() {
  const [rows,setRows]=useState<CaseRow[]>([]);
  const [role,setRole]=useState('');
  const [selected,setSelected]=useState<CaseRow|null>(null);
  const [canManage,setCanManage]=useState(false);
  const [filter,setFilter]=useState('active');
  const [error,setError]=useState('');

  async function load() {
    const response=await fetch('/api/communication-cases',{cache:'no-store'}); const json=await response.json();
    if(!response.ok){setError(json.error||'Unable to load cases.');return;} setRows(json.data||[]);setRole(json.role||'');
  }
  useEffect(()=>{void load();const id=new URLSearchParams(window.location.search).get('id');if(id)void openCase(id);},[]);
  async function openCase(id:string){const response=await fetch(`/api/communication-cases?id=${id}`,{cache:'no-store'});const json=await response.json();if(!response.ok){setError(json.error);return;}setSelected(json.data);setCanManage(Boolean(json.canManage));}
  async function update(status:string){if(!selected)return;const response=await fetch('/api/communication-cases',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,status})});const json=await response.json();if(!response.ok){setError(json.error);return;}setSelected({...selected,...json.data});await load();}

  const visible=useMemo(()=>rows.filter(row=>filter==='all'||(filter==='active'?['open','in_progress','pending_customer'].includes(row.status):row.status===filter)),[rows,filter]);
  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
    <div><p className="text-xs font-black uppercase tracking-[.25em] text-primary">One office history</p><h1 className="mt-2 text-3xl font-black">Communication cases</h1><p className="mt-2 text-sm text-muted-foreground">WhatsApp, email, in-app messages, and feedback remain together under one owner and status.</p></div>
    {error?<p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>:null}
    <div className="flex flex-wrap gap-2">{['active','open','in_progress','pending_customer','resolved','closed','all'].map(value=><button key={value} onClick={()=>setFilter(value)} className={`rounded-full px-3 py-2 text-xs font-black uppercase ${filter===value?'bg-primary text-white':'bg-muted'}`}>{value.replace('_',' ')}</button>)}</div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-3">{visible.map(row=><button key={row.id} onClick={()=>void openCase(row.id)} className="block w-full rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/50"><div className="flex justify-between gap-3"><div><p className="text-[11px] font-black uppercase text-muted-foreground">CASE-{row.id.slice(0,8)} ? {(row.channels||[]).join(' + ')}</p><h2 className="mt-2 font-black">{row.subject}</h2><p className="mt-2 text-xs text-muted-foreground">{role==='admin'?(row.requester_name||'Customer'):'Updated'} ? {new Date(row.updated_at).toLocaleString()}</p></div><span className="h-fit rounded-full bg-muted px-3 py-1 text-xs font-black uppercase">{row.status.replace('_',' ')}</span></div></button>)}{visible.length===0?<p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No cases in this view.</p>:null}</div>
      <div className="rounded-2xl border border-border bg-card p-5">{selected?<><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-primary">CASE-{selected.id.slice(0,8)}</p><h2 className="mt-2 text-2xl font-black">{selected.subject}</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase">{selected.priority}</span></div>{canManage?<div className="mt-4 flex flex-wrap gap-2">{['in_progress','pending_customer','resolved','closed'].map(status=><button key={status} onClick={()=>void update(status)} className="rounded-lg border border-border px-3 py-2 text-xs font-black uppercase">{status.replace('_',' ')}</button>)}</div>:null}<div className="mt-6 space-y-4">{(selected.events||[]).map(event=><div key={event.id} className="rounded-xl bg-muted/50 p-4"><p className="text-[11px] font-black uppercase text-muted-foreground">{event.channel} ? {event.direction} ? {new Date(event.created_at).toLocaleString()}</p>{event.subject?<p className="mt-2 font-bold">{event.subject}</p>:null}<p className="mt-2 whitespace-pre-wrap text-sm">{event.body}</p></div>)}</div></>:<p className="text-sm text-muted-foreground">Select a case to see its complete history.</p>}</div>
    </div>
  </div>;
}
