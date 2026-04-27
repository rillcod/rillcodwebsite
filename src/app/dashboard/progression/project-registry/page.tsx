'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PlusIcon, PencilIcon, TrashIcon, ArrowPathIcon, ArrowLeftIcon } from '@/lib/icons';
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
      toast.error(err instanceof Error ? err.message : 'Failed to load project registry');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadRows();
  }, [canView, trackFilter, programId, seedSourceFilter]);

  const trackCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.track, (map.get(row.track) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

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
    setCreateBusy(true);
    try {
      const payload = {
        program_id: createForm.program_id,
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
      toast.success('Registry item created');
      setShowCreate(false);
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
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
      toast.success('Registry item updated');
      setEditing(null);
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function deleteRow(id: string) {
    const ok = window.confirm('Delete this registry item? This action cannot be undone.');
    if (!ok) return;
    setDeleteBusyId(id);
    try {
      const res = await fetch(`/api/curriculum-projects/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Registry item deleted');
      await loadRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusyId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> Back to LMS Settings
        </Link>
        <h1 className="text-xl font-black text-card-foreground">Project Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          These are the hands-on project ideas the AI picks from when generating lesson plans.
          Each one has a topic, difficulty level, and a prompt that tells the AI what the project should involve.
          You can add your own, edit existing ones, or deactivate ones you don&apos;t want used.
        </p>
        <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-300 leading-relaxed">
          <span className="font-black">When does this matter?</span> When you generate a lesson plan and it includes a project week,
          the AI pulls from this list. If you want specific project types for your school or program, add them here first.
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Track</label>
          <select
            title="Filter by track"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs"
          >
            <option value="">All subject tracks</option>
            {TRACK_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Program ID</label>
          <input
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs min-w-[240px]"
            placeholder="Filter by program id"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Seed source</label>
          <select
            title="Filter by seed source"
            value={seedSourceFilter}
            onChange={(e) => setSeedSourceFilter(e.target.value)}
            className="block mt-1 px-3 py-2 bg-background border border-border rounded-xl text-xs min-w-[220px]"
          >
            <option value="">All seed sources</option>
            <option value="grade_specific_v1">grade_specific_v1</option>
            <option value="incremental_topic_map">incremental_topic_map</option>
            <option value="platform_default">platform_default</option>
            <option value="platform_jss_ss">platform_jss_ss</option>
            {seedSourceOptions
              .filter((source) => !['grade_specific_v1', 'incremental_topic_map', 'platform_default', 'platform_jss_ss'].includes(source))
              .map((source) => (
              <option key={source} value={source}>{source}</option>
              ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary"
        >
          <PlusIcon className="w-4 h-4" /> {showCreate ? 'Close create' : 'Create row'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-sm font-black">Add a new project template</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project title *</label>
              <input placeholder="e.g. Build a weather app" value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject track *</label>
              <select title="Track" value={createForm.track} onChange={(e) => setCreateForm((f) => ({ ...f, track: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm">
                {TRACK_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unique key * (no spaces)</label>
              <input placeholder="e.g. weather_app_v1" value={createForm.project_key} onChange={(e) => setCreateForm((f) => ({ ...f, project_key: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Difficulty (1 = easy, 10 = hard)</label>
              <input type="number" min={1} max={10} title="Difficulty level" value={createForm.difficulty_level} onChange={(e) => setCreateForm((f) => ({ ...f, difficulty_level: Math.min(10, Math.max(1, Number(e.target.value || 1))) }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estimated time (minutes)</label>
              <input type="number" min={1} title="Estimated minutes" value={createForm.estimated_minutes} onChange={(e) => setCreateForm((f) => ({ ...f, estimated_minutes: Math.max(1, Number(e.target.value || 1)) }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Topics covered (comma-separated)</label>
              <input placeholder="e.g. APIs, JSON, fetch" value={createForm.concept_tags} onChange={(e) => setCreateForm((f) => ({ ...f, concept_tags: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm" />
            </div>
            <div className="space-y-1 lg:col-span-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">What students will do (the AI uses this as the project brief)</label>
              <textarea placeholder="e.g. Students will build a simple weather app using a public API, display temperature and conditions, and style it with CSS." value={createForm.classwork_prompt} onChange={(e) => setCreateForm((f) => ({ ...f, classwork_prompt: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm min-h-20" />
            </div>
          </div>
          <button type="button" disabled={createBusy} onClick={() => void createItem()} className="px-4 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-60">
            {createBusy ? 'Saving...' : 'Save project template'}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs text-muted-foreground mb-3">
          Total rows: <span className="font-bold text-foreground">{rows.length}</span>
          {' · '}
          Tracks: {trackCounts.map(([track, count]) => `${track} (${count})`).join(', ') || 'none'}
        </p>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="border border-border rounded-xl p-3 bg-background/50">
              {editing?.id === row.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <input title="Project title" value={editing.title} onChange={(e) => setEditing((p) => (p ? { ...p, title: e.target.value } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs lg:col-span-2" />
                  <select title="Subject track" value={editing.track} onChange={(e) => setEditing((p) => (p ? { ...p, track: e.target.value } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs">
                    {TRACK_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input title="Difficulty level" type="number" min={1} max={10} value={editing.difficulty_level} onChange={(e) => setEditing((p) => (p ? { ...p, difficulty_level: Math.max(1, Math.min(10, Number(e.target.value || 1))) } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs" />
                  <input title="Estimated minutes" type="number" min={1} value={editing.estimated_minutes} onChange={(e) => setEditing((p) => (p ? { ...p, estimated_minutes: Math.max(1, Number(e.target.value || 1)) } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs" />
                  <input title="Topics covered" placeholder="Topics (comma-separated)" value={editing.concept_tags} onChange={(e) => setEditing((p) => (p ? { ...p, concept_tags: e.target.value } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs lg:col-span-2" />
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing((p) => (p ? { ...p, is_active: e.target.checked } : p))} />
                    Active
                  </label>
                  <textarea title="Project brief" value={editing.classwork_prompt} onChange={(e) => setEditing((p) => (p ? { ...p, classwork_prompt: e.target.value } : p))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs min-h-16 lg:col-span-4" />
                  <div className="flex gap-2 lg:col-span-4">
                    <button onClick={() => void saveEdit()} className="px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500">Save</button>
                    <button onClick={() => setEditing(null)} className="px-3 py-2 text-xs font-bold border border-border rounded-lg hover:bg-muted/30">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-foreground">{row.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.project_key} · {TRACK_OPTIONS.find(t => t.value === row.track)?.label ?? row.track} · Difficulty {row.difficulty_level}/10 · {row.estimated_minutes ?? '-'} min
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Program: {row.program_id ?? '-'} · Course: {row.course_id ?? '-'} · Active: {row.is_active ? 'yes' : 'no'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Seed source: {typeof row.metadata?.seed_source === 'string' ? row.metadata.seed_source : '-'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing({
                          id: row.id,
                          title: row.title,
                          track: row.track,
                          difficulty_level: row.difficulty_level,
                          estimated_minutes: row.estimated_minutes ?? 1,
                          classwork_prompt: row.classwork_prompt ?? '',
                          concept_tags: (row.concept_tags ?? []).join(', '),
                          is_active: row.is_active,
                        })}
                        className="px-2 py-1.5 text-xs font-bold border border-border rounded-lg hover:bg-muted/30 inline-flex items-center gap-1"
                      >
                        <PencilIcon className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteBusyId === row.id}
                        onClick={() => void deleteRow(row.id)}
                        className="px-2 py-1.5 text-xs font-bold border border-rose-500/40 text-rose-300 rounded-lg hover:bg-rose-500/10 inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        <TrashIcon className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                  {row.classwork_prompt && <p className="text-xs text-muted-foreground">{row.classwork_prompt}</p>}
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No registry rows for this filter.</p>}
        </div>
      </div>

      <details className="bg-card border border-border rounded-2xl p-4">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
          Advanced details
        </summary>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>Database: <code>public.curriculum_project_registry</code></p>
          <p>API: <code>GET/POST /api/curriculum-projects</code>, <code>GET/PATCH/DELETE /api/curriculum-projects/[id]</code></p>
          <p>Seed filter field: <code>metadata.seed_source</code></p>
        </div>
      </details>
    </div>
  );
}
