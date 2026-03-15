// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BuildingOfficeIcon, MagnifyingGlassIcon, PlusIcon,
  PhoneIcon, EnvelopeIcon, MapPinIcon, UsersIcon,
  ExclamationTriangleIcon, EyeIcon, ChevronDownIcon, CheckIcon, KeyIcon,
  CheckCircleIcon, ClockIcon, XCircleIcon, PencilSquareIcon, ShieldCheckIcon,
  XMarkIcon, ClipboardIcon,
  UserGroupIcon, AcademicCapIcon, ChartBarIcon, TrophyIcon, ArrowPathIcon,
  ArrowRightIcon, DocumentTextIcon, ClipboardDocumentListIcon,
} from '@/lib/icons';
import { generateTempPassword } from '@/lib/utils/password';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    active: 'bg-blue-500/20   text-blue-400   border-blue-500/30',
    pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
    rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    inactive: 'bg-white/10      text-white/30   border-white/10',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
      {status}
    </span>
  );
}

export default function SchoolsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [acting, setActing] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    schoolType: '',
    contactPerson: '',
    address: '',
    lga: '',
    city: '',
    state: '',
    phone: '',
    email: '',
    password: '',
    studentCount: '',
    programInterest: '',
    status: 'approved',
    enrollmentTypes: ['school'] as string[],
    rillcodQuotaPercent: '0',
  });

  const isAdmin = profile?.role === 'admin';
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [assignedTeachers, setAssignedTeachers] = useState<any[]>([]);
  const [assignTab, setAssignTab] = useState<'info' | 'teachers' | 'account'>('info');
  const [assigning, setAssigning] = useState<string | null>(null);

  const [accEmail, setAccEmail] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [creatingAcc, setCreatingAcc] = useState(false);
  const [accCreated, setAccCreated] = useState<{ email: string; pw: string } | null>(null);
  const [editingSchool, setEditingSchool] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [gapCount, setGapCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // Load all teachers once (for assigning) — via service-role API
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/portal-users')
      .then(r => r.json())
      .then(j => setAllTeachers((j.data ?? []).filter((u: any) => u.role === 'teacher' && u.is_active)));
  }, [isAdmin]);

  // Load teachers assigned to the currently open school
  useEffect(() => {
    if (!detail?.id) { setAssignedTeachers([]); return; }
    fetch(`/api/schools/${detail.id}`)
      .then(r => r.json())
      .then(j => setAssignedTeachers(j.data?.teacher_schools ?? []));
  }, [detail?.id]);

  useEffect(() => {
    if (authLoading || !profile || !isAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const res = await fetch('/api/schools');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load schools');
        if (!cancelled) setSchools(json.data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load schools');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    checkGaps();
    return () => { cancelled = true; };
  }, [profile?.id, isAdmin, authLoading]); // eslint-disable-line

  const checkGaps = async () => {
    try {
      const res = await fetch('/api/admin/sync-users');
      const json = await res.json();
      if (res.ok) setGapCount(json.gaps?.schools_needing_portal ?? 0);
    } catch { /* ignore */ }
  };

  const handleSync = async () => {
    if (!confirm('This will create portal accounts for all schools without one. Continue?')) return;
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-users', { method: 'POST' });
      const json = await res.json();
      setSyncResult(json);
      const schoolsRes = await fetch('/api/schools');
      const schoolsJson = await schoolsRes.json();
      if (schoolsRes.ok) setSchools(schoolsJson.data ?? []);
      await checkGaps();
    } catch (e: any) {
      setSyncResult({ error: e.message });
    }
    setSyncing(false);
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id);
    try {
      const res = await fetch(`/api/approvals/schools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: status }),
      });
      if (res.ok) {
        setSchools(prev => prev.map(s => s.id === id ? { ...s, status } : s));
        if (detail?.id === id) setDetail((d: any) => ({ ...d, status }));
        const target = schools.find(s => s.id === id);
        if (target?.email) {
          fetch('/api/schools/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: target.email, status, schoolName: target.name }),
          }).catch(() => null);
        }
      }
    } catch { /* ignore */ }
    setActing(null);
  };

  const toggleEnrollmentType = (value: string) => {
    setCreateForm(prev => ({
      ...prev,
      enrollmentTypes: prev.enrollmentTypes.includes(value)
        ? prev.enrollmentTypes.filter(t => t !== value)
        : [...prev.enrollmentTypes, value]
    }));
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation - make fields mandatory like "Portal Users"
    if (!createForm.name.trim()) {
      setError('School Name is required');
      return;
    }
    if (!createForm.contactPerson.trim()) {
      setError('Contact Person is required');
      return;
    }
    if (!createForm.email.trim()) {
      setError('Email address is required for portal account linkage');
      return;
    }

    setCreatingSchool(true);
    setError(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        school_type: createForm.schoolType || null,
        contact_person: createForm.contactPerson || null,
        address: createForm.address || null,
        lga: createForm.lga || null,
        city: createForm.city || null,
        state: createForm.state || null,
        phone: createForm.phone || null,
        email: createForm.email || null,
        student_count: createForm.studentCount ? parseInt(createForm.studentCount, 10) : null,
        program_interest: createForm.programInterest
          ? createForm.programInterest.split(',').map(p => p.trim()).filter(Boolean)
          : [],
        status: createForm.status || 'approved',
        enrollment_types: createForm.enrollmentTypes.length ? createForm.enrollmentTypes : ['school'],
        rillcod_quota_percent: parseFloat(createForm.rillcodQuotaPercent) || 0,
        is_active: true,
      };

      if (editingSchool) {
        const res = await fetch(`/api/schools/${editingSchool.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to update school');
        setSchools(prev => prev.map(s => s.id === json.data.id ? json.data : s));
        setEditingSchool(null);
      } else {
        const res = await fetch('/api/schools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to create school');

        // If created as approved by admin, run the approval API immediately to generate Portal Account
        if (payload.status === 'approved') {
          const approvalRes = await fetch(`/api/approvals/schools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: json.school.id,
              action: 'approved',
              ...(createForm.password ? { password: createForm.password } : {}),
            }),
          });
          if (!approvalRes.ok) {
            const approvalJson = await approvalRes.json().catch(() => ({}));
            throw new Error(approvalJson.error ?? 'School created but portal account generation failed');
          }
          const approvalJson = await approvalRes.json();
          // Show credentials if returned
          if (approvalJson.credentials) {
            setAccCreated({ email: approvalJson.credentials.email, pw: approvalJson.credentials.password });
            setAssignTab('account');
            setDetail(json.school);
          }
          // Refresh list
          const reloadRes = await fetch('/api/schools');
          const reloadJson = await reloadRes.json();
          if (reloadRes.ok) setSchools(reloadJson.data ?? []);
        } else {
          setSchools(prev => [json.school, ...prev]);
        }
      }

      setShowCreate(false);
      setCreateForm({
        name: '',
        schoolType: '',
        contactPerson: '',
        address: '',
        lga: '',
        city: '',
        state: '',
        phone: '',
        email: '',
        password: '',
        studentCount: '',
        programInterest: '',
        status: 'approved',
        enrollmentTypes: ['school'],
        rillcodQuotaPercent: '0',
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save school');
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleDeleteSchool = async (id: string) => {
    if (!confirm('Are you sure you want to delete this school? This will permanently delete the record and its associated portal accounts.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/schools/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to delete school');
      }
      setSchools(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete school');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (school: any) => {
    setEditingSchool(school);
    setCreateForm({
      name: school.name || '',
      schoolType: school.school_type || '',
      contactPerson: school.contact_person || '',
      address: school.address || '',
      lga: school.lga || '',
      city: school.city || '',
      state: school.state || '',
      phone: school.phone || '',
      email: school.email || '',
      password: '',
      studentCount: school.student_count?.toString() || '',
      programInterest: school.program_interest?.join(', ') || '',
      status: school.status || 'approved',
      enrollmentTypes: school.enrollment_types || ['school'],
      rillcodQuotaPercent: (school as any).rillcod_quota_percent?.toString() || '0',
    });
    setShowCreate(true);
  };

  const assignTeacher = async (teacherId: string) => {
    if (!detail?.id) return;
    setAssigning(teacherId);
    try {
      const res = await fetch(`/api/schools/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_teacher', teacher_id: teacherId }),
      });
      const json = await res.json();
      if (res.ok && json.data) setAssignedTeachers(prev => [...prev, json.data]);
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const removeTeacher = async (assignmentId: string) => {
    if (!detail?.id) return;
    setAssigning(assignmentId);
    try {
      const res = await fetch(`/api/schools/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_teacher', assignment_id: assignmentId }),
      });
      if (res.ok) setAssignedTeachers(prev => prev.filter(t => t.id !== assignmentId));
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const createSchoolAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.id || !accEmail || !accPassword) return;
    setCreatingAcc(true); setError(null);
    try {
      const tempPassword = accPassword || generateTempPassword();
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: accEmail,
          password: tempPassword,
          fullName: detail.name,
          role: 'school',
          school_id: detail.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account');
      setAccCreated({ email: accEmail, pw: tempPassword });
      setAccEmail('');
      setAccPassword('');
      // Refresh list to update UI
      fetch('/api/schools').then(r => r.json()).then(j => setSchools(j.data ?? []));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingAcc(false);
    }
  };

  const filtered = schools.filter(s => {
    const ms = (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.state ?? '').toLowerCase().includes(search.toLowerCase());
    const mf = filter === 'all' || s.status === filter;
    return ms && mf;
  });

  const counts = {
    total: schools.length,
    approved: schools.filter(s => s.status === 'approved' || s.status === 'active').length,
    pending: schools.filter(s => s.status === 'pending').length,
    rejected: schools.filter(s => s.status === 'rejected').length,
  };

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

  if (profile?.role === 'school') return <SchoolSelfView />;

  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Admin access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">

      {/* ── Sync Result Modal ── */}
      {syncResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-extrabold text-white">School Sync Complete</h2>
              </div>
              <button onClick={() => setSyncResult(null)} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {syncResult.error ? (
                <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                  <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <p className="text-rose-400 text-sm">{syncResult.error}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Schools Fixed', value: syncResult.summary?.schools_fixed ?? 0, color: 'text-emerald-400' },
                      { label: 'Errors', value: syncResult.summary?.errors ?? 0, color: 'text-rose-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.credentials?.filter((c: any) => c.password && !c.password.includes('existing')).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">New School Credentials — share with each school</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {syncResult.credentials.filter((c: any) => c.password && !c.password.includes('existing')).map((c: any, i: number) => (
                          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-xs">
                            <p className="text-white font-bold">{c.name}</p>
                            <p className="text-white/60 mt-0.5">{c.email}</p>
                            <p className="text-emerald-400 font-bold mt-0.5">pw: {c.password}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {syncResult.errors?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-rose-400/60 uppercase tracking-widest mb-2">Errors ({syncResult.errors.length})</p>
                      <div className="space-y-1 text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                        {syncResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex-shrink-0">
              <button onClick={() => setSyncResult(null)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Schools Management · Admin</span>
            </div>
            <h1 className="text-3xl font-extrabold">Partner Schools</h1>
            <p className="text-white/40 text-sm mt-1">Manage all partner school registrations and approvals</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSync}
              disabled={syncing}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-50 ${gapCount ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                }`}
            >
              {syncing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
              {syncing ? 'Syncing…' : gapCount ? `Sync Schools (${gapCount} gaps)` : 'Sync Schools'}
            </button>
            <button
              onClick={() => { setEditingSchool(null); setShowCreate(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add School
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Schools', value: counts.total, icon: BuildingOfficeIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Active', value: counts.approved, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Pending', value: counts.pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: 'Rejected', value: counts.rejected, icon: XCircleIcon, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pending alert */}
        {counts.pending > 0 && (
          <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <ClockIcon className="w-6 h-6 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-400">{counts.pending} school{counts.pending !== 1 ? 's' : ''} awaiting approval</p>
              <p className="text-xs text-white/30 mt-0.5">Review and approve or reject below</p>
            </div>
            <button onClick={() => setFilter('pending')}
              className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-xl transition-colors">
              Show Pending
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" placeholder="Search by name, email, state…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="relative">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="pl-4 pr-8 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="active">Active</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        {/* Empty */}
        {filtered.length === 0 && !error && (
          <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
            <BuildingOfficeIcon className="w-14 h-14 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No schools found</p>
            <p className="text-sm text-white/20 mt-1">Schools appear here once they register via the public form</p>
          </div>
        )}

        {/* School list */}
        {filtered.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <BuildingOfficeIcon className="w-5 h-5 text-blue-400" /> School Registry
              </h3>
              <span className="text-xs text-white/30">{filtered.length} shown</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map(s => (
                <div key={s.id} className="p-5 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-white">{s.name}</span>
                        <StatusBadge status={s.status ?? 'pending'} />
                        {s.portal_users?.length > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 text-violet-400 text-[10px] font-black uppercase tracking-tighter rounded-full border border-violet-500/20">
                            <ShieldCheckIcon className="w-3 h-3" /> Account
                          </span>
                        )}
                        {s.school_type && (
                          <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{s.school_type}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-white/40">
                        {s.contact_person && <span>{s.contact_person}</span>}
                        {s.email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.email}</span>}
                        {s.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.phone}</span>}
                        {(s.lga || s.state) && <span className="flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" />{[s.lga, s.state].filter(Boolean).join(', ')}</span>}
                        {s.student_count > 0 && <span className="flex items-center gap-1"><UsersIcon className="w-3.5 h-3.5" />{s.student_count} students</span>}
                      </div>
                      {s.enrollment_types?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {s.enrollment_types.map((t: string) => (
                            <span key={t} className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full capitalize">{t}</span>
                          ))}
                        </div>
                      )}
                      {s.program_interest?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {s.program_interest.map((p: string) => (
                            <span key={p} className="text-[10px] font-bold px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full">{p}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-white/20 mt-1.5">Registered {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-3 lg:mt-0">
                      <button onClick={() => setDetail(s)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase rounded-lg transition-all border border-white/8 whitespace-nowrap">
                        <EyeIcon className="w-3.5 h-3.5" /> View
                      </button>
                      <button onClick={() => startEdit(s)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase rounded-lg transition-all border border-white/8 whitespace-nowrap">
                        <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDeleteSchool(s.id)} disabled={deleting === s.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-[10px] font-black uppercase rounded-lg transition-all disabled:opacity-50 border border-rose-500/15 whitespace-nowrap">
                        <XCircleIcon className="w-3.5 h-3.5" /> {deleting === s.id ? '…' : 'Del'}
                      </button>
                      {(s.status === 'pending' || !s.status) && (
                        <button onClick={() => updateStatus(s.id, 'approved')} disabled={acting === s.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase rounded-lg transition-all disabled:opacity-50 whitespace-nowrap shadow-lg shadow-emerald-900/20">
                          <CheckCircleIcon className="w-3.5 h-3.5" /> Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detail modal */}
        {detail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f0f1a] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
                <div>
                  <h3 className="font-bold text-white text-lg">{detail.name}</h3>
                  <StatusBadge status={detail.status ?? 'pending'} />
                </div>
                <button onClick={() => { setDetail(null); setAssignTab('info'); }} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal tabs */}
              <div className="flex gap-1 p-3 border-b border-white/10 bg-white/[0.02] flex-shrink-0">
                {(['info', 'teachers', 'account'] as const).map(t => (
                  <button key={t} onClick={() => setAssignTab(t)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${assignTab === t ? 'bg-violet-600 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'
                      }`}>
                    {t === 'teachers' ? `Teachers (${assignedTeachers.length})` : t === 'account' ? 'Portal Account' : 'School Info'}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1">
                {assignTab === 'info' && (
                  <div className="p-6 space-y-4 text-sm">
                    {[
                      { label: 'School Type', value: detail.school_type },
                      { label: 'Contact Person', value: detail.contact_person },
                      { label: 'Email', value: detail.email },
                      { label: 'Phone', value: detail.phone },
                      { label: 'Address', value: detail.address },
                      { label: 'LGA / State', value: [detail.lga, detail.state].filter(Boolean).join(', ') },
                      { label: 'Student Count', value: detail.student_count ? `${detail.student_count} students` : null },
                      { label: 'Programme', value: detail.program_interest?.join(', ') },
                      { label: 'Registered', value: detail.created_at ? new Date(detail.created_at).toLocaleDateString() : null },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                        <span className="text-white/30 w-28 flex-shrink-0 text-xs uppercase tracking-wider font-semibold pt-0.5">{label}</span>
                        <span className="text-white/80 min-w-0 break-words">{value}</span>
                      </div>
                    ) : null)}
                    {detail.enrollment_types?.length > 0 && (
                      <div className="flex items-start gap-3 py-2 border-b border-white/5">
                        <span className="text-white/30 w-28 flex-shrink-0 text-xs uppercase tracking-wider font-semibold pt-0.5">Enrol Types</span>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.enrollment_types.map((t: string) => (
                            <span key={t} className="text-[10px] font-bold px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full capitalize">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {assignTab === 'teachers' && (
                  <div className="p-4 space-y-4">
                    {/* Already assigned */}
                    <div>
                      <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Assigned</p>
                      {assignedTeachers.length === 0 ? (
                        <p className="text-white/20 text-sm text-center py-4">No teachers assigned yet</p>
                      ) : (
                        <div className="space-y-2">
                          {assignedTeachers.map((ts: any) => {
                            const t = ts.portal_users ?? ts;
                            return (
                              <div key={ts.id} className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                  {(t.full_name ?? '?')[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white text-sm truncate">{t.full_name}</p>
                                  <p className="text-xs text-white/30 truncate">{t.email}</p>
                                </div>
                                <button onClick={() => removeTeacher(ts.id)} disabled={assigning === ts.id}
                                  className="px-3 py-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all disabled:opacity-50">
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Available to assign */}
                    <div>
                      <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Available Teachers</p>
                      <div className="space-y-2">
                        {allTeachers
                          .filter(t => !assignedTeachers.some((ts: any) => ts.teacher_id === t.id))
                          .map(t => (
                            <div key={t.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                {(t.full_name ?? '?')[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white text-sm truncate">{t.full_name}</p>
                                <p className="text-xs text-white/30 truncate">{t.email}</p>
                              </div>
                              <button onClick={() => assignTeacher(t.id)} disabled={assigning === t.id}
                                className="px-3 py-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all disabled:opacity-50">
                                {assigning === t.id ? '…' : 'Assign'}
                              </button>
                            </div>
                          ))}
                        {allTeachers.filter(t => !assignedTeachers.some((ts: any) => ts.teacher_id === t.id)).length === 0 && (
                          <p className="text-white/20 text-sm text-center py-4">All active teachers are already assigned</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {assignTab === 'account' && (
                  <div className="p-6">
                    <p className="text-sm text-white/40 mb-6">Create a portal account so this school can log in and view their students.</p>

                    {accCreated ? (
                      <div className="space-y-4">
                        <div className="text-center py-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                          <ShieldCheckIcon className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                          <h4 className="font-bold text-white">Portal Account Created</h4>
                          <p className="text-sm text-white/50 mt-1">Copy these credentials for the school administrator.</p>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>The school administrator should change this password on first login.</span>
                        </div>

                        {[
                          { label: 'Login Email', value: accCreated.email },
                          { label: 'Temporary Password', value: accCreated.pw },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">{label}</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm select-all">
                                {value}
                              </code>
                              <button
                                onClick={() => navigator.clipboard.writeText(value)}
                                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                                <ClipboardIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}

                        <button onClick={() => setAccCreated(null)}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all">
                          Done
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={createSchoolAccount} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Account Email</label>
                          <input type="email" required value={accEmail} onChange={e => setAccEmail(e.target.value)}
                            placeholder="admin@school.com" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Initial Password</label>
                          <input type="text" required value={accPassword} onChange={e => setAccPassword(e.target.value)}
                            placeholder="At least 8 characters" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500" />
                        </div>
                        <button type="submit" disabled={creatingAcc}
                          className="w-full flex justify-center items-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                          {creatingAcc ? 'Creating…' : <><KeyIcon className="w-4 h-4" /> Create Account</>}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {assignTab === 'info' && (detail.status === 'pending' || !detail.status) && (
                <div className="flex gap-3 p-6 border-t border-white/10 flex-shrink-0">
                  <button onClick={() => updateStatus(detail.id, 'approved')} disabled={acting === detail.id}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                    Approve School
                  </button>
                  <button onClick={() => updateStatus(detail.id, 'rejected')} disabled={acting === detail.id}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f0f1a] border border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-white text-lg">{editingSchool ? 'Edit School' : 'Add Partner School'}</h3>
                  <p className="text-xs text-white/40">{editingSchool ? `Modifying ${editingSchool.name}` : 'Create a school directly from the admin dashboard'}</p>
                </div>
                <button onClick={() => { setShowCreate(false); setEditingSchool(null); }} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateSchool} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">School Name *</label>
                    <input
                      value={createForm.name}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="School name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">School Type</label>
                    <input
                      value={createForm.schoolType}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, schoolType: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="Primary / Secondary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Contact Person</label>
                    <input
                      value={createForm.contactPerson}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="Principal / Admin"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Status</label>
                    <select
                      value={createForm.status}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 appearance-none"
                    >
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Address</label>
                  <input
                    value={createForm.address}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                    placeholder="School address"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">LGA</label>
                    <input
                      value={createForm.lga}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, lga: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="LGA"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">City</label>
                    <input
                      value={createForm.city}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">State</label>
                    <input
                      value={createForm.state}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="State"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Phone</label>
                    <input
                      value={createForm.phone}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="+234..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Email</label>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="email@school.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Student Count</label>
                    <input
                      type="number"
                      value={createForm.studentCount}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, studentCount: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                      placeholder="500"
                    />
                  </div>
                </div>

                <div className="bg-violet-600/5 border border-violet-500/10 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <ChartBarIcon className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-extrabold text-white uppercase tracking-widest">Financial & Quota terms</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Rillcod Quota Percent (%)</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range" min="0" max="100" step="1"
                        value={createForm.rillcodQuotaPercent}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, rillcodQuotaPercent: e.target.value }))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                      <input
                        type="number"
                        value={createForm.rillcodQuotaPercent}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, rillcodQuotaPercent: e.target.value }))}
                        className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <p className="text-[10px] text-white/30 mt-2 italic">The percentage of fees collected by the school that belongs to Rillcod Academy.</p>
                  </div>
                </div>

                {/* Portal account password — only relevant when creating a new approved school */}
                {!editingSchool && createForm.status === 'approved' && (
                  <div>
                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">
                      Portal Account Password
                      <span className="ml-2 normal-case font-normal text-white/30">(leave blank to auto-generate)</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.password}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500 font-mono"
                      placeholder="At least 6 characters"
                    />
                    <p className="text-[10px] text-white/30 mt-1">This will be the school&apos;s login password. Share it with them after creation.</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-1.5">Program Interests (comma separated)</label>
                  <input
                    value={createForm.programInterest}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, programInterest: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                    placeholder="Coding Fundamentals, Robotics"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">Enrollment Types</label>
                  <div className="flex flex-wrap gap-3 text-xs text-white/40">
                    {['school', 'bootcamp', 'online'].map((type) => (
                      <label key={type} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                        <input
                          type="checkbox"
                          checked={createForm.enrollmentTypes.includes(type)}
                          onChange={() => toggleEnrollmentType(type)}
                          className="h-4 w-4 rounded border-white/20 bg-white/10"
                        />
                        <span className="capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingSchool}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {creatingSchool ? 'Saving…' : <>{editingSchool ? <PencilSquareIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />} {editingSchool ? 'Update School' : 'Create School'}</>}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SCHOOL SELF VIEW — shown when a school-role user visits /schools
════════════════════════════════════════════════════════════ */
function SchoolSelfView() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ students: 0, teachers: 0, avgScore: 0, submissions: 0 });
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!profile?.school_id) { setLoading(false); return; }
    load();
  }, [profile?.school_id]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const sid = profile?.school_id || '';
    const sname = profile?.school_name;

    const [studentsRes, teachersRes, recentRes] = await Promise.allSettled([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', sid),
      supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', sid),
      supabase.from('students')
        .select('id, full_name, status, grade_level, created_at')
        .eq('school_id', sid)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    // 2-step grades: avoid portal_users!inner FK ambiguity
    const { data: rawGrades } = await supabase
      .from('assignment_submissions')
      .select('grade, portal_user_id, user_id')
      .not('grade', 'is', null)
      .limit(500);

    let grades: any[] = rawGrades ?? [];
    if (grades.length > 0) {
      const uids = [...new Set(grades.map((g: any) => g.portal_user_id ?? g.user_id).filter(Boolean))];
      if (uids.length > 0) {
        const { data: uData } = await supabase
          .from('portal_users').select('id, school_id, school_name').in('id', uids);
        const umap: Record<string, any> = {};
        (uData ?? []).forEach((u: any) => { umap[u.id] = u; });
        grades = grades.filter((g: any) => {
          const u = umap[g.portal_user_id ?? g.user_id];
          return u?.school_id === sid || (sname && u?.school_name === sname);
        });
      } else {
        grades = [];
      }
    }

    const studentCount = studentsRes.status === 'fulfilled' ? (studentsRes.value.count ?? 0) : 0;
    const teacherCount = teachersRes.status === 'fulfilled' ? (teachersRes.value.count ?? 0) : 0;
    const avgScore = grades.length
      ? Math.round(grades.reduce((a: number, g: any) => a + Number(g.grade), 0) / grades.length)
      : 0;
    const recent = recentRes.status === 'fulfilled' ? (recentRes.value.data ?? []) : [];

    setStats({ students: studentCount, teachers: teacherCount, avgScore, submissions: grades.length });
    setRecentStudents(recent);
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const quickActions = [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View & manage student roster' },
    { name: 'Import Students', href: '/dashboard/students/import', icon: PlusIcon, desc: 'Bulk import new students' },
    { name: 'Grades & Reports', href: '/dashboard/grades', icon: ChartBarIcon, desc: 'View student grades' },
    { name: 'Student Reports', href: '/dashboard/results', icon: DocumentTextIcon, desc: 'Progress report cards' },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#0B132B] to-[#1a2b54] rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-violet-600 opacity-20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-violet-600/80 text-white text-xs font-bold uppercase tracking-wider rounded-full mb-3">
              School Portal
            </span>
            <h1 className="text-3xl font-extrabold text-white">{profile?.school_name ?? 'My School'}</h1>
            <p className="text-blue-200 text-sm mt-2">
              {now ? now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Registered Students', value: stats.students, icon: UserGroupIcon, gradient: 'from-blue-600 to-blue-400' },
            { label: 'Assigned Teachers', value: stats.teachers, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
            { label: 'Avg Performance', value: `${stats.avgScore}%`, icon: ChartBarIcon, gradient: 'from-emerald-600 to-emerald-400' },
            { label: 'Graded Submissions', value: stats.submissions, icon: ClipboardDocumentListIcon, gradient: 'from-amber-600 to-amber-400' },
          ].map(({ label, value, icon: Icon, gradient }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <p className="text-3xl font-extrabold text-white">{value}</p>
              <p className="text-white/40 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">

            {/* Quick Actions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-5">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quickActions.map(({ name, href, icon: Icon, desc }) => (
                  <Link key={name} href={href}
                    className="group flex items-start gap-4 p-4 rounded-xl border border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-500/25 transition-colors">
                      <Icon className="h-5 w-5 text-violet-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{name}</p>
                      <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent Student Registrations */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Recent Student Registrations</h2>
                <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors" title="Refresh">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
              </div>
              {recentStudents.length === 0 ? (
                <div className="text-center py-8">
                  <UserGroupIcon className="w-10 h-10 mx-auto text-white/10 mb-2" />
                  <p className="text-white/25 text-sm">No students registered yet</p>
                  <Link href="/dashboard/students/import" className="inline-flex items-center gap-1.5 mt-3 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    <PlusIcon className="w-3.5 h-3.5" /> Import Students
                  </Link>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentStudents.map((s, i) => (
                    <div key={s.id} className={`flex items-center gap-3 py-3 ${i < recentStudents.length - 1 ? 'border-b border-white/5' : ''}`}>
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-400 text-xs font-black">{(s.full_name ?? '?')[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{s.full_name}</p>
                        <p className="text-xs text-white/40">{s.grade_level ?? 'No grade level'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border flex-shrink-0 ${s.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        s.status === 'pending' ? 'bg-amber-500/20  text-amber-400  border-amber-500/30' :
                          'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xl font-black text-white">
                  {(profile?.school_name ?? 'S')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-white truncate">{profile?.school_name ?? 'My School'}</p>
                  <p className="text-xs text-white/40 truncate">{profile?.email}</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-violet-500/20 text-violet-400 border-violet-500/30">
                School Partner
              </span>
              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                <Link href="/dashboard/students/import"
                  className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
                  <PlusIcon className="w-4 h-4" /> Import Students
                </Link>
                <Link href="/dashboard/settings"
                  className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
                  <ShieldCheckIcon className="w-4 h-4" /> Account Settings
                </Link>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-bold text-white text-sm mb-4">Navigate To</h3>
              <div className="space-y-1">
                {[
                  { label: 'School Overview', href: '/dashboard/school-overview', icon: BuildingOfficeIcon },
                  { label: 'My Students', href: '/dashboard/students', icon: UserGroupIcon },
                  { label: 'Grades & Reports', href: '/dashboard/grades', icon: TrophyIcon },
                  { label: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
                ].map(({ label, href, icon: Icon }) => (
                  <Link key={label} href={href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:bg-white/5 hover:text-white transition-all group">
                    <Icon className="w-4 h-4 group-hover:text-violet-400 transition-colors" />
                    {label}
                    <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}