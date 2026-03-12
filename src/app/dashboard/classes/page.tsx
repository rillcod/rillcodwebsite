'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchClasses } from '@/services/dashboard.service';
import { createClient } from '@/lib/supabase/client';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, AcademicCapIcon,
  ClockIcon, UserGroupIcon, ChartBarIcon, CalendarIcon,
  EyeIcon, PencilIcon, TrashIcon, VideoCameraIcon, DocumentTextIcon,
  FireIcon, StarIcon, BoltIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline';

const GRADIENTS = [
  'from-violet-600 to-violet-400', 'from-blue-600 to-blue-400',
  'from-emerald-600 to-emerald-400', 'from-amber-600 to-amber-400',
  'from-cyan-600 to-cyan-400', 'from-rose-600 to-rose-400',
];

export default function ClassesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete class "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    const { error } = await createClient().from('classes').delete().eq('id', id);
    if (error) { alert(error.message); }
    else { setClasses(prev => prev.filter(c => c.id !== id)); }
    setDeleting(null);
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const teacherId = profile?.role === 'teacher' ? profile?.id : undefined;
        const data = await fetchClasses(teacherId);
        if (!cancelled) setClasses(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load classes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]); // eslint-disable-line

  const filtered = classes.filter(c => {
    const s = searchTerm.toLowerCase();
    const ms = (c.name ?? '').toLowerCase().includes(s) || (c.programs?.name ?? '').toLowerCase().includes(s);
    const mst = filterStatus === 'all' || c.status === filterStatus;
    return ms && mst;
  });

  const totalStudents = filtered.reduce((sum, c) => sum + (c.current_students ?? 0), 0);
  const active = filtered.filter(c => c.status === 'active').length;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading classes…</p>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-[#070710] text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 space-y-12">

        {/* Header - Nucleus Alpha */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-[#0a0a1a] p-8 sm:p-12 rounded-[3.5rem] border border-white/5 relative overflow-hidden shadow-3xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600/10 blur-[120px] -mr-48 -mt-48 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <AcademicCapIcon className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Operational Sector</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none italic uppercase">Class <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500">Registry</span></h1>
            <p className="text-white/40 text-sm mt-4 font-medium max-w-lg leading-relaxed uppercase tracking-widest text-[10px]">Synchronizing academic cells and instructor protocols for the current curriculum cycle.</p>
          </div>
          <Link href="/dashboard/classes/add"
            className="relative z-10 group px-10 py-5 bg-white text-black font-black uppercase text-xs tracking-[0.3em] rounded-2xl hover:bg-cyan-500 hover:text-white transition-all shadow-2xl active:scale-95 flex items-center gap-4">
            Initialize Class <PlusIcon className="w-5 h-5 transition-transform group-hover:rotate-90" />
          </Link>
        </div>

        {/* Stats - Grid Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Active Clusters', value: classes.length, icon: AcademicCapIcon, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Total Synchronies', value: totalStudents, icon: UserGroupIcon, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
            { label: 'Operational Nodes', value: active, icon: FireIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Programs Hub', value: new Set(classes.map(c => c.program_id)).size, icon: ChartBarIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
          ].map((s) => (
            <div key={s.label} className="bg-[#0a0a1a] border border-white/5 rounded-[2.5rem] p-8 hover:border-white/10 transition-all group overflow-hidden relative shadow-2xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform" />
              <div className={`w-14 h-14 ${s.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 ring-2 ring-white/5`}>
                <s.icon className={`w-7 h-7 ${s.color}`} />
              </div>
              <p className={`text-4xl font-black tracking-tight leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mt-3 group-hover:text-white/40 transition-colors">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Filters - Control Deck */}
        <div className="flex flex-col lg:flex-row gap-4 bg-[#0a0a1a] p-4 rounded-[2rem] border border-white/5">
          <div className="relative flex-1 group">
            <MagnifyingGlassIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-cyan-400 transition-colors" />
            <input type="text" placeholder="Search operational registry..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-16 pr-8 py-5 bg-white/[0.02] border border-white/5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white placeholder-white/10 focus:outline-none focus:border-cyan-500/30 focus:bg-cyan-500/5 transition-all" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-8 py-5 bg-white/[0.02] border border-white/5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-cyan-500/30 cursor-pointer hover:bg-white/5 transition-all">
            <option value="all">Global State</option>
            <option value="active">Operational</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Archive</option>
          </select>
        </div>

        {/* Classes Grid - The Grid Hub */}
        {filtered.length === 0 ? (
          <div className="py-40 bg-[#0a0a1a] border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 opacity-20">
              <BookOpenIcon className="w-12 h-12" />
            </div>
            <p className="text-2xl font-black text-white/20 uppercase tracking-[0.5em]">Sector Empty</p>
            <p className="text-[10px] font-black text-white/10 uppercase tracking-[0.3em] mt-2">Initialize a data node to begin tracking</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
            {filtered.map((cls, i) => (
              <div key={cls.id} className="bg-[#0a0a1a] border border-white/5 rounded-[3.5rem] overflow-hidden hover:border-cyan-500/20 transition-all group flex flex-col shadow-3xl relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/5 blur-[80px] -mr-32 -mt-32 pointer-events-none group-hover:bg-cyan-600/10 transition-colors" />
                <div className="p-10 flex-1 flex flex-col relative z-10">
                  <div className="flex items-start justify-between mb-8">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-2">
                         <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                         <span className="text-[10px] font-black text-cyan-500/60 uppercase tracking-[0.4em]">{cls.programs?.name || 'Academic Core'}</span>
                      </div>
                      <h3 className="text-3xl font-black text-white leading-tight uppercase tracking-tight group-hover:text-cyan-400 transition-colors">{cls.name}</h3>
                      {cls.portal_users?.full_name && (
                        <div className="flex items-center gap-2 mt-4">
                           <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[8px] font-black">{cls.portal_users.full_name?.charAt(0)}</div>
                           <p className="text-white/30 text-[10px] font-black uppercase tracking-widest leading-none">Instructor: {cls.portal_users.full_name}</p>
                        </div>
                      )}
                    </div>
                    <div className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl ring-1 ring-inset ${
                      cls.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
                      cls.status === 'scheduled' ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' :
                      'bg-white/5 text-white/30 ring-white/10'
                    }`}>
                      {cls.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-8 border-y border-white/5 py-8">
                    <div className="space-y-1">
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Synchronization</p>
                       <div className="flex items-center gap-2 text-[11px] font-black text-white/70 uppercase tracking-widest">
                          <ClockIcon className="w-4 h-4 text-cyan-400/60" /> {cls.schedule || 'Variable'}
                       </div>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Population</p>
                       <div className="flex items-center gap-2 text-[11px] font-black text-white/70 uppercase tracking-widest">
                          <UserGroupIcon className="w-4 h-4 text-indigo-400/60" /> {cls.current_students || 0}/{cls.max_students || '∞'}
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Link href={`/dashboard/classes/${cls.id}`}
                      className="flex-1 flex items-center justify-center gap-3 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-all shadow-xl active:scale-95 text-center">
                      <EyeIcon className="w-4 h-4" /> Open Hub
                    </Link>
                    <Link href={`/dashboard/classes/${cls.id}/edit`}
                      className="p-5 text-white/20 hover:text-cyan-400 bg-white/5 hover:bg-cyan-400/10 rounded-2xl transition-all active:scale-95 shadow-xl">
                      <PencilIcon className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(cls.id, cls.name)}
                      disabled={deleting === cls.id}
                      className="p-5 text-white/10 hover:text-rose-500 bg-white/5 hover:bg-rose-500/10 rounded-2xl transition-all active:scale-95 shadow-xl disabled:opacity-20">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Nodes - Nexus Connect */}
        <div className="bg-[#0a0a1a] border border-white/5 rounded-[3.5rem] p-12 relative overflow-hidden shadow-3xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] -mr-32 -mt-32 rounded-full pointer-events-none" />
          <h3 className="text-[12px] font-black uppercase tracking-[0.6em] text-white/20 mb-10 flex items-center gap-4">
            <span className="w-12 h-px bg-white/10" /> Rapid Protocols <span className="w-12 h-px bg-white/10" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Register Cluster', icon: PlusIcon, color: 'bg-white/5 hover:bg-cyan-500/10 text-cyan-400', href: '/dashboard/classes/add' },
              { label: 'Task Deployment', icon: DocumentTextIcon, color: 'bg-white/5 hover:bg-indigo-500/10 text-indigo-400', href: '/dashboard/assignments' },
              { label: 'Performance Matrix', icon: ChartBarIcon, color: 'bg-white/5 hover:bg-emerald-500/10 text-emerald-400', href: '/dashboard/progress' },
              { label: 'Lesson Architect', icon: BookOpenIcon, color: 'bg-white/5 hover:bg-violet-500/10 text-violet-400', href: '/dashboard/lessons' },
            ].map((a) => (
              <Link key={a.label} href={a.href}
                className={`flex items-center gap-4 px-6 py-6 ${a.color} border border-white/5 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-[1.03] shadow-xl group`}>
                <div className="p-3 bg-white/5 rounded-xl group-hover:scale-110 transition-transform">
                   <a.icon className="w-5 h-5 flex-shrink-0" />
                </div>
                {a.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}