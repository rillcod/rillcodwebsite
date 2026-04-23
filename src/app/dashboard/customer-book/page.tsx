'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Merge, Search } from 'lucide-react';

type ContactBookRow = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  school_name: string | null;
  class_name: string | null;
  source: string | null;
  last_channel: string | null;
  confirmed_at: string | null;
};

export default function CustomerBookPage() {
  const [rows, setRows] = useState<ContactBookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [source, setSource] = useState('all');
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [message, setMessage] = useState('');

  const fetchRows = async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ q, role, source, school, class: className });
      const res = await fetch(`/api/customer-book?${params.toString()}`);
      const json = await res.json();
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setRows([]);
      setMessage('Failed to load customer book');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { void fetchRows(); }, 250);
    return () => clearTimeout(t);
  }, [q, role, source, school, className]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.source) set.add(r.source); });
    return ['all', ...Array.from(set)];
  }, [rows]);

  const exportCsv = () => {
    const params = new URLSearchParams({ q, role, source, school, class: className, format: 'csv' });
    window.open(`/api/customer-book?${params.toString()}`, '_blank');
  };

  const runMerge = async () => {
    if (!mergeTarget || !mergeSource || mergeTarget === mergeSource) {
      setMessage('Pick two different contacts to merge.');
      return;
    }
    setMessage('');
    const res = await fetch('/api/customer-book', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: mergeTarget, source_id: mergeSource }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json?.error || 'Merge failed');
      return;
    }
    setMessage('Merge completed.');
    setMergeSource('');
    await fetchRows();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-4 sm:p-5">
        <h1 className="text-xl font-black text-white">Customer Book</h1>
        <p className="text-xs text-white/55 mt-1">Review captured student/parent contacts, export CSV, and merge duplicate records.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2 text-xs text-white/70">
          Search
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-sm text-white outline-none" placeholder="Name, email, phone" />
          </div>
        </label>
        <label className="text-xs text-white/70">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white">
            <option value="all">All</option><option value="student">Student</option><option value="parent">Parent</option>
          </select>
        </label>
        <label className="text-xs text-white/70">Source
          <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white">
            {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/70">School
          <input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white outline-none" />
        </label>
        <label className="text-xs text-white/70">Class
          <input value={className} onChange={(e) => setClassName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white outline-none" />
        </label>
        <div className="sm:col-span-2 lg:col-span-6">
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <select value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white">
            <option value="">Choose source duplicate…</option>
            {rows.map((r) => <option key={`s-${r.id}`} value={r.id}>{r.full_name || r.phone || r.email || r.id}</option>)}
          </select>
          <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-white">
            <option value="">Choose target record…</option>
            {rows.map((r) => <option key={`t-${r.id}`} value={r.id}>{r.full_name || r.phone || r.email || r.id}</option>)}
          </select>
          <button onClick={runMerge} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm font-bold text-orange-300">
            <Merge className="h-4 w-4" /> Merge Basic
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-white/70">{message}</p>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-0 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-white/5 text-white/60">
            <tr>
              <th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">School</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-4 text-white/50" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-4 text-white/50" colSpan={8}>No records found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10 text-white/85">
                <td className="px-3 py-2">{r.full_name || '-'}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">{r.email || '-'}</td>
                <td className="px-3 py-2">{r.phone || '-'}</td>
                <td className="px-3 py-2">{r.school_name || '-'}</td>
                <td className="px-3 py-2">{r.class_name || '-'}</td>
                <td className="px-3 py-2">{r.source || '-'}</td>
                <td className="px-3 py-2">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
