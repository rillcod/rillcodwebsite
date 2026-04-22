// @refresh reset
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  TrashIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  ShieldExclamationIcon,
} from '@/lib/icons';

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  section_class: string;
  school_name: string;
  is_active: boolean;
  created_at: string;
}

interface DeleteResult {
  deleted: number;
  failed: number;
  skipped: number;
  errors: string[];
  details: Array<{ id: string; full_name: string; email: string; auth: string }>;
}

const CONFIRM_WORD = 'WIPE';

export default function BulkDeletePage() {
  const { profile, loading: authLoading } = useAuth();

  const [students,    setStudents]    = useState<StudentRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showModal,   setShowModal]   = useState(false);
  const [confirm,     setConfirm]     = useState('');
  const [deleting,    setDeleting]    = useState(false);
  const [result,      setResult]      = useState<DeleteResult | null>(null);

  const isAdmin = profile?.role === 'admin';

  async function loadStudents() {
    setLoading(true);
    const { data, error } = await createClient()
      .from('portal_users')
      .select('id, full_name, email, section_class, school_name, is_active, created_at')
      .eq('role', 'student')
      .order('full_name');
    
    if (!error) {
      const mapped = (data ?? []).map(s => ({
        ...s,
        section_class: s.section_class ?? '',
        school_name: s.school_name ?? '',
        is_active: !!s.is_active,
        created_at: s.created_at ?? ''
      }));
      setStudents(mapped);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile && isAdmin) loadStudents();
  }, [profile?.id]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => {
      const matchSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.school_name ?? '').toLowerCase().includes(q);
      const matchClass =
        !classFilter || (s.section_class ?? '').toLowerCase() === classFilter.toLowerCase();
      return matchSearch && matchClass;
    });
  }, [students, search, classFilter]);

  const allClasses = useMemo(
    () => [...new Set(students.map((s) => s.section_class).filter(Boolean) as string[])].sort(),
    [students],
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const someSelected        = selected.size > 0;

  function toggleAll() {
    if (allFilteredSelected) {
      const next = new Set(selected);
      filtered.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleDelete() {
    if (confirm !== CONFIRM_WORD || !selected.size) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/students/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');
      setResult(data);
      setShowModal(false);
      setConfirm('');
      const deletedIds = new Set(
        (data.details ?? []).filter((d: any) => d.auth === 'deleted').map((d: any) => d.id),
      );
      setStudents((prev) => prev.filter((s) => !deletedIds.has(s.id)));
      setSelected(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (authLoading || !profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
      <ShieldExclamationIcon className="w-12 h-12 text-rose-500/40" />
      <p className="text-muted-foreground font-bold">Admin access only.</p>
      <Link href="/dashboard/students" className="text-orange-400 text-sm hover:underline">← Back to Students</Link>
    </div>
  );

  const selectedStudents = students.filter((s) => selected.has(s.id));

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
            <TrashIcon className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500 flex-shrink-0" />
            Bulk Delete Students
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Permanently wipes selected students from Auth and all linked records.
          </p>
        </div>
        <Link href="/dashboard/students" className="text-muted-foreground hover:text-foreground text-xs sm:text-sm transition-colors flex-shrink-0">
          ← Back
        </Link>
      </div>

      {/* Danger banner */}
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-none p-4 mb-5 flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-rose-300/80 leading-relaxed">
          <strong className="text-rose-300">This action is irreversible.</strong>{' '}
          Deleted students are removed from Supabase Auth, portal_users, enrollments, submissions, grades, attendance, messages, and certificates. There is no undo.
        </p>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`rounded-none p-4 border mb-5 ${result.failed === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-foreground font-bold text-sm">
                {result.deleted} student{result.deleted !== 1 ? 's' : ''} wiped.
                {result.failed > 0 && <span className="text-rose-400"> {result.failed} failed.</span>}
                {result.skipped > 0 && <span className="text-amber-400"> {result.skipped} skipped.</span>}
              </p>
            </div>
            <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or school…"
            className="w-full pl-9 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {allClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
            >
              <option value="">All classes</option>
              {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button
            onClick={loadStudents}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Selection action bar */}
      {someSelected && (
        <div className="flex items-center justify-between px-4 py-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-none gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <UserGroupIcon className="w-4 h-4 text-rose-400" />
            <span className="text-rose-300 font-bold">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground text-xs underline">
              Clear
            </button>
          </div>
          <button
            onClick={() => { setConfirm(''); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-foreground font-bold rounded-none text-sm transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
            Wipe {selected.size} Student{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Student list */}
      <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <UserGroupIcon className="w-10 h-10 mb-3" />
            <p className="font-bold">No students found</p>
            {(search || classFilter) && <p className="text-xs mt-1">Try clearing the filters</p>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-xs min-w-[340px]">
                <thead className="sticky top-0 bg-[#0b1020] z-10">
                  <tr className="border-b border-border text-muted-foreground uppercase tracking-wider text-[10px]">
                    <th className="px-3 sm:px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-border bg-card shadow-sm accent-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3">Name</th>
                    <th className="text-left px-3 py-3 hidden sm:table-cell">Email</th>
                    <th className="text-left px-3 py-3">Class</th>
                    <th className="text-left px-3 py-3 hidden md:table-cell">School</th>
                    <th className="text-left px-3 py-3 hidden sm:table-cell">Status</th>
                    <th className="text-left px-3 py-3 hidden lg:table-cell">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isSelected = selected.has(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => toggleOne(s.id)}
                        className={`border-b border-border cursor-pointer transition-colors ${
                          isSelected ? 'bg-rose-500/10 hover:bg-rose-500/15' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-3 sm:px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(s.id)}
                            className="w-3.5 h-3.5 rounded border-border bg-card shadow-sm accent-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-medium ${isSelected ? 'text-rose-200' : 'text-foreground'}`}>
                            {s.full_name}
                          </span>
                          {/* Show email below name on mobile */}
                          <span className="block sm:hidden text-muted-foreground font-mono text-[10px] mt-0.5 truncate max-w-[160px]">
                            {s.email}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono hidden sm:table-cell">{s.email}</td>
                        <td className="px-3 py-2.5">
                          {s.section_class
                            ? <span className="inline-block px-2 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-bold rounded-full border border-cyan-500/20">{s.section_class}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{s.school_name ?? '—'}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${s.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-card shadow-sm text-muted-foreground'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">
                          {s.created_at ? new Date(s.created_at as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length} shown · {students.length} total</span>
              {someSelected && <span className="text-rose-400 font-bold">{selected.size} selected</span>}
            </div>
          </>
        )}
      </div>

      {/* Confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0d1526] border border-rose-500/40 rounded-t-2xl rounded-none p-5 sm:p-6 w-full sm:max-w-md shadow-2xl">

            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 flex-shrink-0 rounded-full bg-rose-500/20 flex items-center justify-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-foreground font-black text-lg">Confirm Permanent Wipe</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  This will permanently delete{' '}
                  <span className="text-rose-300 font-bold">{selected.size} student account{selected.size !== 1 ? 's' : ''}</span>{' '}
                  and all their linked data.
                </p>
              </div>
            </div>

            {/* Selected names preview */}
            <div className="bg-black/30 rounded-none p-3 mb-4 max-h-32 overflow-y-auto">
              {selectedStudents.slice(0, 50).map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                  <span className="text-foreground text-xs font-medium">{s.full_name}</span>
                  {s.section_class && <span className="text-cyan-400/60 text-[10px] font-mono">{s.section_class}</span>}
                </div>
              ))}
              {selected.size > 50 && <p className="text-muted-foreground text-xs mt-1">…and {selected.size - 50} more</p>}
            </div>

            {/* What gets deleted */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-none p-3 mb-4">
              <p className="text-rose-300 text-[11px] font-bold mb-1.5 uppercase tracking-wider">What gets permanently deleted:</p>
              <ul className="text-rose-300/60 text-[11px] space-y-0.5 list-disc list-inside">
                <li>Supabase Auth account</li>
                <li>portal_users profile row</li>
                <li>Enrollments, attendance, grades, CBT sessions</li>
                <li>Assignment submissions, lesson progress</li>
                <li>Messages, notifications, certificates, badges</li>
              </ul>
            </div>

            {/* Confirm input */}
            <div className="mb-4">
              <label className="block text-muted-foreground text-xs font-bold mb-2">
                Type <span className="text-rose-400 font-mono">{CONFIRM_WORD}</span> to confirm:
              </label>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                placeholder={CONFIRM_WORD}
                className="w-full px-4 py-2.5 bg-black/30 border border-rose-500/30 rounded-none text-foreground font-mono text-sm focus:outline-none focus:border-rose-500 transition-colors placeholder-muted-foreground"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowModal(false); setConfirm(''); }}
                className="flex-1 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground font-bold rounded-none text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirm !== CONFIRM_WORD || deleting}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-black rounded-none text-sm transition-colors flex items-center justify-center gap-2"
              >
                {deleting
                  ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Wiping…</>
                  : <><TrashIcon className="w-4 h-4" /> Wipe {selected.size}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
