// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  PlusIcon, TrashIcon, LinkIcon, CodeBracketIcon, RocketLaunchIcon,
  XMarkIcon, PaintBrushIcon, ArrowDownTrayIcon,
  CloudArrowUpIcon, PencilIcon, MagnifyingGlassIcon,
  PhotoIcon, UserGroupIcon, StarIcon, CalendarIcon,
  ExclamationTriangleIcon, StarIconSolid as StarSolid,
  CheckCircleIcon, ArrowPathIcon, SparklesIcon
} from '@/lib/icons';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────
interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  project_url?: string;
  github_url?: string;
  image_url?: string;
  category: string;
  is_featured: boolean;
  created_at: string;
  source_type?: 'manual' | 'assignment' | 'lesson' | 'project';
  source_id?: string;
}

interface CompletedWork {
  id: string;
  title: string;
  type: 'assignment' | 'lesson' | 'project';
  completed_at: string;
  description?: string;
  files?: any[];
}

type FormData = {
  title: string;
  description: string;
  category: string;
  project_url: string;
  github_url: string;
  image_url: string;
  tags: string;
};

const CATEGORIES = ['All', 'Coding', 'Robotics', 'Web Design', 'AI/ML', 'IoT', 'Game Dev', 'Art'];
const CAT_COLORS: Record<string, string> = {
  Coding: 'bg-primary/20 text-primary',
  Robotics: 'bg-primary/20 text-primary',
  'Web Design': 'bg-primary/20 text-primary',
  'AI/ML': 'bg-emerald-500/20 text-emerald-400',
  IoT: 'bg-yellow-500/20 text-yellow-400',
  'Game Dev': 'bg-pink-500/20 text-pink-400',
  Art: 'bg-rose-500/20 text-rose-400',
};

