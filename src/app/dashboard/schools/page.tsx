'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BuildingOfficeIcon, MagnifyingGlassIcon, PlusIcon,
  PhoneIcon, EnvelopeIcon, MapPinIcon, UsersIcon,
  CheckCircleIcon, ClockIcon, XCircleIcon,
  ExclamationTriangleIcon, EyeIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';

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

  const isAdmin = profile?.role === 'admin';
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [assignedTeachers, setAssignedTeachers] = useState<any[]>([]);
  const [assignTab, setAssignTab] = useState<'info' | 'teachers'>('info');
  const [assigning, setAssigning] = useState<string | null>(null);

  // Load all teachers once (for assigning)
  useEffect(() => {
    if (!isAdmin) return;
    createClient()
      .from('portal_users')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setAllTeachers(data ?? []));
  }, [isAdmin]);

  // Load teachers assigned to the currently open school
  useEffect(() => {
    if (!detail?.id) { setAssignedTeachers([]); return; }
    createClient()
      .from('teacher_schools')
      .select('id, teacher_id, is_primary, portal_users(id, full_name, email)')
      .eq('school_id', detail.id)
      .then(({ data }) => setAssignedTeachers(data ?? []));
  }, [detail?.id]);

  useEffect(() => {
    if (authLoading || !profile || !isAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const { data, error: err } = await createClient()
          .from('schools')
          .select('*')
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
    } catch { /* ignore */ }
    setActing(null);
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
                      {(s.status === 'pending' || !s.status) && (
                        <>
                          <button onClick={() => updateStatus(s.id, 'approved')} disabled={acting === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                            <CheckCircleIcon className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button onClick={() => updateStatus(s.id, 'rejected')} disabled={acting === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                            <XCircleIcon className="w-3.5 h-3.5" /> Reject
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
                {(['info', 'teachers'] as const).map(t => (
                  <button key={t} onClick={() => setAssignTab(t)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${assignTab === t ? 'bg-violet-600 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'
                      }`}>
                    {t === 'teachers' ? `Assigned Teachers (${assignedTeachers.length})` : 'School Info'}
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

      </div>
    </div>
  );
}