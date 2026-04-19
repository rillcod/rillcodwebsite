// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, PlusIcon, PencilIcon, TrashIcon,
  CheckCircleIcon, ClockIcon, BanknotesIcon,
  UserGroupIcon, BookOpenIcon, MagnifyingGlassIcon,
  ArrowRightIcon,
} from '@/lib/icons';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

export default function ProgramsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [courseCounts, setCourseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<string>('all');
  
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_weeks: '',
    difficulty_level: 'beginner',
    price: '',
    max_students: '',
    is_active: true,
    delivery_type: 'compulsory',
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === 'admin';

  async function load() {
    setLoading(true); setError(null);
    try {
      const progRes = await fetch('/api/programs', { cache: 'no-store' });
      const progJson = await progRes.json();
      if (!progRes.ok) throw new Error(progJson.error || 'Failed to load');
      const programList = progJson.data ?? [];
      setPrograms(programList);
      // /api/programs already returns nested courses[] — use those for counts
      const counts: Record<string, number> = {};
      programList.forEach((p: any) => {
        counts[p.id] = Array.isArray(p.courses) ? p.courses.length : 0;
      });
      setCourseCounts(counts);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
  }, [profile?.id, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        duration_weeks: form.duration_weeks ? parseInt(form.duration_weeks) : null,
        difficulty_level: form.difficulty_level,
        price: form.price ? parseFloat(form.price) : null,
        max_students: form.max_students ? parseInt(form.max_students) : null,
        is_active: form.is_active,
        delivery_type: form.delivery_type,
      };

      if (editing) {
        const res = await fetch(`/api/programs/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Update failed'); }
      } else {
        const res = await fetch('/api/programs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Create failed'); }
      }
      await load();
      setShowForm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      duration_weeks: p.duration_weeks?.toString() ?? '',
      difficulty_level: p.difficulty_level ?? 'beginner',
      price: p.price?.toString() ?? '',
      max_students: p.max_students?.toString() ?? '',
      is_active: p.is_active,
      delivery_type: p.delivery_type ?? 'compulsory',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete program "${name}"? This will delete all associated courses.`)) return;
    try {
      const res = await fetch(`/api/programs/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
      setPrograms(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const DIFF_COLORS: Record<string, string> = {
    beginner: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    intermediate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    advanced: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };

  const filtered = programs.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase());
    const matchDiff = diffFilter === 'all' || p.difficulty_level === diffFilter;
    return matchSearch && matchDiff;
  });

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isAdmin && profile?.role !== 'teacher' && profile?.role !== 'school') return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Academics</span>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">Programs &amp; Courses</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure learning programs and their course structure</p>
          </div>
          {isAdmin && (
            <button onClick={() => { setEditing(null); setForm({ name: '', description: '', duration_weeks: '', difficulty_level: 'beginner', price: '', max_students: '', is_active: true, delivery_type: 'compulsory' }); setShowForm(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm rounded-none transition-all shadow-lg shadow-orange-900/30">
              <PlusIcon className="w-4 h-4" /> New Program
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-4 text-rose-400 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Programs', value: programs.length, icon: AcademicCapIcon, color: 'text-orange-400', bg: 'bg-orange-500/10' },
            { label: 'Active', value: programs.filter(p => p.is_active).length, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Total Slots', value: programs.reduce((s, p) => s + (p.max_students || 0), 0), icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Avg Value', value: programs.length ? `₦${(programs.reduce((s, p) => s + (Number(p.price) || 0), 0) / programs.length).toLocaleString()}` : '—', icon: BanknotesIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-none flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative max-w-md flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search programs…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'beginner', 'intermediate', 'advanced'].map(d => (
              <button key={d} onClick={() => setDiffFilter(d)}
                className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest border rounded-none transition-all ${
                  diffFilter === d
                    ? d === 'all' ? 'bg-orange-600 text-foreground border-orange-600'
                      : d === 'beginner' ? 'bg-emerald-600 text-foreground border-emerald-600'
                      : d === 'intermediate' ? 'bg-amber-600 text-foreground border-amber-600'
                      : 'bg-rose-600 text-foreground border-rose-600'
                    : 'bg-card text-muted-foreground border-border hover:text-foreground'
                }`}>
                {d === 'all' ? 'All Levels' : d}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
            <AcademicCapIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-semibold text-lg">No programs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(p => (
              <div key={p.id} className="bg-card shadow-sm border border-border rounded-none flex flex-col hover:border-orange-500/30 transition-all group">
                {/* Color bar by difficulty */}
                <div className={`h-1 w-full ${p.difficulty_level === 'beginner' ? 'bg-emerald-500' : p.difficulty_level === 'intermediate' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${p.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                        {p.is_active ? 'Active' : 'Draft'}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border capitalize ${DIFF_COLORS[p.difficulty_level] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {p.difficulty_level}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${p.delivery_type === 'optional' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                        {p.delivery_type === 'optional' ? 'Elective' : 'Compulsory'}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(p)} className="p-1.5 bg-card shadow-sm hover:bg-muted rounded-none transition-colors">
                          <PencilIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-none transition-colors">
                          <TrashIcon className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-orange-400 transition-colors">{p.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-5 flex-1">{p.description?.split('→')[0]?.split('Prerequisite')[0]?.trim() || 'No description.'}</p>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-background rounded-none p-2.5 text-center border border-border">
                      <p className="text-base font-black text-orange-400">{courseCounts[p.id] ?? 0}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Courses</p>
                    </div>
                    <div className="bg-background rounded-none p-2.5 text-center border border-border">
                      <p className="text-base font-black text-foreground">{p.duration_weeks ?? '—'}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Weeks</p>
                    </div>
                    <div className="bg-background rounded-none p-2.5 text-center border border-border">
                      <p className="text-base font-black text-foreground">{p.max_students ?? '∞'}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Slots</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                    <p className="text-lg font-black text-orange-400">₦{(p.price || 0).toLocaleString()}</p>
                    <Link
                      href={`/dashboard/courses?program=${p.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-none transition-all"
                    >
                      <BookOpenIcon className="w-3.5 h-3.5" /> View Courses <ArrowRightIcon className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-background border border-border rounded-none p-6 sm:p-8 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-foreground">{editing ? 'Edit Program' : 'New Program'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-none hover:bg-muted">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Program Name</label>
                <input required value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Creative Robotics & AI Masterclass"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
                  placeholder="Overview of the program curriculum..."
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Duration (Weeks)</label>
                  <input type="number" value={form.duration_weeks} onChange={e => setForm(s => ({ ...s, duration_weeks: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Difficulty</label>
                  <select value={form.difficulty_level} onChange={e => setForm(s => ({ ...s, difficulty_level: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none">
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Price (₦)</label>
                  <input type="number" step="0.01" value={form.price} onChange={e => setForm(s => ({ ...s, price: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Max Students</label>
                  <input type="number" value={form.max_students} onChange={e => setForm(s => ({ ...s, max_students: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Delivery Type</label>
                <select value={form.delivery_type} onChange={e => setForm(s => ({ ...s, delivery_type: e.target.value }))}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none">
                  <option value="compulsory">Compulsory — structured lessons &amp; assessments</option>
                  <option value="optional">Elective / Optional — project-based, self-directed modules</option>
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer pt-2">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
                        className="w-5 h-5 rounded border-border bg-card shadow-sm text-orange-600 focus:ring-orange-500" />
                <span className="text-sm font-semibold text-muted-foreground border-orange-500">Program is active currently</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 text-muted-foreground hover:text-foreground font-bold transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-foreground font-black rounded-none transition-all shadow-lg shadow-orange-900/40">
                  {saving ? 'Saving...' : editing ? 'Update Program' : 'Create Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
