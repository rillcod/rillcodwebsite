'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  SparklesIcon
} from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';

type RegistryRow = {
  id: string;
  school_id: string | null;
  program_id: string | null;
  course_id: string | null;
  project_key: string;
  title: string;
  track: string;
  concept_tags: string[];
  difficulty_level: number;
  classwork_prompt: string | null;
  estimated_minutes: number | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
};

type EditState = {
  id: string;
  title: string;
  track: string;
  difficulty_level: number;
  estimated_minutes: number;
  classwork_prompt: string;
  concept_tags: string;
  is_active: boolean;
};

const TRACK_OPTIONS: { value: string; label: string }[] = [
  { value: 'young_innovator', label: 'Young Innovator' },
  { value: 'python', label: 'Python Programming' },
  { value: 'html_css', label: 'HTML & CSS (Web Design)' },
  { value: 'jss_web_app', label: 'JSS Web App' },
  { value: 'jss_python', label: 'JSS Python' },
  { value: 'ss_uiux_mobile', label: 'SS UI/UX & Mobile' },
  { value: 'mixed', label: 'Mixed / General' },
  { value: 'scratch', label: 'Scratch (Beginners)' },
  { value: 'intro_ai_tools', label: 'Intro to AI Tools' },
];

export default function ProjectRegistryPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('');
  const [programId, setProgramId] = useState('');
  const [seedSourceFilter, setSeedSourceFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    program_id: '',
    course_id: '',
    project_key: '',
    title: '',
    track: 'python',
    concept_tags: '',
    difficulty_level: 1,
    estimated_minutes: 45,
    classwork_prompt: '',
  });

  async function loadRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (trackFilter) params.set('track', trackFilter);
      if (programId) params.set('program_id', programId);
      if (seedSourceFilter) params.set('seed_source', seedSourceFilter);
      const res = await fetch(`/api/curriculum-projects?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Load failed');
      setRows((json.data ?? []) as RegistryRow[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadRows();
  }, [canView, trackFilter, programId, seedSourceFilter]);

  const seedSourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const source = row.metadata && typeof row.metadata === 'object'
        ? (row.metadata.seed_source as string | undefined)
        : undefined;
      if (source && source.trim()) set.add(source.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  async function createItem() {
    if (!createForm.title || !createForm.project_key) {
      toast.error('Title and Project Key are required');
      return;
    }
    setCreateBusy(true);
    try {
      const payload = {
        program_id: createForm.program_id || null,
        course_id: createForm.course_id || null,
        project_key: createForm.project_key,
        title: createForm.title,
        track: createForm.track,
        concept_tags: createForm.concept_tags
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        difficulty_level: createForm.difficulty_level,
        estimated_minutes: createForm.estimated_minutes,
        classwork_prompt: createForm.classwork_prompt || null,
      };
      const res = await fetch('/api/curriculum-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      toast.success('Activity blueprint vaulted successfully');
      setShowCreate(false);
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Vaulting failed');
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const res = await fetch(`/api/curriculum-projects/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editing.title,
          track: editing.track,
          difficulty_level: editing.difficulty_level,
          estimated_minutes: editing.estimated_minutes,
          classwork_prompt: editing.classwork_prompt || null,
          concept_tags: editing.concept_tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          is_active: editing.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      toast.success('Vault entry updated');
      setEditing(null);
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function deleteRow(id: string) {
    setDeleteBusyId(id);
    try {
      const res = await fetch(`/api/curriculum-projects/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Blueprint purged from vault');
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Purge failed');
    } finally {
      setDeleteBusyId(null);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Access</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12 pb-32">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3.5rem] p-10 sm:p-16 shadow-2xl">
        <div className="absolute top-0 right-0 w-[50rem] h-[50rem] bg-violet-600/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-blue-600/10 rounded-full blur-[120px] -ml-48 -mb-48 pointer-events-none" />

        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Controls
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
              <SparklesIcon className="w-6 h-6 text-primary" />
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight">Creative Asset Vault</h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-2xl">
              Master repository for AI-injected activities. Curate and scale high-fidelity
              project blueprints that define the hands-on learning experience.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="group relative px-10 py-5 text-[11px] font-black uppercase tracking-[0.3em] rounded-[1.5rem] bg-primary text-white shadow-[0_20px_50px_rgba(124,58,237,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 shrink-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <PlusIcon className="w-5 h-5" /> Construct New Activity
          </button>
        </div>
      </div>

      {/* Filter & Intelligence Bar */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center px-4">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 bg-card/30 backdrop-blur-3xl border border-border p-4 rounded-[2.5rem] shadow-xl">
          <select
            title="Filter by track"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:border-primary transition-all shadow-inner appearance-none"
          >
            <option value="">All Academic Tracks</option>
            {TRACK_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            title="Filter by source"
            value={seedSourceFilter}
            onChange={(e) => setSeedSourceFilter(e.target.value)}
            className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:border-primary transition-all shadow-inner appearance-none"
          >
            <option value="">All Origin Sources</option>
            {seedSourceOptions.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="p-6 rounded-[2rem] bg-card border border-border hover:border-primary/50 transition-all shadow-2xl flex items-center justify-center group"
        >
          <ArrowPathIcon className={`w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Vault Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10 px-4">
        {rows.map((row) => (
          <div key={row.id} className="group relative flex flex-col bg-card border border-border rounded-[3.5rem] overflow-hidden hover:border-primary/50 transition-all duration-700 shadow-2xl hover:shadow-[0_40px_100px_rgba(124,58,237,0.1)]">
            {/* Status Line */}
            <div className={`h-2 w-full transition-all duration-1000 ${row.is_active ? 'bg-gradient-to-r from-primary via-violet-500 to-primary bg-[length:200%_auto] animate-gradient' : 'bg-rose-500/50'}`} />

            <div className="p-10 flex-1 flex flex-col space-y-8">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-xl bg-primary/10 text-[9px] font-black uppercase tracking-[0.2em] text-primary border border-primary/20 shadow-sm">
                      {TRACK_OPTIONS.find(t => t.value === row.track)?.label ?? row.track}
                    </span>
                    {!row.is_active && (
                      <span className="px-3 py-1 rounded-xl bg-rose-500/10 text-[9px] font-black uppercase tracking-[0.2em] text-rose-400 border border-rose-500/20 shadow-sm">
                        Archived
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-foreground tracking-tight leading-tight group-hover:text-primary transition-colors duration-500">{row.title}</h3>
                </div>
                <div className="flex flex-col items-end shrink-0 text-right space-y-1">
                  <span className="text-lg font-black text-foreground tracking-tighter tabular-nums">LVL {row.difficulty_level}</span>
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">{row.estimated_minutes} MINS</span>
                </div>
              </div>

              <p className="text-base text-muted-foreground line-clamp-4 leading-relaxed italic opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                {row.classwork_prompt || "No project brief provided in blueprint."}
              </p>

              <div className="flex flex-wrap gap-3">
                {(row.concept_tags ?? []).slice(0, 3).map(tag => (
                  <span key={tag} className="px-4 py-1.5 rounded-full bg-muted/20 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:border-primary/20 transition-all duration-500">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="pt-8 flex items-center justify-between border-t border-border/50 mt-auto">
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">Vault Key</span>
                  <span className="text-[11px] font-black text-foreground font-mono bg-muted/30 px-3 py-1 rounded-lg border border-border/50 shadow-inner group-hover:text-primary transition-colors">{row.project_key}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    title="Modify Blueprint"
                    onClick={() => setEditing({
                      id: row.id,
                      title: row.title,
                      track: row.track,
                      difficulty_level: row.difficulty_level,
                      estimated_minutes: row.estimated_minutes ?? 45,
                      classwork_prompt: row.classwork_prompt ?? '',
                      concept_tags: (row.concept_tags ?? []).join(', '),
                      is_active: row.is_active,
                    })}
                    className="p-4 rounded-2xl border border-border bg-background hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all duration-500 shadow-sm"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                  <button
                    title="Purge from Vault"
                    disabled={deleteBusyId === row.id}
                    onClick={() => {
                      if (window.confirm(`Permanently purge "${row.title}" from the Creative Asset Vault? This cannot be undone.`)) {
                        void deleteRow(row.id);
                      }
                    }}
                    className="p-4 rounded-2xl border border-border bg-background hover:bg-rose-500/5 hover:text-rose-400 hover:border-rose-500/30 transition-all duration-500 shadow-sm disabled:opacity-50"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && !loading && (
        <div className="py-40 text-center space-y-8 bg-card border-2 border-dashed border-border rounded-[4rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <div className="w-24 h-24 bg-muted/10 rounded-[2.5rem] flex items-center justify-center mx-auto border border-border shadow-inner relative z-10">
            <ArchiveBoxIcon className="w-12 h-12 text-muted-foreground/20" />
          </div>
          <div className="space-y-3 relative z-10">
            <p className="text-3xl font-black text-foreground tracking-tighter">Vault Empty</p>
            <p className="text-lg text-muted-foreground max-w-md mx-auto italic">
              No activity blueprints found. Start building your creative asset library
              by constructing a new mission.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="relative z-10 px-10 py-5 bg-primary text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.05] transition-all">
            Construct First Mission
          </button>
        </div>
      )}

      {/* Creative Mission Brief Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto p-10 sm:p-16 shadow-[0_50px_150px_rgba(0,0,0,0.5)] relative animate-in zoom-in-95 duration-500">
            <button onClick={() => setShowCreate(false)} className="absolute top-10 right-10 p-4 rounded-full bg-muted/50 hover:bg-rose-500 hover:text-white transition-all duration-500 group">
              <XMarkIcon className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>

            <div className="space-y-4 mb-14">
              <h2 className="text-5xl font-black tracking-tighter text-primary">Creative Mission Brief</h2>
              <p className="text-xl text-muted-foreground italic">Define the specification for a new high-fidelity learning mission.</p>
            </div>

            <div className="space-y-12">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Mission Concept / Activity Title</label>
                <input
                  placeholder="e.g. Building an AI-Powered Smart Home Assistant"
                  value={createForm.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setCreateForm((f) => ({
                      ...f,
                      title,
                      project_key: f.project_key || title.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
                    }));
                  }}
                  className="w-full px-10 py-6 bg-background border border-border rounded-[2.5rem] font-black text-2xl focus:border-primary outline-none transition-all shadow-inner placeholder:text-muted-foreground/20"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Mission Track</label>
                  <select value={createForm.track} onChange={(e) => setCreateForm((f) => ({ ...f, track: e.target.value }))} className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none appearance-none cursor-pointer shadow-sm focus:border-primary transition-all">
                    {TRACK_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-4">Complexity (1-10)</label>
                    <input type="number" min={1} max={10} value={createForm.difficulty_level} onChange={(e) => setCreateForm((f) => ({ ...f, difficulty_level: Number(e.target.value) }))} className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black focus:border-primary outline-none text-center shadow-sm transition-all" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-4">Duration (Min)</label>
                    <input type="number" step={15} value={createForm.estimated_minutes} onChange={(e) => setCreateForm((f) => ({ ...f, estimated_minutes: Number(e.target.value) }))} className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black focus:border-primary outline-none text-center shadow-sm transition-all" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Mission Impact & Pedagogical Brief</label>
                <textarea rows={6} placeholder="What will the student build? What is the impact? Provide the core mission prompt for the learning engine..." value={createForm.classwork_prompt} onChange={(e) => setCreateForm((f) => ({ ...f, classwork_prompt: e.target.value }))} className="w-full px-10 py-8 bg-background border border-border rounded-[2.5rem] font-medium text-lg leading-relaxed focus:border-primary outline-none transition-all italic shadow-inner placeholder:text-muted-foreground/20" />
              </div>

              <div className="p-10 bg-muted/20 rounded-[3.5rem] border border-border space-y-8 shadow-inner">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground text-center opacity-50">System Calibration</p>
                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-4">Vault Key</label>
                    <input value={createForm.project_key} onChange={(e) => setCreateForm((f) => ({ ...f, project_key: e.target.value.toUpperCase() }))} className="w-full px-6 py-4 bg-background border border-border rounded-2xl font-mono text-xs font-black outline-none focus:border-primary shadow-sm" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-4">Program Scope</label>
                    <input placeholder="e.g. CS_FOUNDATION" value={createForm.program_id} onChange={(e) => setCreateForm((f) => ({ ...f, program_id: e.target.value.toUpperCase() }))} className="w-full px-6 py-4 bg-background border border-border rounded-2xl font-black text-xs uppercase tracking-[0.2em] outline-none focus:border-primary shadow-sm" />
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => void createItem()} disabled={createBusy} className="group relative w-full mt-14 py-6 bg-primary text-white rounded-[2.5rem] font-black uppercase tracking-[0.4em] shadow-[0_30px_70px_rgba(124,58,237,0.4)] disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {createBusy ? 'Vaulting Specification...' : 'Seal Mission in Vault'}
            </button>
          </div>
        </div>
      )}

      {/* Editing Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[4rem] w-full max-w-3xl p-10 sm:p-16 shadow-2xl relative animate-in zoom-in-95 duration-500">
            <button onClick={() => setEditing(null)} className="absolute top-10 right-10 p-4 rounded-full bg-muted/50 hover:bg-rose-500 hover:text-white transition-all duration-500 group">
              <XMarkIcon className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>

            <div className="space-y-4 mb-14">
              <h2 className="text-4xl font-black tracking-tighter">Modify Blueprint</h2>
              <p className="text-lg text-muted-foreground italic">Adjust the structural data for this creative asset.</p>
            </div>

            <div className="space-y-10 mb-14">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Title</label>
                <input value={editing.title} onChange={(e) => setEditing(p => p ? { ...p, title: e.target.value } : p)} className="w-full px-10 py-6 bg-background border border-border rounded-[2.5rem] font-black text-2xl outline-none focus:border-primary transition-all shadow-inner" />
              </div>
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Track</label>
                  <select value={editing.track} onChange={(e) => setEditing(p => p ? { ...p, track: e.target.value } : p)} className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none appearance-none shadow-sm focus:border-primary transition-all">
                    {TRACK_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Complexity</label>
                  <input type="number" min={1} max={10} value={editing.difficulty_level} onChange={(e) => setEditing(p => p ? { ...p, difficulty_level: Number(e.target.value) } : p)} className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black outline-none focus:border-primary transition-all shadow-sm text-center" />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Pedagogical Brief</label>
                <textarea rows={5} value={editing.classwork_prompt} onChange={(e) => setEditing(p => p ? { ...p, classwork_prompt: e.target.value } : p)} className="w-full px-10 py-8 bg-background border border-border rounded-[2.5rem] font-medium text-lg leading-relaxed outline-none focus:border-primary transition-all shadow-inner italic" />
              </div>
              <label className="flex items-center gap-6 p-8 bg-muted/20 border border-border rounded-[2.5rem] cursor-pointer hover:border-primary transition-all group shadow-inner">
                <input type="checkbox" className="w-8 h-8 rounded-xl border-border text-primary focus:ring-primary shadow-sm" checked={editing.is_active} onChange={(e) => setEditing(p => p ? { ...p, is_active: e.target.checked } : p)} />
                <div className="flex flex-col space-y-1">
                  <span className="text-xl font-black uppercase tracking-widest text-foreground group-hover:text-primary transition-colors">Blueprint Status: {editing.is_active ? 'Active' : 'Archived'}</span>
                  <span className="text-sm text-muted-foreground italic">When active, this blueprint is available for curriculum injection.</span>
                </div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              <button onClick={() => void saveEdit()} className="flex-[2] py-6 bg-primary text-white rounded-[2rem] font-black uppercase tracking-[0.4em] shadow-[0_30px_70px_rgba(124,58,237,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]">
                Commit Changes
              </button>
              <button onClick={() => setEditing(null)} className="flex-1 py-6 border-2 border-border rounded-[2rem] font-black uppercase tracking-[0.4em] text-muted-foreground hover:bg-muted/50 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