// ─── Auto-Transfer Component ──────────────────────────────
function AutoTransferSection({ userId, onTransfer }: { userId: string; onTransfer: () => void }) {
  const [completedWork, setCompletedWork] = useState<CompletedWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  useEffect(() => {
    loadCompletedWork();
  }, []);

  async function loadCompletedWork() {
    setLoading(true);
    try {
      const db = createClient();
      
      const [assignmentsRes, lessonsRes, projectsRes] = await Promise.all([
        db.from('assignment_submissions' as any)
          .select('id, assignments(id, title, description), submitted_at, grade')
          .eq('portal_user_id', userId)
          .eq('status', 'graded')
          .gte('grade', 70),
        
        db.from('lesson_progress' as any)
          .select('id, lessons(id, title, description), completed_at')
          .eq('portal_user_id', userId)
          .eq('status', 'completed'),
        
        db.from('project_submissions' as any)
          .select('id, projects(id, title, description), submitted_at, grade')
          .eq('portal_user_id', userId)
          .eq('status', 'graded')
          .gte('grade', 70)
      ]);

      const work: CompletedWork[] = [
        ...(assignmentsRes.data || []).map((a: any) => ({
          id: a.assignments.id,
          title: a.assignments.title,
          type: 'assignment' as const,
          completed_at: a.submitted_at,
          description: a.assignments.description
        })),
        ...(lessonsRes.data || []).map((l: any) => ({
          id: l.lessons.id,
          title: l.lessons.title,
          type: 'lesson' as const,
          completed_at: l.completed_at,
          description: l.lessons.description
        })),
        ...(projectsRes.data || []).map((p: any) => ({
          id: p.projects.id,
          title: p.projects.title,
          type: 'project' as const,
          completed_at: p.submitted_at,
          description: p.projects.description
        }))
      ];

      const { data: existingProjects } = await db.from('portfolio_projects')
        .select('title')
        .eq('user_id', userId);

      const existingTitles = new Set(existingProjects?.map(p => p.title.toLowerCase()) || []);
      const availableWork = work.filter(w => !existingTitles.has(w.title.toLowerCase()));

      setCompletedWork(availableWork.sort((a, b) => 
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      ));
    } catch (error) {
      console.error('Failed to load completed work:', error);
    } finally {
      setLoading(false);
    }
  }

  async function transferToPortfolio(work: CompletedWork) {
    setTransferring(work.id);
    try {
      const res = await fetch('/api/portfolio-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: work.title,
          description: work.description || `Completed ${work.type} from my coursework`,
          category: work.type === 'project' ? 'Projects' : work.type === 'assignment' ? 'Coding' : 'Learning',
          tags: [work.type, 'coursework', 'completed'],
          source_type: work.type,
          source_id: work.id
        })
      });

      if (res.ok) {
        setCompletedWork(prev => prev.filter(w => w.id !== work.id));
        onTransfer();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setTransferring(null);
    }
  }

  if (loading) return (
    <div className="bg-card/30 border border-border/50 p-12 flex items-center justify-center">
      <ArrowPathIcon className="w-6 h-6 text-primary animate-spin opacity-50" />
    </div>
  );

  if (completedWork.length === 0) return (
    <div className="bg-card/30 border border-border/50 p-8 text-center relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CheckCircleIcon className="w-10 h-10 mx-auto text-emerald-500/40 mb-4" />
      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">Archive Synchronized</p>
      <p className="text-muted-foreground text-xs font-medium">All completed coursework is already in your portfolio.</p>
    </div>
  );

  return (
    <div className="bg-card/50 border border-border p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-primary" />
            <h3 className="text-[10px] font-black text-brand-red-600 uppercase tracking-[0.2em]">Ready for Archive</h3>
          </div>
          <p className="text-muted-foreground text-[11px]">Deploy your achievements to your public showcase.</p>
        </div>
        <div className="bg-primary/10 border border-primary/20 px-3 py-1">
          <span className="text-[10px] font-black text-primary uppercase tracking-widest">{completedWork.length} Available</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {completedWork.map(work => (
          <div key={`${work.type}-${work.id}`} className="group relative bg-background/50 border border-border p-4 hover:border-primary/30 transition-all">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 ${
                    work.type === 'assignment' ? 'bg-primary/10 text-primary' :
                    work.type === 'lesson' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {work.type}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">
                    {new Date(work.completed_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-black text-foreground/90 truncate italic">{work.title}</p>
              </div>
              <button
                onClick={() => transferToPortfolio(work)}
                disabled={transferring === work.id}
                className="ml-4 p-2 bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all disabled:opacity-50"
              >
                {transferring === work.id ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
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
    ctx.fillStyle = tool === 'eraser' ? '#0d1526' : color;
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
      ctx.strokeStyle = tool === 'eraser' ? '#0d1526' : color;
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
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function downloadCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'my-artwork.png';
    a.click();
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <div className="bg-card/30 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <PaintBrushIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[10px] font-black text-pink-400 uppercase tracking-[0.2em]">Creative Studio</h3>
            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-tighter opacity-70">Canvas active • {brush}px point</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1.5 p-1 bg-background/80 border border-border">
            {PALETTE.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-6 h-6 border transition-all ${color === c && tool === 'pen' ? 'border-foreground scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                style={{ background: c }} title={c} />
            ))}
          </div>
          
          <div className="flex gap-2 items-center bg-background/80 border border-border px-3 py-1">
            <span className="text-[9px] font-black text-muted-foreground uppercase mr-1">Brush</span>
            {BRUSHES.map(b => (
              <button key={b} onClick={() => setBrush(b)}
                className={`rounded-xl transition-all ${brush === b ? 'bg-primary scale-110' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`}
                style={{ width: 8 + (b / 4), height: 8 + (b / 4) }} />
            ))}
          </div>
          
          <div className="flex gap-1">
            <button onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all border ${
                tool === 'eraser' ? 'bg-rose-500 text-white border-rose-600' : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}>
              Eraser
            </button>
            <button onClick={clearCanvas} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-background border border-border transition-all">Reset</button>
            <button onClick={downloadCanvas} className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 transition-all" title="Archive Illustration">
              <ArrowDownTrayIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      <div className="relative bg-[#0d1526]">
         <canvas
          ref={canvasRef}
          width={1200}
          height={500}
          className="w-full touch-none cursor-crosshair opacity-90"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        <div className="absolute bottom-4 right-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] pointer-events-none select-none">
          Draft Neural Design v1.0
        </div>
      </div>
    </div>
  );
}

// ─── Image Upload Button ───────────────────────────────────
function ImageUpload({ value, onChange, userId }: {
  value: string;
  onChange: (url: string) => void;
  userId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Max file size is 5MB'); return; }
    setUploading(true);
    setError('');
    const db = createClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from('portfolio-images').upload(path, file, { contentType: file.type });
    if (upErr) {
      setError('Upload failed — paste a URL instead');
    } else {
      const { data } = db.storage.from('portfolio-images').getPublicUrl(path);
      onChange(data.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Project Image</label>
      {value && (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border border-border bg-card shadow-sm">
          <img src={value} alt="preview" className="w-full h-full object-cover" />
          <button onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1 bg-black/60 rounded-xl text-muted-foreground hover:text-foreground">
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Paste image URL…"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-card shadow-sm border border-border text-foreground px-3 py-2 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-xs"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 bg-card shadow-sm hover:bg-muted border border-border text-muted-foreground hover:text-foreground rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
        >
          <PhotoIcon className="w-3.5 h-3.5" />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {error && <p className="text-rose-400 text-xs">{error}</p>}
    </div>
  );
}

// ─── Project Form Modal (Add + Edit) ──────────────────────
function ProjectFormModal({ editing, userId, onSave, onClose, saving }: {
  editing: Project | null;
  userId: string;
  onSave: (data: Omit<Project, 'id' | 'created_at'>) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(() => editing ? {
    title: editing.title,
    description: editing.description,
    category: editing.category,
    project_url: editing.project_url ?? '',
    github_url: editing.github_url ?? '',
    image_url: editing.image_url ?? '',
    tags: editing.tags.join(', '),
  } : {
    title: '', description: '', category: 'Coding', project_url: '', github_url: '', image_url: '', tags: '',
  });

  async function handleSave() {
    if (!form.title.trim() || saving) return;
    await onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      project_url: form.project_url.trim() || undefined,
      github_url: form.github_url.trim() || undefined,
      image_url: form.image_url.trim() || undefined,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      is_featured: editing?.is_featured ?? false,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1526] border border-border rounded-xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-foreground font-black">{editing ? 'Edit Project' : 'Add Project'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Title *</label>
            <input
              placeholder="e.g. Line-following Robot"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</label>
            <textarea
              placeholder="What did you build? What does it do?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary text-sm"
            >
              {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Tags (comma separated)</label>
            <input
              placeholder="python, arduino, sensor"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Project URL</label>
            <input
              placeholder="https://github.com/… or demo link"
              value={form.project_url}
              onChange={e => setForm(f => ({ ...f, project_url: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">GitHub Repository</label>
            <input
              placeholder="https://github.com/username/repo"
              value={form.github_url}
              onChange={e => setForm(f => ({ ...f, github_url: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <ImageUpload value={form.image_url} onChange={url => setForm(f => ({ ...f, image_url: url }))} userId={userId} />
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 bg-card shadow-sm text-muted-foreground font-bold rounded-xl hover:bg-muted transition-colors text-sm disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
            className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-foreground font-bold rounded-xl transition-colors text-sm"
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Card ──────────────────────────────────────────
function ProjectCard({ project, onEdit, onDelete, onToggleFeatured, saving, readonly }: {
  project: Project;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFeatured?: () => void;
  saving: boolean;
  readonly?: boolean;
}) {
  const catColor = CAT_COLORS[project.category] ?? 'bg-muted text-muted-foreground';
  const date = new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={`group relative bg-[#090e1a]/80 border transition-all duration-300 ${
      project.is_featured 
        ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.05)]' 
        : 'border-border hover:border-primary/30'
    }`}>
      {/* Visual Identity Strip */}
      <div className={`absolute top-0 left-0 w-full h-[2px] ${
        project.is_featured ? 'bg-amber-500' : 'bg-primary opacity-0 group-hover:opacity-100'
      } transition-opacity duration-300`} />

      <div className="h-44 bg-[#0d1526] flex items-center justify-center relative overflow-hidden">
        {project.image_url ? (
          <img src={project.image_url} alt={project.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent flex items-center justify-center">
             <RocketLaunchIcon className="w-16 h-16 text-white/5 rotate-12" />
          </div>
        )}

        {project.is_featured && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest shadow-lg">
            <StarSolid className="w-3 h-3" />
            TOP PRIORITY
          </div>
        )}

        {!readonly && (
          <div className="absolute top-3 right-3 flex gap-2 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
            {onToggleFeatured && (
              <button onClick={onToggleFeatured} disabled={saving}
                className={`p-2 backdrop-blur-md transition-colors ${project.is_featured ? 'bg-amber-500 text-black' : 'bg-black/60 text-white/70 hover:text-amber-400'}`}>
                {project.is_featured ? <StarSolid className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit} disabled={saving} className="p-2 bg-black/60 backdrop-blur-md text-white/70 hover:text-white transition-colors">
                <PencilIcon className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} disabled={saving} className="p-2 bg-rose-500/80 backdrop-blur-md text-white hover:bg-rose-500 transition-colors">
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className={`text-[8px] font-black px-2 py-0.5 tracking-widest uppercase border border-current ${catColor.replace('bg-', 'text-').replace('/20', '')}`}>
            {project.category}
          </span>
          {project.tags.slice(0, 2).map(t => (
            <span key={t} className="text-[8px] text-muted-foreground font-black uppercase tracking-widest border border-border px-2 py-0.5">
              {t}
            </span>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-black text-foreground/90 leading-tight uppercase tracking-tight italic line-clamp-1 mb-1 group-hover:text-primary transition-colors">
            {project.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 h-8">
            {project.description || 'System data archive initialized. No further documentation provided.'}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold font-mono">
            <CalendarIcon className="w-3 h-3 text-primary/50" />
            {date}
          </div>
          <div className="flex gap-4">
            {project.project_url && (
              <a href={project.project_url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-primary transition-colors">
                <LinkIcon className="w-4 h-4" />
              </a>
            )}
            {project.github_url && (
              <a href={project.github_url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-primary transition-colors">
                <CodeBracketIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Staff Portfolio Browser ───────────────────────────────
function StaffPortfolioView() {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentProjects, setStudentProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return; }
    const db = createClient();
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await db.from('portal_users')
        .select('id, full_name, email, school_name, role')
        .eq('role', 'student')
        .ilike('full_name', `%${search}%`)
        .limit(10);
      setStudents(data ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function selectStudent(student: any) {
    setSelectedStudent(student);
    setStudents([]);
    setSearch('');
    setProjectsLoading(true);
    const db = createClient();
    const { data } = await db.from('portfolio_projects')
      .select('*')
      .eq('user_id', student.id)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    setStudentProjects((data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      tags: r.tags ?? [],
      project_url: r.project_url ?? '',
      image_url: r.image_url ?? '',
      category: r.category,
      is_featured: r.is_featured ?? false,
      created_at: r.created_at,
    })));
    setProjectsLoading(false);
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Search Header */}
      <div className="relative max-w-xl mx-auto">
        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/50" />
        <input
          type="text"
          placeholder="Search for student missions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-card/50 backdrop-blur-md border border-border hover:border-primary/30 transition-all text-sm text-foreground focus:outline-none focus:border-primary shadow-xl"
        />
        
        {/* Dropdown results */}
        {(students.length > 0 || loading) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1526] border border-border shadow-2xl z-50 overflow-hidden">
            <div className="p-2 border-b border-white/5 bg-white/5">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2">Top Matches</span>
            </div>
            {loading && <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">Scanning Neural Network...</div>}
            {students.map(s => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-primary/10 transition-all text-left">
                <div className="w-10 h-10 bg-primary/20 border border-primary/20 flex items-center justify-center text-sm font-black text-primary">
                  {(s.full_name ?? '?')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-foreground/90 uppercase tracking-tight">{s.full_name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">{s.school_name ?? s.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results View */}
      {selectedStudent ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 p-6 bg-card/30 border border-border relative">
             <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
             <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary border border-primary/40 flex items-center justify-center text-xl font-black text-white shrink-0">
               {(selectedStudent.full_name ?? '?')[0]}
             </div>
             <div className="min-w-0 flex-1">
               <h2 className="text-lg font-black text-foreground uppercase tracking-tight italic">{selectedStudent.full_name}</h2>
               <p className="text-xs text-muted-foreground uppercase font-black tracking-[0.2em]">{selectedStudent.school_name || "Academic Profile"}</p>
             </div>
             <button onClick={() => { setSelectedStudent(null); setStudentProjects([]); }}
               className="px-4 py-2 bg-background border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all">
               Close Profile
             </button>
          </div>

          {projectsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-64 bg-card/20 animate-pulse border border-border" />)}
            </div>
          ) : studentProjects.length === 0 ? (
            <div className="text-center py-20 bg-card/20 border border-dashed border-border">
              <RocketLaunchIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-black">Archive Empty</p>
              <p className="text-muted-foreground/60 text-[10px] mt-1">Student has not published any missions to their portfolio.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {studentProjects.map(p => (
                <ProjectCard key={p.id} project={p} saving={false} readonly />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-24 bg-card/20 border border-dashed border-border opacity-50">
          <UserGroupIcon className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="text-muted-foreground/40 text-xs font-black uppercase tracking-[0.4em]">Ready for Investigation</h3>
          <p className="text-muted-foreground/30 text-[10px] mt-2">Search for a student to analyze their creative output</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function PortfolioPage() {
  const { profile, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [catFilter, setCatFilter] = useState('All');
  const [tab, setTab] = useState<'projects' | 'browse' | 'canvas'>('projects');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  // ── Load own projects ──
  useEffect(() => {
    if (authLoading || !profile) return;
    if (isStaff && tab === 'browse') { setLoading(false); return; }
    const db = createClient();
    db.from('portfolio_projects')
      .select('*')
      .eq('user_id', profile.id)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
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
            is_featured: r.is_featured ?? false,
            created_at: r.created_at,
          })));
        }
        setLoading(false);
      });
  }, [profile?.id, authLoading]); // eslint-disable-line

  // ── Add / Edit project ──
  const saveProject = useCallback(async (data: Omit<Project, 'id' | 'created_at'>) => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);

    if (editing) {
      const res = await fetch(`/api/portfolio-projects/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags,
          project_url: data.project_url || null,
          image_url: data.image_url || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setSaveError(j.error || 'Failed to update');
      } else {
        setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, ...data } : p));
      }
    } else {
      const res = await fetch('/api/portfolio-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags,
          project_url: data.project_url || null,
          image_url: data.image_url || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSaveError('Saved locally (DB unavailable)');
        const newProject: Project = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        setProjects(prev => [newProject, ...prev]);
        localStorage.setItem(`portfolio_${profile.id}`, JSON.stringify([newProject, ...projects]));
      } else {
        const inserted = j.data;
        const newProject: Project = {
          id: inserted.id,
          title: inserted.title,
          description: inserted.description ?? '',
          tags: inserted.tags ?? [],
          project_url: inserted.project_url ?? '',
          image_url: inserted.image_url ?? '',
          category: inserted.category,
          is_featured: inserted.is_featured ?? false,
          created_at: inserted.created_at,
        };
        setProjects(prev => [newProject, ...prev]);
      }
    }
    setSaving(false);
  }, [profile, editing, projects]);

  // ── Toggle featured ──
  const toggleFeatured = useCallback(async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    const newVal = !project.is_featured;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, is_featured: newVal } : p).sort((a, b) =>
      Number(b.is_featured) - Number(a.is_featured)
    ));
    await fetch(`/api/portfolio-projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_featured: newVal }),
    });
  }, [projects]);

  // ── Delete project ──
  const deleteProject = useCallback(async (id: string) => {
    if (!confirm('Delete this project?')) return;
    setSaving(true);
    await fetch(`/api/portfolio-projects/${id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
    setSaving(false);
  }, []);

  const filtered = (catFilter === 'All' ? projects : projects.filter(p => p.category === catFilter));
  const featuredProjects = projects.filter(p => p.is_featured);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020817]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!profile) return null;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-foreground relative overflow-hidden">
      {/* Neural Background Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 relative z-10">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <RocketLaunchIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Portfolio</span>
            </div>
            <h1 className="text-3xl font-extrabold">
              {isStaff && tab === 'browse' ? 'Student Portfolios' : 'My Portfolio'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff && tab === 'browse'
                ? 'Browse and explore what your students have built'
                : 'Showcase your projects, ideas, and creations'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saveError && (
              <span className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
            {!saveError && tab === 'projects' && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                <CloudArrowUpIcon className="w-3.5 h-3.5" /> Synced
              </span>
            )}
            {tab === 'projects' && (
              <button
                onClick={() => { setEditing(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary text-foreground text-sm font-bold rounded-xl transition-colors shadow-lg shadow-orange-900/30"
              >
                <PlusIcon className="w-4 h-4" /> Add Project
              </button>
            )}
          </div>
        </div>

        {/* Stats Strip */}
        {tab !== 'browse' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Deployed Projects', value: projects.length, icon: CodeBracketIcon, color: 'text-primary', bg: 'bg-primary/5' },
              { label: 'Priority Assets', value: featuredProjects.length, icon: StarSolid, color: 'text-amber-400', bg: 'bg-amber-400/5' },
              { label: 'External Links', value: projects.filter(p => p.project_url).length, icon: LinkIcon, color: 'text-emerald-400', bg: 'bg-emerald-400/5' },
            ].map(s => (
              <div key={s.label} className="relative bg-card/40 backdrop-blur-md border border-border group overflow-hidden">
                <div className={`absolute top-0 left-0 w-[2px] h-full ${s.color.replace('text-', 'bg-')} opacity-40`} />
                <div className="p-6 text-center">
                  <s.icon className={`w-6 h-6 mx-auto mb-3 ${s.color} opacity-80 group-hover:scale-110 transition-transform`} />
                  <p className="text-3xl font-black text-foreground tracking-tighter italic">{s.value}</p>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-4 flex-wrap">
          <button type="button" onClick={() => setTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-transparent ${tab === 'projects' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
            <CodeBracketIcon className="w-4 h-4" /> My Projects
          </button>
          {isStaff && (
            <button type="button" onClick={() => setTab('browse')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-transparent ${tab === 'browse' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
              <UserGroupIcon className="w-4 h-4" /> Student Portfolios
            </button>
          )}
          <button type="button" onClick={() => setTab('canvas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-transparent ${tab === 'canvas' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
            <PaintBrushIcon className="w-4 h-4" /> Canvas
          </button>
          <Link href="/dashboard/playground"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <CodeBracketIcon className="w-4 h-4" /> Code Playground →
          </Link>
        </div>

        {/* Tab content */}
        {tab === 'canvas' && <DrawingCanvas />}

        {tab === 'browse' && <StaffPortfolioView />}

        {tab === 'projects' && (
          <>
            {/* Auto-Transfer Section */}
            <AutoTransferSection userId={profile.id} onTransfer={() => {
              // Reload projects after transfer
              const db = createClient();
              db.from('portfolio_projects')
                .select('*')
                .eq('user_id', profile.id)
                .order('is_featured', { ascending: false })
                .order('created_at', { ascending: false })
                .then(({ data }) => {
                  if (data) {
                    setProjects(data.map((r: any) => ({
                      id: r.id,
                      title: r.title,
                      description: r.description ?? '',
                      tags: r.tags ?? [],
                      project_url: r.project_url ?? '',
                      github_url: r.github_url ?? '',
                      image_url: r.image_url ?? '',
                      category: r.category,
                      is_featured: r.is_featured ?? false,
                      created_at: r.created_at,
                      source_type: r.source_type,
                      source_id: r.source_id,
                    })));
                  }
                });
            }} />

            {/* Featured banner */}
            {featuredProjects.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <StarSolid className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Featured Projects</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featuredProjects.map(p => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onEdit={() => { setEditing(p); setShowForm(true); }}
                      onDelete={() => deleteProject(p.id)}
                      onToggleFeatured={() => toggleFeatured(p.id)}
                      saving={saving}
                    />
                  ))}
                </div>
                <div className="mt-6 border-t border-border pt-6">
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">All Projects</h2>
                </div>
              </div>
            )}

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button type="button" key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all border border-transparent ${catFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'}`}>
                  {c} {c !== 'All' && projects.filter(p => p.category === c).length > 0 && (
                    <span className="ml-1 opacity-60">{projects.filter(p => p.category === c).length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Projects grid */}
            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onEdit={() => { setEditing(p); setShowForm(true); }}
                    onDelete={() => deleteProject(p.id)}
                    onToggleFeatured={() => toggleFeatured(p.id)}
                    saving={saving}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-card shadow-sm border border-border rounded-xl">
                <RocketLaunchIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                {projects.length === 0 ? (
                  <>
                    <h3 className="text-foreground font-bold mb-2">No projects yet!</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                      Start building something cool and add it here.<br />
                      Every great coder started with project #1 🚀
                    </p>
                    <button onClick={() => { setEditing(null); setShowForm(true); }}
                      className="px-6 py-3 bg-primary hover:bg-primary text-foreground font-bold rounded-xl transition-colors">
                      Add My First Project
                    </button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No projects in this category.</p>
                )}
              </div>
            )}

            {/* Inspiration cards (empty state only) */}
            {projects.length === 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { emoji: '🌐', title: 'Personal Website', desc: 'Build your own website with HTML & CSS' },
                  { emoji: '🤖', title: 'Arduino Robot', desc: 'Program a robot to follow a line' },
                  { emoji: '🎮', title: 'Simple Game', desc: 'Create a Pong or Snake game in Python' },
                  { emoji: '💡', title: 'Smart LED', desc: 'Control LEDs with IoT and code' },
                  { emoji: '🧠', title: 'AI Chatbot', desc: 'Build a simple chatbot in Python' },
                  { emoji: '📊', title: 'Data Dashboard', desc: 'Visualize data with charts' },
                ].map(idea => (
                  <div key={idea.title}
                    className="bg-muted/30 border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 hover:bg-primary/10 transition-all"
                    onClick={() => { setEditing(null); setShowForm(true); }}>
                    <div className="text-2xl mb-2">{idea.emoji}</div>
                    <p className="text-foreground text-xs font-bold">{idea.title}</p>
                    <p className="text-muted-foreground text-[10px] mt-1">{idea.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showForm && profile && (
        <ProjectFormModal
          editing={editing}
          userId={profile.id}
          onSave={saveProject}
          onClose={() => { setShowForm(false); setEditing(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
