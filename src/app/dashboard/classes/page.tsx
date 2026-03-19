// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, AcademicCapIcon,
  ClockIcon, UserGroupIcon, ChartBarIcon, CalendarIcon,
  EyeIcon, PencilIcon, TrashIcon, VideoCameraIcon, DocumentTextIcon,
  FireIcon, StarIcon, BoltIcon, ArrowRightIcon, BuildingOfficeIcon,
  ArrowPathIcon,
} from '@/lib/icons';

const GRADIENTS = [
  'from-orange-600 to-orange-400', 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
  'from-orange-600 to-orange-400 from-orange-600 to-orange-400', 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
  'from-orange-600 to-orange-400 from-orange-600 to-orange-400', 'from-rose-600 to-rose-400',
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
    if (!confirm(`Are you sure you want to permanently delete the class "${name}"?`)) return;
    setDeleting(id);
    const res = await fetch(`/api/classes/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); alert(j.error || 'Delete failed'); }
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
        const res = await fetch('/api/classes', { cache: 'no-store' });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to load classes'); }
        const { data: enriched } = await res.json();
        if (!cancelled) setClasses(enriched ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load classes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]);

  const filtered = classes.filter(c => {
    const s = searchTerm.toLowerCase();
    const ms = (c.name ?? '').toLowerCase().includes(s) || (c.programs?.name ?? '').toLowerCase().includes(s);
    const mst = filterStatus === 'all' || c.status === filterStatus;
    return ms && mst;
  });

  const totalStudents = filtered.reduce((sum, c) => sum + (c.current_students ?? 0), 0);
  const activeCount = filtered.filter(c => c.status === 'active').length;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Decoding Registry State...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-32">
      {/* ── Advanced Header Unit ────────────────────────────────────────── */}
      <div className="relative group overflow-hidden bg-[#0a0a0a] border border-white/5 p-8 sm:p-16">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-600/5 blur-[120px] -mr-48 -mt-48 transition-all duration-700 group-hover:bg-orange-600/10" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/5 blur-[100px] -ml-24 -mb-24 transition-all duration-700 group-hover:bg-blue-600/10" />
        
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-end justify-between gap-12">
          <div className="space-y-6 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-600/10 border border-orange-500/20 shadow-[0_0_20px_rgba(234,88,12,0.1)]">
              <span className="w-1.5 h-1.5 bg-orange-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">Registry Maintenance Node</span>
            </div>
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter leading-[0.85] uppercase">
              Class <br />
              <span className="bg-gradient-to-r from-orange-400 via-orange-600 to-orange-400 bg-clip-text text-transparent animate-gradient-x">Infrastructure</span>
            </h1>
            <p className="text-gray-400 text-sm sm:text-lg leading-relaxed font-medium max-w-2xl border-l-2 border-orange-600/30 pl-6">
              Command station for academic cluster management. Monitor student saturation, orchestrate curriculum delivery, and synchronize institutional resources across all active learning sectors.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
            {profile?.role !== 'school' && (
              <Link href="/dashboard/classes/add"
                className="group relative flex items-center justify-center gap-4 px-10 py-5 bg-orange-600 hover:bg-orange-500 text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all hover:translate-y-[-2px] active:translate-y-[0px] shadow-[0_10px_40px_rgba(234,88,12,0.3)] hover:shadow-[0_15px_50px_rgba(234,88,12,0.4)]">
                <PlusIcon className="w-5 h-5 transition-transform duration-500 group-hover:rotate-180" />
                Initialize New Cluster
              </Link>
            )}
            <button className="flex items-center justify-center gap-4 px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all backdrop-blur-md text-orange-500">
              <ChartBarIcon className="w-5 h-5 scale-in-center" />
              Strategic Analytics
            </button>
          </div>
        </div>
      </div>

      {/* ── Operational Telemetry (Stats) ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border-y border-white/5 bg-white/[0.02]">
        {[
          { label: 'Total Clusters', value: classes.length, icon: AcademicCapIcon, color: 'text-orange-500' },
          { label: 'Student Saturation', value: totalStudents, icon: UserGroupIcon, color: 'text-blue-500' },
          { label: 'Active Channels', value: activeCount, icon: FireIcon, color: 'text-emerald-500' },
          { label: 'Strategic Programs', value: new Set(classes.map(c => c.program_id)).size, icon: ChartBarIcon, color: 'text-purple-500' },
        ].map((s, idx) => (
          <div key={s.label} className={`p-8 sm:p-12 hover:bg-white/[0.03] transition-all group border-r last:border-r-0 border-white/5`}>
            <div className="flex items-center justify-between mb-6">
              <div className={`p-3 bg-white/5 border border-white/10 group-hover:border-orange-500/30 transition-all`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Sector 0{idx + 1}</span>
            </div>
            <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter tabular-nums mb-2">{s.value}</p>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filter & Search Matrix ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4 p-4 bg-[#0a0a0a] border border-white/5 sticky top-4 z-40 backdrop-blur-xl bg-opacity-80">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500/50" />
          <input 
            type="text" 
            placeholder="FILTER BY CLUSTER NAME OR STRATEGIC PROGRAM..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-none text-[11px] font-black uppercase tracking-[0.2em] text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all" 
          />
        </div>
        <div className="flex gap-4">
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-10 py-5 bg-white/5 border border-white/10 rounded-none text-[10px] font-black uppercase tracking-[0.3em] text-orange-400 focus:outline-none focus:border-orange-500 focus:bg-white/[0.07] cursor-pointer hover:bg-white/10 transition-all appearance-none text-center"
          >
            <option value="all">ALL STATUSES</option>
            <option value="active">ACTIVE NODES</option>
            <option value="scheduled">SCHEDULED</option>
            <option value="completed">ARCHIVED</option>
          </select>
          <div className="px-6 py-5 bg-white/5 border border-white/10 flex items-center justify-center">
            <BoltIcon className="w-5 h-5 text-orange-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Cluster Display Logic ────────────────────────────────────────── */}
      <div className="relative min-h-[400px]">
        {error && (
          <div className="mb-8 p-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-4 animate-in slide-in-from-top-4 duration-500">
            <FireIcon className="w-5 h-5" />
            <span className="flex-1">System Error: {error}</span>
            <button onClick={() => window.location.reload()} className="hover:text-white transition-colors underline underline-offset-4">Reboot Registry</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-40 bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center text-center group">
            <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-none flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500 shadow-2xl">
              <BookOpenIcon className="w-10 h-10 text-white/20 group-hover:text-orange-500/50 transition-colors" />
            </div>
            <h3 className="text-2xl font-black text-white/40 uppercase tracking-[0.4em] mb-4">Zero Signal Detected</h3>
            <p className="text-gray-500 text-[10px] max-w-sm uppercase tracking-[0.2em] font-bold leading-relaxed">
              The current filter parameters have yielded no operational clusters. Verify your telemetry inputs or initialize a new node.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-0 border-l border-t border-white/5">
            {filtered.map((cls) => (
              <div key={cls.id} className="group relative bg-[#0a0a0a] border-r border-b border-white/5 p-8 sm:p-12 hover:bg-white/[0.03] transition-all duration-500 overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 blur-[60px] translate-x-16 -translate-y-16 group-hover:bg-orange-600/10 transition-all duration-700" />
                <div className="absolute top-0 left-0 w-1 h-0 bg-orange-600 group-hover:h-full transition-all duration-500" />
                
                <div className="relative z-10 space-y-8 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-3">
                        <span className="px-3 py-1 bg-orange-600/10 border border-orange-500/20 text-orange-500 text-[9px] font-black uppercase tracking-[0.2em]">
                          {cls.programs?.name || 'GENERIC'}
                        </span>
                        {cls.status === 'active' && (
                          <div className="flex items-center gap-1.5 ml-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                          </div>
                        )}
                      </div>
                      <h3 className="text-3xl sm:text-4xl font-black text-white group-hover:text-orange-400 transition-colors tracking-tight leading-none uppercase">
                        {cls.name}
                      </h3>
                    </div>
                    <div className={`px-4 py-1.5 border text-[8px] font-black uppercase tracking-[0.3em] transition-all transform group-hover:scale-105 duration-500 ${
                      cls.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      cls.status === 'scheduled' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-white/5 text-white/40 border-white/10'
                    }`}>
                      {cls.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 border-y border-white/5 py-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ClockIcon className="w-3.5 h-3.5 text-orange-500/50" />
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Rhythm Matrix</span>
                      </div>
                      <p className="text-xs font-bold text-gray-300 uppercase tracking-normal">
                        {cls.schedule || 'Operational Syncing'}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-blue-500/50">
                        <UserGroupIcon className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Population</span>
                      </div>
                      <p className="text-xs font-bold text-gray-300 tabular-nums">
                        {cls.current_students || 0} <span className="text-gray-600">/</span> {cls.max_students || '∞'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    {cls.schools?.name && (
                      <div className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/5 group-hover:border-blue-500/20 transition-all">
                        <BuildingOfficeIcon className="w-4 h-4 text-blue-400/50" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] truncate">{cls.schools.name}</span>
                      </div>
                    )}
                    {cls.portal_users?.full_name && profile?.role !== 'school' && (
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                          {cls.portal_users.full_name.charAt(0)}
                        </div>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-300 transition-colors">Instructor: {cls.portal_users.full_name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-0 border-t border-white/5 pt-0 mt-4 h-16">
                    <Link href={`/dashboard/classes/${cls.id}`}
                      className="flex-1 h-full inline-flex items-center justify-center gap-3 border-r border-white/5 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-[0.3em] transition-all group/btn active:scale-[0.98]">
                      <EyeIcon className="w-4 h-4 text-orange-500 group-hover/btn:text-white transition-colors" /> 
                      Access Node
                    </Link>
                    {profile?.role !== 'school' && (
                      <>
                        <Link href={`/dashboard/classes/${cls.id}/edit`}
                          className="h-full px-8 flex items-center justify-center border-r border-white/5 text-gray-500 hover:text-white hover:bg-white/10 transition-all active:scale-[0.98]">
                          <PencilIcon className="w-4 h-4" />
                        </Link>
                        <button 
                          onClick={() => handleDelete(cls.id, cls.name)} 
                          disabled={deleting === cls.id}
                          className="h-full px-8 flex items-center justify-center text-gray-500 hover:text-rose-500 hover:bg-rose-600/10 transition-all active:scale-[0.98] disabled:opacity-20">
                          {deleting === cls.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Auxiliary Resource Grid ────────────────────────────────────────── */}
      <div className="relative border border-white/5 bg-[#0a0a0a] p-12 sm:p-20 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-600/30 to-transparent" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-600 opacity-[0.05] blur-[120px] -mr-32 -mb-32 translate-y-16" />
        
        <div className="relative z-10">
          <div className="text-center space-y-4 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-orange-500/70">Unified Management Ecosystem</h2>
            <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter uppercase leading-none">Resource Nodes</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Register Signal', sub: 'STUDENT REGISTRY', icon: UserGroupIcon, color: 'text-orange-500', href: '/dashboard/students' },
              { label: 'Task Deployment', sub: 'ASSIGNMENT CORE', icon: DocumentTextIcon, color: 'text-blue-500', href: '/dashboard/assignments' },
              { label: 'CBT Protocol', sub: 'SYNAPTIC TESTING', icon: AcademicCapIcon, color: 'text-emerald-500', href: '/dashboard/cbt' },
              { label: 'Curriculum Hub', sub: 'KNOWLEDGE BASE', icon: BookOpenIcon, color: 'text-purple-500', href: '/dashboard/lessons' },
            ].map((a) => (
              <Link key={a.label} href={a.href}
                className="group relative block p-8 bg-white/5 border border-white/10 hover:border-orange-500/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white opacity-[0.02] transform rotate-45 translate-x-8 -translate-y-8 transition-transform duration-700 group-hover:scale-[3] group-hover:opacity-[0.05]" />
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="p-5 bg-white/5 border border-white/5 group-hover:border-orange-500/30 transition-all group-hover:scale-110 duration-500 shadow-2xl">
                    <a.icon className={`w-8 h-8 ${a.color}`} />
                  </div>
                  <div>
                    <span className="block text-xs font-black text-white uppercase tracking-[0.2em] group-hover:text-orange-400 transition-colors">{a.label}</span>
                    <span className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mt-2">{a.sub}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}