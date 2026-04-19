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
  ExclamationTriangleIcon, StarIconSolid as StarSolid
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
  Coding: 'bg-orange-500/20 text-orange-400',
  Robotics: 'bg-orange-500/20 text-orange-400',
  'Web Design': 'bg-blue-500/20 text-blue-400',
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
      
      // Get completed assignments, lessons, and projects not yet in portfolio
      const [assignmentsRes, lessonsRes, projectsRes] = await Promise.all([
        db.from('assignment_submissions' as any)
          .select('id, assignments(id, title, description), submitted_at, grade')
          .eq('portal_user_id', userId)
          .eq('status', 'graded')
          .gte('grade', 70), // Only good grades
        
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

      // Filter out items whose title already exists in the portfolio
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
      } else {
        alert('Failed to transfer to portfolio');
      }
    } catch (error) {
      alert('Failed to transfer to portfolio');
    } finally {
      setTransferring(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-none p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (completedWork.length === 0) {
    return (
      <div className="bg-card border border-border rounded-none p-6 text-center">
        <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
        <p className="text-foreground font-bold mb-1">All caught up!</p>
        <p className="text-muted-foreground text-sm">Complete assignments and lessons to auto-add them here</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-none overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-orange-400" />
          <h3 className="font-bold text-foreground">Auto-Transfer Available</h3>
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-bold">
            {completedWork.length} item{completedWork.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-muted-foreground text-xs mt-1">
          Add your completed coursework to your portfolio with one click
        </p>
      </div>
      
      <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
        {completedWork.map(work => (
          <div key={`${work.type}-${work.id}`} className="flex items-center justify-between p-4 bg-background border border-border rounded-none">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                work.type === 'assignment' ? 'bg-blue-500/20 text-blue-400' :
                work.type === 'lesson' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-violet-500/20 text-violet-400'
              }`}>
                {work.type === 'assignment' ? '📝' : work.type === 'lesson' ? '📖' : '🚀'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground font-bold text-sm truncate">{work.title}</p>
                <p className="text-muted-foreground text-xs">
                  {work.type} • {new Date(work.completed_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => transferToPortfolio(work)}
              disabled={transferring === work.id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold rounded-none transition-colors"
            >
              {transferring === work.id ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PlusIcon className="w-3.5 h-3.5" />
              )}
              Add
            </button>
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
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'my-artwork.png';
    a.click();
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <div className="bg-card border border-border rounded-none overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PaintBrushIcon className="w-4 h-4 text-pink-400" />
          <span className="text-foreground font-bold text-sm">Creative Canvas</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {PALETTE.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-5 h-5 rounded-full border-2 transition-all ${color === c && tool === 'pen' ? 'border-border scale-125' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex gap-1 items-center">
            {BRUSHES.map(b => (
              <button key={b} onClick={() => setBrush(b)}
                className={`rounded-full bg-white transition-all ${brush === b ? 'opacity-100 ring-2 ring-orange-400' : 'opacity-30'}`}
                style={{ width: b + 4, height: b + 4 }} />
            ))}
          </div>
          <button onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
            className={`px-2 py-1 rounded-none text-xs font-bold transition-colors ${tool === 'eraser' ? 'bg-rose-500/30 text-rose-400' : 'bg-card shadow-sm text-muted-foreground hover:text-foreground'}`}>
            Eraser
          </button>
          <button onClick={clearCanvas} className="px-2 py-1 rounded-none text-xs text-muted-foreground hover:text-foreground bg-card shadow-sm transition-colors">Clear</button>
          <button onClick={downloadCanvas} className="p-1.5 text-muted-foreground hover:text-emerald-400 transition-colors" title="Download artwork">
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
      <div className="px-4 py-2 border-t border-border">
        <p className="text-muted-foreground text-[10px]">Draw your ideas, sketches, and robot designs here! 🤖</p>
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
        <div className="relative w-full h-32 rounded-none overflow-hidden border border-border bg-card shadow-sm">
          <img src={value} alt="preview" className="w-full h-full object-cover" />
          <button onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1 bg-black/60 rounded-none text-muted-foreground hover:text-foreground">
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
          className="flex-1 bg-card shadow-sm border border-border text-foreground px-3 py-2 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-xs"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 bg-card shadow-sm hover:bg-muted border border-border text-muted-foreground hover:text-foreground rounded-none text-xs font-bold transition-colors disabled:opacity-40"
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
      <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
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
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Description</label>
            <textarea
              placeholder="What did you build? What does it do?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none focus:outline-none focus:border-orange-500 text-sm"
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
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Project URL</label>
            <input
              placeholder="https://github.com/… or demo link"
              value={form.project_url}
              onChange={e => setForm(f => ({ ...f, project_url: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">GitHub Repository</label>
            <input
              placeholder="https://github.com/username/repo"
              value={form.github_url}
              onChange={e => setForm(f => ({ ...f, github_url: e.target.value }))}
              className="w-full bg-card shadow-sm border border-border text-foreground px-4 py-2.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 text-sm"
            />
          </div>

          <ImageUpload value={form.image_url} onChange={url => setForm(f => ({ ...f, image_url: url }))} userId={userId} />
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 bg-card shadow-sm text-muted-foreground font-bold rounded-none hover:bg-muted transition-colors text-sm disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-foreground font-bold rounded-none transition-colors text-sm"
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
    <div className={`bg-[#0d1526] border rounded-none overflow-hidden transition-all group ${project.is_featured ? 'border-amber-500/40 shadow-lg shadow-amber-900/10' : 'border-border hover:border-border'}`}>
      {/* Thumbnail */}
      <div className="h-40 bg-gradient-to-br from-[#1a2b54] to-[#0d1526] flex items-center justify-center relative overflow-hidden">
        {project.image_url
          ? <img src={project.image_url} alt={project.title} className="w-full h-full object-cover" />
          : <RocketLaunchIcon className="w-14 h-14 text-white/5" />}

        {project.is_featured && (
          <div className="absolute top-2 left-2">
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-500/90 text-black px-2 py-0.5 rounded-full">
              <StarSolid className="w-2.5 h-2.5" /> Featured
            </span>
          </div>
        )}

        {!readonly && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onToggleFeatured && (
              <button
                onClick={onToggleFeatured}
                disabled={saving}
                title={project.is_featured ? 'Unpin' : 'Pin as featured'}
                className={`p-1.5 rounded-none transition-colors disabled:opacity-40 ${project.is_featured ? 'bg-amber-500/80 text-black hover:bg-amber-400' : 'bg-black/60 text-muted-foreground hover:text-amber-400'}`}
              >
                {project.is_featured ? <StarSolid className="w-3.5 h-3.5" /> : <StarIcon className="w-3.5 h-3.5" />}
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                disabled={saving}
                className="p-1.5 bg-black/60 rounded-none text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="p-1.5 bg-rose-500/80 rounded-none text-foreground hover:bg-rose-500 transition-colors disabled:opacity-40"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catColor}`}>{project.category}</span>
          {project.tags.slice(0, 3).map(t => (
            <span key={t} className="text-[10px] text-muted-foreground bg-card shadow-sm px-1.5 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
        <h3 className="text-foreground font-bold text-sm leading-snug">{project.title}</h3>
        {project.description && (
          <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{project.description}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="flex items-center gap-1 text-muted-foreground text-[10px]">
            <CalendarIcon className="w-3 h-3" /> {date}
          </span>
                  {project.project_url && (
                    <a
                      href={project.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-orange-400 text-xs hover:text-orange-500 transition-colors"
                    >
                      <LinkIcon className="w-3.5 h-3.5" /> Demo
                    </a>
                  )}
                  {project.github_url && (
                    <a
                      href={project.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-400 text-xs hover:text-blue-500 transition-colors"
                    >
                      <CodeBracketIcon className="w-3.5 h-3.5" /> Code
                    </a>
                  )}
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
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search students by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500"
        />
        {/* Dropdown results */}
        {(students.length > 0 || loading) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border border-border rounded-none shadow-xl z-20 overflow-hidden">
            {loading && <p className="text-muted-foreground text-sm px-4 py-3">Searching…</p>}
            {students.map(s => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card shadow-sm transition-colors text-left">
                <div className="w-8 h-8 rounded-full bg-orange-600/30 flex items-center justify-center text-xs font-black text-orange-400 flex-shrink-0">
                  {(s.full_name ?? '?')[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">{s.school_name ?? s.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected student portfolio */}
      {selectedStudent && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 from-orange-600 to-orange-400 flex items-center justify-center text-sm font-black text-primary-foreground shrink-0">
              {(selectedStudent.full_name ?? '?')[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-bold truncate">{selectedStudent.full_name}</p>
              <p className="text-muted-foreground text-xs truncate">{selectedStudent.school_name ?? selectedStudent.email}</p>
            </div>
            <button type="button" onClick={() => { setSelectedStudent(null); setStudentProjects([]); }}
              className="sm:ml-auto w-full sm:w-auto text-center sm:text-left text-muted-foreground hover:text-foreground text-xs underline py-1">
              Clear
            </button>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : studentProjects.length === 0 ? (
            <div className="text-center py-14 bg-card shadow-sm border border-border rounded-none">
              <RocketLaunchIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">{selectedStudent.full_name} hasn't added any projects yet.</p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs mb-4">{studentProjects.length} project{studentProjects.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {studentProjects.map(p => (
                  <ProjectCard key={p.id} project={p} saving={false} readonly />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!selectedStudent && (
        <div className="text-center py-16 bg-card shadow-sm border border-border rounded-none">
          <UserGroupIcon className="w-14 h-14 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Search for a student above to view their portfolio</p>
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

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <RocketLaunchIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Portfolio</span>
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
              <span className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-none">
                <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
            {!saveError && tab === 'projects' && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-none">
                <CloudArrowUpIcon className="w-3.5 h-3.5" /> Synced
              </span>
            )}
            {tab === 'projects' && (
              <button
                onClick={() => { setEditing(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-sm font-bold rounded-none transition-colors shadow-lg shadow-orange-900/30"
              >
                <PlusIcon className="w-4 h-4" /> Add Project
              </button>
            )}
          </div>
        </div>

        {/* Stats strip — own projects only */}
        {tab !== 'browse' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Projects', value: projects.length, icon: CodeBracketIcon, color: 'text-orange-400' },
              { label: 'Featured', value: featuredProjects.length, icon: StarSolid, color: 'text-amber-400' },
              { label: 'Links Shared', value: projects.filter(p => p.project_url).length, icon: LinkIcon, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <p className="text-xl font-black text-foreground">{s.value}</p>
                <p className="text-muted-foreground text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-4 flex-wrap">
          <button type="button" onClick={() => setTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-bold transition-all border border-transparent ${tab === 'projects' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
            <CodeBracketIcon className="w-4 h-4" /> My Projects
          </button>
          {isStaff && (
            <button type="button" onClick={() => setTab('browse')}
              className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-bold transition-all border border-transparent ${tab === 'browse' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
              <UserGroupIcon className="w-4 h-4" /> Student Portfolios
            </button>
          )}
          <button type="button" onClick={() => setTab('canvas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-bold transition-all border border-transparent ${tab === 'canvas' ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 border-border'}`}>
            <PaintBrushIcon className="w-4 h-4" /> Canvas
          </button>
          <Link href="/dashboard/playground"
            className="flex items-center gap-2 px-4 py-2 rounded-none text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
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
                  className={`px-3 py-1.5 rounded-none text-xs font-bold uppercase transition-all border border-transparent ${catFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-orange-500/30'}`}>
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
              <div className="text-center py-16 bg-card shadow-sm border border-border rounded-none">
                <RocketLaunchIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                {projects.length === 0 ? (
                  <>
                    <h3 className="text-foreground font-bold mb-2">No projects yet!</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                      Start building something cool and add it here.<br />
                      Every great coder started with project #1 🚀
                    </p>
                    <button onClick={() => { setEditing(null); setShowForm(true); }}
                      className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-foreground font-bold rounded-none transition-colors">
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
                    className="bg-muted/30 border border-border rounded-none p-4 cursor-pointer hover:border-orange-500/30 hover:bg-orange-500/10 transition-all"
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
