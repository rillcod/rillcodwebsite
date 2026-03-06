'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BuildingOfficeIcon, MagnifyingGlassIcon, PlusIcon,
  PhoneIcon, EnvelopeIcon, MapPinIcon, UsersIcon,
  ExclamationTriangleIcon, EyeIcon, ChevronDownIcon, CheckIcon, KeyIcon,
  CheckCircleIcon, ClockIcon, XCircleIcon, PencilSquareIcon, ShieldCheckIcon,
  XMarkIcon, ClipboardIcon,
} from '@heroicons/react/24/outline';
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
    studentCount: '',
    programInterest: '',
    status: 'approved',
    enrollmentTypes: ['school'] as string[],
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

  // Load all teachers once (for assigning)
  useEffect(() => {
    if (!isAdmin) return;
    createClient()
      .from('portal_users')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }: any) => setAllTeachers(data ?? []));
  }, [isAdmin]);

  // Load teachers assigned to the currently open school
  useEffect(() => {
    if (!detail?.id) { setAssignedTeachers([]); return; }
    createClient()
      .from('teacher_schools')
      .select('id, teacher_id, is_primary, portal_users(id, full_name, email)')
      .eq('school_id', detail.id)
      .then(({ data }: any) => setAssignedTeachers(data ?? []));
  }, [detail?.id]);

  useEffect(() => {
    if (authLoading || !profile || !isAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data, error: err } = await createClient()
          .from('schools')
          .select('*, portal_users(id, email, full_name)')
          .order('created_at', { ascending: false });
        if (err) throw err;
        if (!cancelled) setSchools(data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load schools');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isAdmin, authLoading]); // eslint-disable-line

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id);
    try {
      await createClient().from('schools').update({ status }).eq('id', id);
      setSchools(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      if (detail?.id === id) setDetail((d: any) => ({ ...d, status }));
      const target = schools.find(s => s.id === id);
      if (target?.email) {
        fetch('/api/schools/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: target.email,
            status,
            schoolName: target.name,
          })
        }).catch(() => null);
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
    if (!createForm.name.trim()) return;
    setCreatingSchool(true);
    setError(null);
    try {
      const db = createClient();
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
        is_active: true,
      };

      if (editingSchool) {
        const { data, error }: { data: any; error: any } = await db
          .from('schools')
          .update(payload)
          .eq('id', editingSchool.id)
          .select()
          .single();
        if (error) throw error;
        setSchools(prev => prev.map(s => s.id === data.id ? data : s));
        setEditingSchool(null);
      } else {
        const { data, error }: { data: any; error: any } = await db
          .from('schools')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        setSchools(prev => [data, ...prev]);
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
        studentCount: '',
        programInterest: '',
        status: 'approved',
        enrollmentTypes: ['school'],
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save school');
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleDeleteSchool = async (id: string) => {
    if (!confirm('Are you sure you want to delete this school? This will soft-delete the record.')) return;
    setDeleting(id);
    try {
      const { error } = await createClient()
        .from('schools')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
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
      studentCount: school.student_count?.toString() || '',
      programInterest: school.program_interest?.join(', ') || '',
      status: school.status || 'approved',
      enrollmentTypes: school.enrollment_types || ['school'],
    });
    setShowCreate(true);
  };

  const assignTeacher = async (teacherId: string) => {
    if (!detail?.id || !profile?.id) return;
    setAssigning(teacherId);
    try {
      const { data, error } = await createClient()
        .from('teacher_schools')
        .insert({ teacher_id: teacherId, school_id: detail.id, assigned_by: profile.id })
        .select('id, teacher_id, is_primary, portal_users(id, full_name, email)')
        .single();
      if (!error && data) setAssignedTeachers(prev => [...prev, data]);
    } catch { /* ignore */ }
    setAssigning(null);
  };

  const removeTeacher = async (assignmentId: string) => {
    setAssigning(assignmentId);
    try {
      await createClient().from('teacher_schools').delete().eq('id', assignmentId);
      setAssignedTeachers(prev => prev.filter(t => t.id !== assignmentId));
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

  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Admin access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
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
          <button
            onClick={() => { setEditingSchool(null); setShowCreate(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <PlusIcon className="w-4 h-4" /> Add School
          </button>
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
                  <div className="flex items-start gap-4">
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
                      {s.program_interest?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {s.program_interest.map((p: string) => (
                            <span key={p} className="text-[10px] font-bold px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full">{p}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-white/20 mt-1.5">Registered {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end gap-2 flex-shrink-0">
                      <button onClick={() => setDetail(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold rounded-xl transition-all">
                        <EyeIcon className="w-3.5 h-3.5" /> View
                      </button>
                      <button onClick={() => startEdit(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold rounded-xl transition-all">
                        <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDeleteSchool(s.id)} disabled={deleting === s.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                        <XCircleIcon className="w-3.5 h-3.5" /> {deleting === s.id ? '…' : 'Delete'}
                      </button>
                      {(s.status === 'pending' || !s.status) && (
                        <>
                          <button onClick={() => updateStatus(s.id, 'approved')} disabled={acting === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                            <CheckCircleIcon className="w-3.5 h-3.5" /> Approve
                          </button>
                        </>
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
                      { label: 'Type', value: detail.school_type },
                      { label: 'Contact Person', value: detail.contact_person },
                      { label: 'Email', value: detail.email },
                      { label: 'Phone', value: detail.phone },
                      { label: 'Address', value: detail.address },
                      { label: 'LGA / State', value: [detail.lga, detail.state].filter(Boolean).join(', ') },
                      { label: 'Student Count', value: detail.student_count ? `${detail.student_count} students` : null },
                      { label: 'Programme', value: detail.program_interest?.join(', ') },
                      { label: 'Registered', value: detail.created_at ? new Date(detail.created_at).toLocaleDateString() : null },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="flex items-start gap-4 py-2 border-b border-white/5 last:border-0">
                        <span className="text-white/30 w-32 flex-shrink-0 text-xs uppercase tracking-wider font-semibold pt-0.5">{label}</span>
                        <span className="text-white/80">{value}</span>
                      </div>
                    ) : null)}
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
                      placeholder="e.g. 500"
                    />
                  </div>
                </div>

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