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
    if (!confirm(`Are you sure you want to permanently delete the class "${name}"?`)) return;
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
        const schoolId = profile?.role === 'school' ? (profile?.school_id ?? undefined) : undefined;
        const data = await fetchClasses(teacherId, schoolId);
        if (!cancelled) setClasses(data);
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
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Loading Registry...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-[#0B132B] to-[#1a2b54] rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-violet-600 opacity-20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-600/30 text-violet-300 rounded-full border border-violet-500/20">
              <AcademicCapIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Academy Management</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tighter leading-none">
              Class <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">Registry</span>
            </h1>
            <p className="text-blue-100/40 text-sm sm:text-base max-w-xl leading-relaxed font-medium">
              Manage your academic clusters, track student enrollment, and coordinate your teaching schedule from your centralized command center.
            </p>
          </div>
          {profile?.role !== 'school' && (
            <Link href="/dashboard/classes/add"
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-violet-900/40 group active:scale-95 whitespace-nowrap">
              <PlusIcon className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              Create New Class
            </Link>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          { label: 'Total Classes', value: classes.length, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
          { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-blue-600 to-blue-400' },
          { label: 'Active Classes', value: activeCount, icon: FireIcon, gradient: 'from-emerald-600 to-emerald-400' },
          { label: 'Unique Programs', value: new Set(classes.map(c => c.program_id)).size, icon: ChartBarIcon, gradient: 'from-amber-600 to-amber-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 hover:bg-white/10 transition-all group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${s.gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
            <div className={`w-12 h-12 bg-gradient-to-br ${s.gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
              <s.icon className="w-6 h-6 text-white" />
            </div>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight tabular-nums">{s.value}</p>
            <p className="text-[10px] font-black text-white/30 mt-1.5 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-400 text-sm flex items-center gap-3">
          <FireIcon className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Controls Deck */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white/5 p-3 rounded-[2rem] border border-white/10 backdrop-blur-xl">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
          <input type="text" placeholder="Search by class name or program..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-violet-300 focus:outline-none focus:border-violet-500 cursor-pointer hover:bg-white/10 transition-all appearance-none text-center sm:text-left">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Content Hierarchy */}
      {filtered.length === 0 ? (
        <div className="py-32 bg-white/5 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
            <BookOpenIcon className="w-10 h-10 text-white/10" />
          </div>
          <h3 className="text-xl font-bold text-white/40 uppercase tracking-widest">No Classes Found</h3>
          <p className="text-white/20 text-xs mt-2 max-w-xs uppercase tracking-widest font-black">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {filtered.map((cls) => (
            <div key={cls.id} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl hover:bg-white/10 hover:-translate-y-1 transition-all group flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600 opacity-[0.03] rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-10 opacity-0 transition-opacity" />
              
              <div className="flex items-start justify-between mb-8">
                <div className="space-y-3 font-medium">
                  <span className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em] bg-violet-400/10 px-3 py-1 rounded-full border border-violet-400/20">
                    {cls.programs?.name || 'Technical Course'}
                  </span>
                  <h3 className="text-3xl font-black text-white group-hover:text-violet-400 transition-colors tracking-tight">{cls.name}</h3>
                  {cls.portal_users?.full_name && profile?.role !== 'school' && (
                    <div className="flex items-center gap-2 pt-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-[10px] font-black text-white uppercase shadow-lg">
                        {cls.portal_users.full_name.charAt(0)}
                      </div>
                      <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">Instructor: {cls.portal_users.full_name}</span>
                    </div>
                  )}
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${
                  cls.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  cls.status === 'scheduled' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-white/5 text-white/30 border-white/10'
                }`}>
                  {cls.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10 pt-8 border-t border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/20 group-hover:text-violet-400 group-hover:bg-violet-400/10 border border-white/5 transition-all">
                    <ClockIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Schedule</p>
                    <p className="text-xs font-bold text-white/70">{cls.schedule || 'Flex'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/20 group-hover:text-blue-400 group-hover:bg-blue-400/10 border border-white/5 transition-all">
                    <UserGroupIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Students</p>
                    <p className="text-xs font-bold text-white/70">{cls.current_students || 0} <span className="text-white/20">/</span> {cls.max_students || '∞'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-auto">
                <Link href={`/dashboard/classes/${cls.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-4 bg-white/10 hover:bg-violet-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl active:scale-95 group/btn">
                  <EyeIcon className="w-4 h-4 text-white/40 group-hover/btn:text-white transition-colors" /> View Details
                </Link>
                {profile?.role !== 'school' && (
                  <>
                    <Link href={`/dashboard/classes/${cls.id}/edit`}
                      className="p-4 bg-white/5 text-white/20 hover:text-violet-400 hover:bg-violet-400/10 rounded-2xl border border-white/10 transition-all active:scale-95">
                      <PencilIcon className="w-5 h-5" />
                    </Link>
                    <button onClick={() => handleDelete(cls.id, cls.name)} disabled={deleting === cls.id}
                      className="p-4 bg-white/5 text-white/10 hover:text-rose-400 hover:bg-rose-400/10 rounded-2xl border border-white/10 transition-all active:scale-95 disabled:opacity-30">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Global Action Nodes */}
      <div className="bg-white/5 border border-white/10 rounded-[3rem] p-10 sm:p-14 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600 opacity-[0.03] rounded-full blur-3xl -mr-48 -mt-48" />
        <h2 className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-12 text-center">Resources & Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
          {[
            { label: 'Register Students', icon: UserGroupIcon, gradient: 'from-violet-600 to-violet-400', href: '/dashboard/students' },
            { label: 'Create Assignment', icon: DocumentTextIcon, gradient: 'from-blue-600 to-blue-400', href: '/dashboard/assignments' },
            { label: 'Manage CBT', icon: ChartBarIcon, gradient: 'from-emerald-600 to-emerald-400', href: '/dashboard/cbt' },
            { label: 'Curriculum Hub', icon: BookOpenIcon, gradient: 'from-amber-600 to-amber-400', href: '/dashboard/lessons' },
          ].map((a) => (
            <Link key={a.label} href={a.href}
              className="flex items-center gap-4 px-6 py-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl transition-all group">
              <div className={`p-3 bg-gradient-to-br ${a.gradient} rounded-xl shadow-lg group-hover:scale-110 transition-transform`}>
                <a.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-black text-white/50 uppercase tracking-widest leading-tight group-hover:text-white transition-colors">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}