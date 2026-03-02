'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserGroupIcon, MagnifyingGlassIcon, PlusIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, AcademicCapIcon,
  BuildingOfficeIcon, EnvelopeIcon, PhoneIcon, MapPinIcon,
  ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, ArrowDownTrayIcon,
  CalendarIcon, UserIcon, ExclamationTriangleIcon, StarIcon,
  BookOpenIcon, ClipboardDocumentListIcon, KeyIcon, ShieldCheckIcon,
  XMarkIcon, ClipboardIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
    rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    active: 'bg-blue-500/20   text-blue-400   border-blue-500/30',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
      {status}
    </span>
  );
}

// ─── Info chip ───────────────────────────────────────────────
function Chip({ icon: Icon, text }: { icon: any; text: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-white/40">
      <Icon className="w-3 h-3 flex-shrink-0" /> {text}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function StudentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; name: string } | null>(null);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  // ── Fetch ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile || !isStaff) return;
    setLoading(true); setError(null);
    try {
      let query = createClient()
        .from('students')
        .select(`
          id, full_name, school_name, school_id, user_id,
          student_email, enrollment_type,
          parent_name, parent_email, parent_phone, parent_relationship,
          grade_level, gender, date_of_birth, city, state,
          interests, goals, heard_about_us,
          course_interest, preferred_schedule,
          status, created_at, approved_at, approved_by
        `);

      if (profile.role === 'school' && profile.school_id) {
        query = query.eq('school_id', profile.school_id);
      }

      const { data, error: err } = await query.order('created_at', { ascending: false });
      if (err) throw err;
      setStudents(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [profile, isStaff]);

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
  }, [profile?.id, isStaff, authLoading, load]);

  // ── Approve ────────────────────────────────────────────────
  const approve = async (id: string) => {
    setActing(id);
    try {
      await createClient().from('students').update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile?.id,
      }).eq('id', id);
      setStudents(prev => prev.map(s => s.id === id
        ? { ...s, status: 'approved', approved_at: new Date().toISOString() }
        : s));
    } catch { /* ignore */ }
    setActing(null);
  };

  // ── Reject ─────────────────────────────────────────────────
  const reject = async (id: string) => {
    setActing(id);
    try {
      await createClient().from('students').update({ status: 'rejected' }).eq('id', id);
      setStudents(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
    } catch { /* ignore */ }
    setActing(null);
  };

  // ── Activate portal account ─────────────────────────────────
  const activatePortalAccount = async (studentId: string, studentName: string) => {
    setActivating(studentId);
    try {
      const res = await fetch('/api/students/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Activation failed');
      if (json.alreadyActivated) {
        alert(`${studentName} already has a portal account (${json.email}).`);
      } else {
        // Show credentials modal
        setCredentials({ email: json.email, tempPassword: json.tempPassword, name: studentName });
        // Update local state to reflect user_id is now set
        setStudents(prev => prev.map(s => s.id === studentId
          ? { ...s, user_id: json.portalUserId, status: 'approved' } : s));
      }
    } catch (e: any) {
      alert(e.message ?? 'Failed to activate portal account');
    } finally {
      setActivating(null);
    }
  };

  // ── DELETE ────────────────────────────────────────────────
  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student record?')) return;
    setDeleting(id);
    try {
      const { error } = await createClient().from('students').delete().eq('id', id);
      if (error) throw error;
      setStudents(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete student');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (s: any) => {
    setEditingStudent(s);
    setShowAdd(true);
  };

  // ── CSV export ─────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Name', 'Status', 'Enrollment Type', 'Grade', 'School', 'Gender', 'Parent', 'Parent Phone', 'Parent Email', 'City', 'State', 'Registered'];
    const rows = students.map(s => [
      s.full_name, s.status, s.enrollment_type, s.grade_level, s.school_name, s.gender,
      s.parent_name, s.parent_phone, s.parent_email, s.city, s.state,
      new Date(s.created_at).toLocaleDateString(),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Filter ─────────────────────────────────────────────────
  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const ms = (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.parent_email ?? '').toLowerCase().includes(q) ||
      (s.parent_name ?? '').toLowerCase().includes(q) ||
      (s.school_name ?? '').toLowerCase().includes(q) ||
      (s.city ?? '').toLowerCase().includes(q);
    return ms && (filter === 'all' || s.status === filter);
  });

  const pending = students.filter(s => s.status === 'pending').length;
  const approved = students.filter(s => s.status === 'approved').length;
  const rejected = students.filter(s => s.status === 'rejected').length;

  // ── Calculate age ──────────────────────────────────────────
  const calcAge = (dob?: string) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  };

  // ─── Loading ───────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-32" />
          <div className="h-8 bg-white/10 rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-24 animate-pulse" />)}
        </div>
        {[1, 2, 3].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-24 animate-pulse" />)}
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="text-center">
        <UserGroupIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
        <p className="text-white/40">You don&apos;t have access to this page.</p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Credentials Modal ─────────────────────────────── */}
      {credentials && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCredentials(null)}>
          <div className="bg-[#161628] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Portal Account Created</h3>
                  <p className="text-xs text-white/40">Share these credentials with {credentials.name}</p>
                </div>
              </div>
              <button onClick={() => setCredentials(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <XMarkIcon className="w-5 h-5 text-white/40" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Copy these credentials now — the password will not be shown again. The student should change it on first login via Settings.</span>
              </div>
              {[
                { label: 'Login Email', value: credentials.email },
                { label: 'Temporary Password', value: credentials.tempPassword },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm select-all">
                      {value}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors"
                      title="Copy">
                      <ClipboardIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Email: ${credentials.email}\nPassword: ${credentials.tempPassword}`
                  );
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all mt-2">
                <ClipboardIcon className="w-4 h-4" /> Copy Both to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-[#0f0f1a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

          {/* ── Header ─────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserGroupIcon className="w-5 h-5 text-blue-400" />
                <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                  Student Management · {profile?.role}
                </span>
              </div>
              <h1 className="text-3xl font-extrabold">Students</h1>
              <p className="text-white/40 text-sm mt-1">
                Manage registrations, parent info, approvals and student records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} title="Refresh"
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all">
                <ArrowPathIcon className="w-4 h-4" />
              </button>
              <button onClick={exportCSV} title="Export CSV"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-bold rounded-xl border border-white/10 transition-all">
                <ArrowDownTrayIcon className="w-4 h-4" /> Export
              </button>
              {profile?.role !== 'student' && (
                <button onClick={() => { setEditingStudent(null); setShowAdd(true); }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20">
                  <PlusIcon className="w-4 h-4" /> Add Student
                </button>
              )}
            </div>
          </div>

          {/* ── Error ──────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <p className="text-rose-400 text-sm">{error}</p>
            </div>
          )}

          {/* ── Stats ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: students.length, icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', active: filter === 'all', onClick: () => setFilter('all') },
              { label: 'Approved', value: approved, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', active: filter === 'approved', onClick: () => setFilter(filter === 'approved' ? 'all' : 'approved') },
              { label: 'Pending', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', active: filter === 'pending', onClick: () => setFilter(filter === 'pending' ? 'all' : 'pending') },
              { label: 'Rejected', value: rejected, icon: XCircleIcon, color: 'text-rose-400', bg: 'bg-rose-500/10', active: filter === 'rejected', onClick: () => setFilter(filter === 'rejected' ? 'all' : 'rejected') },
            ].map(s => (
              <button key={s.label} onClick={s.onClick}
                className={`text-left bg-white/5 border rounded-2xl p-5 transition-all hover:bg-white/8 ${s.active ? 'border-white/30 ring-1 ring-white/10' : 'border-white/10'}`}>
                <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </button>
            ))}
          </div>

          {/* ── Pending alert ───────────────────────────────── */}
          {pending > 0 && (
            <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
              <ClockIcon className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-amber-400">{pending} student{pending !== 1 ? 's' : ''} awaiting approval</p>
                <p className="text-xs text-white/30 mt-0.5">Click a student row to expand parent info before approving</p>
              </div>
              <button onClick={() => setFilter('pending')}
                className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                Show Pending
              </button>
            </div>
          )}

          {/* ── Search + Filter ─────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input type="text"
                placeholder="Search name, parent, school, email, city…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* ── Empty ───────────────────────────────────────── */}
          {filtered.length === 0 && !error && (
            <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
              <UserGroupIcon className="w-14 h-14 mx-auto text-white/10 mb-4" />
              <p className="text-lg font-semibold text-white/30">No students found</p>
              <p className="text-sm text-white/20 mt-1">
                {search ? 'Try a different search term' : 'Students will appear here once they register'}
              </p>
            </div>
          )}

          {/* ── Student List ─────────────────────────────────── */}
          {filtered.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <AcademicCapIcon className="w-5 h-5 text-blue-400" /> Student Records
                </h3>
                <span className="text-xs text-white/30">{filtered.length} of {students.length} shown</span>
              </div>

              <div className="divide-y divide-white/5">
                {filtered.map((s: any) => {
                  const isExpanded = expanded === s.id;
                  const age = calcAge(s.date_of_birth);
                  return (
                    <div key={s.id}>
                      {/* ── Row ─── */}
                      <div
                        className="flex items-start gap-4 p-5 hover:bg-white/5 transition-colors cursor-pointer group"
                        onClick={() => setExpanded(isExpanded ? null : s.id)}>

                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0 mt-0.5">
                          {(s.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name + badge */}
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="font-bold text-white">{s.full_name}</span>
                            <StatusBadge status={s.status} />
                            {s.gender && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-white/30 border border-white/10">
                                {s.gender}
                              </span>
                            )}
                          </div>

                          {/* Chips row */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <Chip icon={BuildingOfficeIcon} text={s.school_name} />
                            <Chip icon={AcademicCapIcon} text={s.grade_level} />
                            <Chip icon={MapPinIcon} text={[s.city, s.state].filter(Boolean).join(', ')} />
                            <Chip icon={BookOpenIcon} text={s.enrollment_type ? `${s.enrollment_type} enrolment` : ''} />
                            <Chip icon={CalendarIcon} text={s.created_at ? `Registered ${new Date(s.created_at).toLocaleDateString()}` : ''} />
                          </div>

                          {/* Parent summary (always visible) */}
                          {s.parent_name && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-white/30">
                              <UserIcon className="w-3 h-3" />
                              <span>Parent: <span className="text-white/50 font-semibold">{s.parent_name}</span></span>
                              {s.parent_phone && <span className="text-white/20">·</span>}
                              {s.parent_phone && <span>{s.parent_phone}</span>}
                            </div>
                          )}
                        </div>

                        {/* Right side: actions + expand */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {s.status === 'pending' && profile?.role === 'admin' && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); approve(s.id); }}
                                disabled={acting === s.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                {acting === s.id ? '…' : 'Approve'}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); reject(s.id); }}
                                disabled={acting === s.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                <XCircleIcon className="w-3.5 h-3.5" />
                                {acting === s.id ? '…' : 'Reject'}
                              </button>
                            </>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); startEdit(s); }}
                            className="p-1.5 rounded-lg border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all">
                            <PencilSquareIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteStudent(s.id); }}
                            disabled={deleting === s.id}
                            className="p-1.5 rounded-lg border border-rose-500/20 hover:border-rose-500/40 text-rose-400/60 hover:text-rose-400 transition-all disabled:opacity-50">
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                          {isExpanded
                            ? <ChevronUpIcon className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                            : <ChevronDownIcon className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />}
                        </div>
                      </div>

                      {/* ── Expanded Detail Panel ─── */}
                      {isExpanded && (
                        <div className="bg-white/[0.03] border-t border-white/5 px-5 pb-6 pt-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

                            {/* Parent / Guardian */}
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                              <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <UserIcon className="w-3.5 h-3.5" /> Parent / Guardian
                              </p>
                              <div className="space-y-2.5">
                                <InfoRow label="Name" value={s.parent_name} />
                                <InfoRow label="Relationship" value={s.parent_relationship} />
                                <InfoRow label="Phone" value={s.parent_phone} icon={<PhoneIcon className="w-3 h-3 text-white/20" />} />
                                <InfoRow label="Email" value={s.parent_email} icon={<EnvelopeIcon className="w-3 h-3 text-white/20" />} />
                              </div>
                            </div>

                            {/* Student Details */}
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                              <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <AcademicCapIcon className="w-3.5 h-3.5" /> Student Details
                              </p>
                              <div className="space-y-2.5">
                                <InfoRow label="Full Name" value={s.full_name} />
                                <InfoRow label="Gender" value={s.gender} />
                                <InfoRow label="Age" value={age ? `${age} years old` : undefined} />
                                <InfoRow label="Grade" value={s.grade_level} />
                                <InfoRow label="School" value={s.school_name} />
                                <InfoRow label="Location" value={[s.city, s.state].filter(Boolean).join(', ')} />
                              </div>
                            </div>

                            {/* Programme & Status */}
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                              <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <BookOpenIcon className="w-3.5 h-3.5" /> Programme & Status
                              </p>
                              <div className="space-y-2.5">
                                <InfoRow label="Interests" value={s.interests} />
                                <InfoRow label="Course Interest" value={s.course_interest} />
                                <InfoRow label="Preferred Schedule" value={s.preferred_schedule} />
                                <InfoRow label="Goals" value={s.goals} />
                                <InfoRow label="Heard About" value={s.heard_about_us} />
                                <InfoRow label="Enrollment Type" value={s.enrollment_type} />
                                <InfoRow label="Status" value={s.status} />
                                {s.approved_at && (
                                  <InfoRow label="Approved On" value={new Date(s.approved_at).toLocaleDateString()} />
                                )}
                                <InfoRow label="Registered" value={new Date(s.created_at).toLocaleDateString()} />
                              </div>
                            </div>

                          </div>

                          {/* Action bar at bottom of expanded */}
                          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
                            {s.status === 'pending' && profile?.role === 'admin' && (
                              <>
                                <button onClick={() => approve(s.id)} disabled={acting === s.id}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/20">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? 'Processing…' : `Approve ${s.full_name?.split(' ')[0]}`}
                                </button>
                                <button onClick={() => reject(s.id)} disabled={acting === s.id}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                                  <XCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? '…' : 'Reject'}
                                </button>
                              </>
                            )}
                            {s.status === 'approved' && (
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                                  <StarIcon className="w-4 h-4" />
                                  <span className="font-semibold">Approved student</span>
                                  {s.approved_at && <span className="text-white/30 text-xs">· {new Date(s.approved_at).toLocaleDateString()}</span>}
                                </div>
                                {/* Show portal status */}
                                {s.user_id ? (
                                  <span className="flex items-center gap-1.5 text-xs text-violet-400 font-semibold">
                                    <ShieldCheckIcon className="w-3.5 h-3.5" /> Portal Active
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => activatePortalAccount(s.id, s.full_name)}
                                    disabled={activating === s.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                                    <KeyIcon className="w-3.5 h-3.5" />
                                    {activating === s.id ? 'Creating…' : 'Activate Portal'}
                                  </button>
                                )}
                              </div>
                            )}
                            {s.status === 'rejected' && (
                              <div className="flex items-center gap-2 text-rose-400 text-sm">
                                <XCircleIcon className="w-4 h-4" />
                                <span className="font-semibold">Application rejected</span>
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-3">
                              <Link href={`/dashboard/students/${s.id}/report`}
                                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                                <ClipboardDocumentListIcon className="w-3.5 h-3.5" /> View Report
                              </Link>
                              {s.parent_email && (
                                <a href={`mailto:${s.parent_email}`}
                                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white transition-colors">
                                  <EnvelopeIcon className="w-3.5 h-3.5" /> Email parent
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      <AddStudentModal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setEditingStudent(null); }}
        onSuccess={() => { setShowAdd(false); setEditingStudent(null); load(); }}
        initialData={editingStudent}
      />
    </>
  );
}

// ─── Small helper: label + value pair ──────────────────────
function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-white/30 flex-shrink-0">{label}</span>
      <span className="text-white/70 font-medium text-right flex items-center gap-1">
        {icon}{value}
      </span>
    </div>
  );
}