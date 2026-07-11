'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ArrowLeftIcon, ArrowPathIcon, ArrowsRightLeftIcon, CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, UserGroupIcon } from '@/lib/icons';

type ClassRow = { id: string; name: string; teacher_id?: string | null; current_students?: number; portal_users?: { full_name?: string } | null; schools?: { name?: string } | null };
type Candidate = { id: string; full_name: string; email?: string; current_class_name?: string; current_teacher_name?: string; requires_transfer_request?: boolean; pending_transfer_request_id?: string | null };

type TransferRequest = {
  id: string; status: string; reason: string; from_teacher_id: string; requested_by: string;
  student?: { full_name?: string } | null; from_class?: { name?: string } | null; to_class?: { name?: string } | null;
  from_teacher?: { full_name?: string } | null; requester?: { full_name?: string } | null;
};

export default function TransferRequestCenterPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'request' | 'review'>('request');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [destinationId, setDestinationId] = useState(searchParams.get('class') ?? '');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedIncoming, setSelectedIncoming] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadRequests = async () => {
    const res = await fetch('/api/student-transfer-requests', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load transfer requests');
    setRequests(json.requests ?? []);
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    (async () => {
      setLoading(true);
      try {
        const [classRes] = await Promise.all([fetch('/api/classes?mine=true', { cache: 'no-store' }), loadRequests()]);
        const classJson = await classRes.json();
        if (!classRes.ok) throw new Error(classJson.error || 'Failed to load classes');
        setClasses(classJson.data ?? []);
      } catch (error: any) { setMessage({ ok: false, text: error.message }); }
      finally { setLoading(false); }
    })();
  }, [profile?.id, authLoading]);

  useEffect(() => {
    setCandidates([]); setSelected(new Set());
    if (!destinationId) return;
    (async () => {
      try {
        const res = await fetch(`/api/classes/${destinationId}/enroll`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load students');
        setCandidates((json.students ?? []).filter((student: Candidate) => student.requires_transfer_request));
      } catch (error: any) { setMessage({ ok: false, text: error.message }); }
    })();
  }, [destinationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter(student => !q || [student.full_name, student.email, student.current_class_name, student.current_teacher_name].some(value => (value ?? '').toLowerCase().includes(q)));
  }, [candidates, search]);
  const requestable = filtered.filter(student => !student.pending_transfer_request_id);
  const allVisibleSelected = requestable.length > 0 && requestable.every(student => selected.has(student.id));
  const incoming = requests.filter(request => request.status === 'pending' && (profile?.role === 'admin' || request.from_teacher_id === profile?.id));
  const outgoing = requests.filter(request => request.status === 'pending' && request.requested_by === profile?.id);
  const allIncomingSelected = incoming.length > 0 && incoming.every(request => selectedIncoming.has(request.id));

  const toggle = (set: Set<string>, update: (next: Set<string>) => void, id: string) => {
    const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); update(next);
  };

  const sendSelected = async () => {
    if (!destinationId || selected.size === 0 || reason.trim().length < 10) return;
    const rows = candidates.filter(student => selected.has(student.id) && !student.pending_transfer_request_id);
    setBusy(true); setMessage(null); const failures: string[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const student = rows[index]; setProgress({ done: index, total: rows.length, label: `Requesting ${student.full_name}` });
      try {
        const res = await fetch('/api/student-transfer-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: student.id, to_class_id: destinationId, reason: reason.trim() }) });
        const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Request failed');
      } catch (error: any) { failures.push(`${student.full_name}: ${error.message}`); }
    }
    setProgress({ done: rows.length, total: rows.length, label: 'Requests complete' });
    await loadRequests();
    const res = await fetch(`/api/classes/${destinationId}/enroll`, { cache: 'no-store' });
    const json = await res.json(); if (res.ok) setCandidates((json.students ?? []).filter((student: Candidate) => student.requires_transfer_request));
    setSelected(new Set()); setReason(''); setBusy(false); setProgress(null);
    setMessage(failures.length ? { ok: false, text: `${rows.length - failures.length} sent; ${failures.length} failed. ${failures.join(' | ')}` } : { ok: true, text: `${rows.length} transfer request${rows.length === 1 ? '' : 's'} sent.` });
  };

  const decideSelected = async (decision: 'approve' | 'decline') => {
    const rows = incoming.filter(request => selectedIncoming.has(request.id));
    if (!rows.length) return;
    if (decision === 'approve' && !confirm(`Approve and move ${rows.length} selected student${rows.length === 1 ? '' : 's'}?`)) return;
    setBusy(true); setMessage(null); const failures: string[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const request = rows[index]; setProgress({ done: index, total: rows.length, label: `${decision === 'approve' ? 'Moving' : 'Declining'} ${request.student?.full_name ?? 'student'}` });
      try {
        const res = await fetch('/api/student-transfer-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: request.id, decision }) });
        const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Decision failed');
      } catch (error: any) { failures.push(`${request.student?.full_name ?? 'Student'}: ${error.message}`); }
    }
    await loadRequests(); setSelectedIncoming(new Set()); setBusy(false); setProgress(null);
    setMessage(failures.length ? { ok: false, text: `${rows.length - failures.length} completed; ${failures.length} failed. ${failures.join(' | ')}` } : { ok: true, text: `${rows.length} request${rows.length === 1 ? '' : 's'} ${decision === 'approve' ? 'approved and moved' : 'declined'}.` });
  };

  if (authLoading || loading) return <div className="flex min-h-[60vh] items-center justify-center"><ArrowPathIcon className="h-8 w-8 animate-spin text-primary" /></div>;

  return <div className="mx-auto max-w-6xl space-y-6 pb-24">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary"><ArrowsRightLeftIcon className="h-4 w-4" /> Class management</div><h1 className="text-3xl font-black text-foreground">Student Transfer Center</h1><p className="mt-1 text-sm text-muted-foreground">Request students from another teacher or quickly review requests sent to you.</p></div>
      <Link href="/dashboard/classes" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground"><ArrowLeftIcon className="h-4 w-4" /> Back to Classes</Link>
    </div>
    {message && <div className={`flex gap-2 rounded-xl border p-4 text-sm ${message.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-400'}`}>{message.ok ? <CheckCircleIcon className="h-5 w-5 shrink-0" /> : <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />}<span>{message.text}</span></div>}
    {progress && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex justify-between text-xs font-bold text-foreground"><span>{progress.label}</span><span>{progress.done}/{progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div></div>}
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-2">
      <button onClick={() => setTab('request')} className={`rounded-xl px-4 py-3 text-sm font-black ${tab === 'request' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Request students <span className="ml-1 opacity-70">({outgoing.length})</span></button>
      <button onClick={() => setTab('review')} className={`rounded-xl px-4 py-3 text-sm font-black ${tab === 'review' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Review incoming <span className="ml-1 opacity-70">({incoming.length})</span></button>
    </div>
    {tab === 'request' ? <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5"><label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Destination class you own</label><select value={destinationId} onChange={event => setDestinationId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground"><option value="">Choose destination class...</option>{classes.map(row => <option key={row.id} value={row.id}>{row.name} - {row.schools?.name ?? 'School'} ({row.current_students ?? 0} students)</option>)}</select></div>
      {destinationId && <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-sm font-black text-foreground"><UserGroupIcon className="h-4 w-4 text-primary" /> Students owned by another teacher ({candidates.length})</div><div className="relative flex-1 sm:ml-auto sm:max-w-sm"><MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student, class, or teacher..." className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground" /></div><button onClick={() => { const next = new Set(selected); if (allVisibleSelected) requestable.forEach(row => next.delete(row.id)); else requestable.forEach(row => next.add(row.id)); setSelected(next); }} className="rounded-xl border border-primary/30 px-3 py-2 text-xs font-black text-primary">{allVisibleSelected ? 'Clear visible' : `Select visible (${requestable.length})`}</button></div>
        <div className="max-h-[48vh] divide-y divide-border overflow-y-auto">{filtered.length ? filtered.map(student => { const checked = selected.has(student.id); return <button key={student.id} disabled={!!student.pending_transfer_request_id} onClick={() => toggle(selected, setSelected, student.id)} className={`flex w-full items-center gap-3 p-4 text-left ${checked ? 'bg-primary/10' : 'hover:bg-muted/40'} disabled:opacity-60`}><span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary bg-primary' : 'border-border'}`}>{checked && <CheckCircleIcon className="h-4 w-4 text-white" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{student.full_name}</span><span className="block truncate text-xs text-muted-foreground">{student.current_class_name} - {student.current_teacher_name}</span></span>{student.pending_transfer_request_id && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-400">Pending</span>}</button>; }) : <div className="p-12 text-center text-sm text-muted-foreground">No students requiring an ownership request.</div>}</div>
        {selected.size > 0 && <div className="space-y-3 border-t border-border p-4"><textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for the selected transfers (minimum 10 characters)" className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">{selected.size} selected - {reason.trim().length}/10 characters</span><button disabled={busy || reason.trim().length < 10} onClick={sendSelected} className="w-full rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-40 sm:w-auto">Send {selected.size} request{selected.size === 1 ? '' : 's'}</button></div></div>}
      </div>}
      {outgoing.length > 0 && <div className="rounded-2xl border border-border bg-card p-5"><h2 className="text-sm font-black text-foreground">Awaiting approval ({outgoing.length})</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{outgoing.map(request => <div key={request.id} className="rounded-xl border border-border bg-background p-3"><p className="break-words text-sm font-bold text-foreground">{request.student?.full_name}</p><p className="mt-1 break-words text-xs text-muted-foreground">{request.from_teacher?.full_name}: {request.from_class?.name} to {request.to_class?.name}</p></div>)}</div></div>}
    </div> : <div className="overflow-x-clip rounded-2xl border border-border bg-card">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center"><div className="min-w-0 flex-1"><h2 className="text-sm font-black text-foreground">Incoming requests ({incoming.length})</h2><p className="text-xs text-muted-foreground">Select only the students you are ready to release.</p></div>{incoming.length > 0 && <div className="flex w-full flex-wrap gap-2 sm:w-auto"><button onClick={() => setSelectedIncoming(allIncomingSelected ? new Set() : new Set(incoming.map(row => row.id)))} className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground">{allIncomingSelected ? 'Clear all' : 'Select all'}</button><button disabled={busy || selectedIncoming.size === 0} onClick={() => decideSelected('decline')} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-black text-rose-400 disabled:opacity-40">Decline selected</button><button disabled={busy || selectedIncoming.size === 0} onClick={() => decideSelected('approve')} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Approve & move ({selectedIncoming.size})</button></div>}</div>
      <div className="divide-y divide-border">{incoming.length ? incoming.map(request => { const checked = selectedIncoming.has(request.id); return <button key={request.id} onClick={() => toggle(selectedIncoming, setSelectedIncoming, request.id)} className={`flex w-full gap-3 p-4 text-left ${checked ? 'bg-emerald-500/10' : 'hover:bg-muted/40'}`}><span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-emerald-500 bg-emerald-600' : 'border-border'}`}>{checked && <CheckCircleIcon className="h-4 w-4 text-white" />}</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-black text-foreground">{request.student?.full_name}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{request.requester?.full_name} requests {request.from_class?.name} to {request.to_class?.name}</span><span className="mt-2 block break-words rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{request.reason}</span></span></button>; }) : <div className="p-16 text-center"><CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-500/50" /><p className="mt-3 text-sm font-bold text-foreground">All caught up</p><p className="text-xs text-muted-foreground">No transfer requests are waiting for you.</p></div>}</div>
    </div>}
  </div>;
}