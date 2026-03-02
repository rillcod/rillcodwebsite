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
        const teacherId = profile!.role === 'teacher' ? profile!.id : undefined;
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
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                {profile?.role === 'teacher' ? 'My Classes' : 'All Classes'}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">Class Management</h1>
            <p className="text-white/40 text-sm mt-1">Track and manage teaching sessions</p>
          </div>
          <Link href="/dashboard/classes/add"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-blue-900/30">
            <PlusIcon className="w-4 h-4" /> Create Class
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Classes', value: classes.length, icon: AcademicCapIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Active Classes', value: active, icon: FireIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Programs', value: new Set(classes.map(c => c.program_id)).size, icon: ChartBarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" placeholder="Search classes or programs…" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Classes Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl">
            <BookOpenIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No classes found</p>
            <p className="text-sm text-white/20 mt-1">Create your first class to get started</p>
            <Link href="/dashboard/classes/add"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all">
              <PlusIcon className="w-4 h-4" /> Create Class
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((cls, i) => (
              <div key={cls.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all group">
                <div className={`h-1.5 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]}`} />
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">{cls.name}</h3>
                      <p className="text-white/40 text-sm mt-0.5">{cls.programs?.name ?? '—'}</p>
                      {cls.portal_users?.full_name && (
                        <p className="text-white/30 text-xs mt-0.5">Teacher: {cls.portal_users.full_name}</p>
                      )}
                    </div>
                    <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${cls.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      cls.status === 'scheduled' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        cls.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          'bg-white/10 text-white/40'
                      }`}>{cls.status}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-white/50">
                    {cls.start_date && (
                      <div className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> {new Date(cls.start_date).toLocaleDateString()}</div>
                    )}
                    {cls.max_students && (
                      <div className="flex items-center gap-2"><UserGroupIcon className="w-4 h-4" /> Max {cls.max_students}</div>
                    )}
                    {cls.current_students !== undefined && (
                      <div className="flex items-center gap-2"><ChartBarIcon className="w-4 h-4" /> {cls.current_students} enrolled</div>
                    )}
                    {cls.schedule && (
                      <div className="flex items-center gap-2"><ClockIcon className="w-4 h-4" /> {cls.schedule}</div>
                    )}
                  </div>

                  {cls.description && (
                    <p className="text-white/40 text-xs mb-4 line-clamp-2">{cls.description}</p>
                  )}

                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/classes/${cls.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors">
                      <EyeIcon className="w-4 h-4" /> View
                    </Link>
                    <Link href={`/dashboard/classes/${cls.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                      <PencilIcon className="w-4 h-4" /> Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(cls.id, cls.name)}
                      disabled={deleting === cls.id}
                      className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors disabled:opacity-40">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-amber-400" /> Quick Actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Add New Class', icon: VideoCameraIcon, color: 'bg-blue-600 hover:bg-blue-700', href: '/dashboard/classes/add' },
              { label: 'Create Assignment', icon: DocumentTextIcon, color: 'bg-violet-600 hover:bg-violet-700', href: '/dashboard/assignments' },
              { label: 'View Progress', icon: ChartBarIcon, color: 'bg-emerald-600 hover:bg-emerald-700', href: '/dashboard/progress' },
              { label: 'Lesson Plans', icon: BookOpenIcon, color: 'bg-amber-600 hover:bg-amber-700', href: '/dashboard/lessons' },
            ].map((a) => (
              <Link key={a.label} href={a.href}
                className={`flex items-center gap-2 px-4 py-3 ${a.color} text-white font-semibold text-sm rounded-xl transition-all hover:scale-[1.02]`}>
                <a.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}