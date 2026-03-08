'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  PlusIcon, TrashIcon, LinkIcon,
  CodeBracketIcon, RocketLaunchIcon, SparklesIcon, XMarkIcon,
  PaintBrushIcon, ArrowDownTrayIcon, CloudArrowUpIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  project_url?: string;
  image_url?: string;
  category: string;
  created_at: string;
}

const CATEGORIES = ['All', 'Coding', 'Robotics', 'Web Design', 'AI/ML', 'IoT', 'Game Dev', 'Art'];
const CAT_COLORS: Record<string, string> = {
  Coding: 'bg-violet-500/20 text-violet-400',
  Robotics: 'bg-orange-500/20 text-orange-400',
  'Web Design': 'bg-blue-500/20 text-blue-400',
  'AI/ML': 'bg-emerald-500/20 text-emerald-400',
  IoT: 'bg-yellow-500/20 text-yellow-400',
  'Game Dev': 'bg-pink-500/20 text-pink-400',
  Art: 'bg-rose-500/20 text-rose-400',
};

// ─── Canvas Drawing Component ─────────────────────────────
const PALETTE = ['#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#000000'];
const BRUSHES = [2, 6, 12, 20];

function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState('#a855f7');
  const [brush, setBrush] = useState(6);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    setDrawing(true);
    const pos = getPos(e, canvas);
    lastPos.current = pos;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brush / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#1e1e2e' : color;
    ctx.fill();
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = tool === 'eraser' ? '#1e1e2e' : color;
      ctx.lineWidth = brush;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPos.current = pos;
  }

  function stopDraw() { setDrawing(false); lastPos.current = null; }

  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function downloadCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png');
    a.download = 'my-artwork.png'; a.click();
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PaintBrushIcon className="w-4 h-4 text-pink-400" />
          <span className="text-white font-bold text-sm">Creative Canvas 🎨</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {PALETTE.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-5 h-5 rounded-full border-2 transition-all ${color === c && tool === 'pen' ? 'border-white scale-125' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-1 items-center">
            {BRUSHES.map(b => (
              <button key={b} onClick={() => setBrush(b)}
                className={`rounded-full bg-white transition-all ${brush === b ? 'opacity-100 ring-2 ring-violet-400' : 'opacity-30'}`}
                style={{ width: b + 4, height: b + 4 }} />
            ))}
          </div>
          <button onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${tool === 'eraser' ? 'bg-rose-500/30 text-rose-400' : 'bg-white/5 text-white/40 hover:text-white'}`}>
            Eraser
          </button>
          <button onClick={clearCanvas} className="px-2 py-1 rounded-lg text-xs text-white/30 hover:text-white bg-white/5 transition-colors">Clear</button>
          <button onClick={downloadCanvas} className="p-1.5 text-white/30 hover:text-emerald-400 transition-colors" title="Download">
            <ArrowDownTrayIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="w-full touch-none cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <div className="px-4 py-2 border-t border-white/5">
        <p className="text-white/20 text-[10px]">Draw your ideas, sketches, and robot designs here! 🤖</p>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────
function ProjectCard({ project, onDelete, saving }: { project: Project; onDelete: () => void; saving: boolean }) {
  const catColor = CAT_COLORS[project.category] ?? 'bg-white/10 text-white/40';
  return (
    <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all group">
      <div className="h-36 bg-gradient-to-br from-[#1a2b54] to-[#0d1526] flex items-center justify-center relative overflow-hidden">
        {project.image_url
          ? <img src={project.image_url} alt={project.title} className="w-full h-full object-cover" />
          : <RocketLaunchIcon className="w-12 h-12 text-white/10" />}
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onDelete} disabled={saving}
            className="p-1.5 bg-rose-500/80 rounded-lg text-white hover:bg-rose-500 transition-colors disabled:opacity-40">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catColor}`}>{project.category}</span>
          {project.tags.map(t => (
            <span key={t} className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
        <h3 className="text-white font-bold text-sm">{project.title}</h3>
        <p className="text-white/40 text-xs mt-1 line-clamp-2">{project.description}</p>
        {project.project_url && (
          <a href={project.project_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-violet-400 text-xs mt-3 hover:text-violet-300 transition-colors">
            <LinkIcon className="w-3.5 h-3.5" /> View Project
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Add Project Modal ────────────────────────────────────
function AddProjectModal({ onSave, onClose, saving }: {
  onSave: (p: Omit<Project, 'id' | 'created_at'>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ title: '', description: '', category: 'Coding', project_url: '', image_url: '', tags: '' });

  function save() {
    if (!form.title.trim()) return;
    onSave({
      title: form.title,
      description: form.description,
      category: form.category,
      project_url: form.project_url,
      image_url: form.image_url,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-white font-black">Add Project</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <input placeholder="Project title *" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm" />
          <textarea placeholder="What did you build? What does it do?" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm resize-none" />
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-violet-500 text-sm">
            {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Tags (comma separated): python, arduino, game" value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm" />
          <input placeholder="Project URL (GitHub, demo link...)" value={form.project_url}
            onChange={e => setForm(f => ({ ...f, project_url: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm" />
          <input placeholder="Image URL (optional)" value={form.image_url}
            onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm" />
        </div>
        <div className="flex gap-3 p-5 border-t border-white/10">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 text-white/60 font-bold rounded-xl hover:bg-white/10 transition-colors text-sm">Cancel</button>
          <button onClick={save} disabled={!form.title.trim() || saving}
            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors text-sm">
            {saving ? 'Saving…' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function PortfolioPage() {
  const { profile, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [catFilter, setCatFilter] = useState('All');
  const [tab, setTab] = useState<'projects' | 'canvas'>('projects');

  // ── Load from Supabase; fall back to localStorage if table not ready ──
  useEffect(() => {
    if (!profile) return;
    const db = createClient();
    db.from('portfolio_projects')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          // Table may not exist yet in remote DB — fall back to localStorage
          const saved = localStorage.getItem(`portfolio_${profile.id}`);
          if (saved) setProjects(JSON.parse(saved));
        } else {
          setProjects((data ?? []).map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description ?? '',
            tags: r.tags ?? [],
            project_url: r.project_url ?? '',
            image_url: r.image_url ?? '',
            category: r.category,
            created_at: r.created_at,
          })));
        }
        setLoading(false);
      });
  }, [profile?.id]); // eslint-disable-line

  // ── Add project to Supabase ──
  const addProject = useCallback(async (data: Omit<Project, 'id' | 'created_at'>) => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    const db = createClient();
    const { data: inserted, error } = await db
      .from('portfolio_projects')
      .insert({
        user_id: profile.id,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        project_url: data.project_url || null,
        image_url: data.image_url || null,
      })
      .select()
      .single();

    if (error) {
      // Fallback: save to localStorage if DB isn't available
      setSaveError('Saved locally (DB unavailable)');
      const newProject: Project = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      const updated = [newProject, ...projects];
      setProjects(updated);
      localStorage.setItem(`portfolio_${profile.id}`, JSON.stringify(updated));
    } else {
      const newProject: Project = {
        id: inserted.id,
        title: inserted.title,
        description: inserted.description ?? '',
        tags: inserted.tags ?? [],
        project_url: inserted.project_url ?? '',
        image_url: inserted.image_url ?? '',
        category: inserted.category,
        created_at: inserted.created_at,
      };
      setProjects(p => [newProject, ...p]);
    }
    setSaving(false);
  }, [profile, projects]);

  // ── Delete project from Supabase ──
  const deleteProject = useCallback(async (id: string) => {
    if (!confirm('Delete this project?')) return;
    setSaving(true);
    const db = createClient();
    const { error } = await db.from('portfolio_projects').delete().eq('id', id);
    if (error) {
      // Fallback: remove from localStorage copy
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      if (profile) localStorage.setItem(`portfolio_${profile.id}`, JSON.stringify(updated));
    } else {
      setProjects(p => p.filter(p => p.id !== id));
    }
    setSaving(false);
  }, [projects, profile]);

  const filtered = catFilter === 'All' ? projects : projects.filter(p => p.category === catFilter);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">My Portfolio 🚀</h1>
          <p className="text-white/40 text-sm mt-1">Showcase your projects, ideas, and creations</p>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              {saveError}
            </span>
          )}
          {!saveError && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <CloudArrowUpIcon className="w-3.5 h-3.5" /> Synced
            </span>
          )}
          {tab === 'projects' && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Project
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Projects', value: projects.length, icon: CodeBracketIcon, color: 'text-violet-400' },
          { label: 'Categories', value: new Set(projects.map(p => p.category)).size, icon: SparklesIcon, color: 'text-pink-400' },
          { label: 'Links Shared', value: projects.filter(p => p.project_url).length, icon: LinkIcon, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#0d1526] border border-white/10 rounded-2xl p-4 text-center">
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
            <p className="text-xl font-black text-white">{s.value}</p>
            <p className="text-white/30 text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        <button onClick={() => setTab('projects')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'projects' ? 'bg-[#7a0606] text-white' : 'text-white/40 hover:text-white'}`}>
          <CodeBracketIcon className="w-4 h-4" /> Projects
        </button>
        <button onClick={() => setTab('canvas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'canvas' ? 'bg-[#7a0606] text-white' : 'text-white/40 hover:text-white'}`}>
          <PaintBrushIcon className="w-4 h-4" /> Canvas 🎨
        </button>
        <Link href="/dashboard/playground"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white/40 hover:text-white transition-colors">
          <CodeBracketIcon className="w-4 h-4" /> Code Playground →
        </Link>
      </div>

      {tab === 'canvas' ? (
        <DrawingCanvas />
      ) : (
        <>
          {/* Category filter */}
          <div className="flex gap-2 flex-wrap mb-6">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${catFilter === c ? 'bg-[#7a0606] text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                {c}
              </button>
            ))}
          </div>

          {/* Projects grid */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(p => (
                <ProjectCard key={p.id} project={p}
                  onDelete={() => deleteProject(p.id)}
                  saving={saving} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <RocketLaunchIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
              <h3 className="text-white font-bold mb-2">No projects yet!</h3>
              <p className="text-white/30 text-sm mb-6">
                Start building something cool and add it here.<br />
                Every great coder started with project #1 🚀
              </p>
              <button onClick={() => setShowAdd(true)}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors">
                Add My First Project
              </button>
            </div>
          )}

          {/* Inspiration cards (for empty state) */}
          {projects.length === 0 && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { emoji: '🌐', title: 'Personal Website', desc: 'Build your own website with HTML & CSS' },
                { emoji: '🤖', title: 'Arduino Robot', desc: 'Program a robot to follow a line' },
                { emoji: '🎮', title: 'Simple Game', desc: 'Create a Pong or Snake game in Python' },
                { emoji: '💡', title: 'Smart LED', desc: 'Control LEDs with IoT and code' },
                { emoji: '🧠', title: 'AI Chatbot', desc: 'Build a simple chatbot in Python' },
                { emoji: '📊', title: 'Data Dashboard', desc: 'Visualize data with charts' },
              ].map(idea => (
                <div key={idea.title}
                  className="bg-white/3 border border-white/5 rounded-xl p-4 cursor-pointer hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
                  onClick={() => setShowAdd(true)}>
                  <div className="text-2xl mb-2">{idea.emoji}</div>
                  <p className="text-white text-xs font-bold">{idea.title}</p>
                  <p className="text-white/30 text-[10px] mt-1">{idea.desc}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAdd && <AddProjectModal onSave={addProject} onClose={() => setShowAdd(false)} saving={saving} />}
    </div>
  );
}
