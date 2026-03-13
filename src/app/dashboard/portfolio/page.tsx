'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  PlusIcon, TrashIcon, LinkIcon, CodeBracketIcon, RocketLaunchIcon,
  SparklesIcon, XMarkIcon, PaintBrushIcon, ArrowDownTrayIcon,
  CloudArrowUpIcon, PencilIcon, MagnifyingGlassIcon,
  PhotoIcon, UserGroupIcon, StarIcon, CalendarIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
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
  is_featured: boolean;
  created_at: string;
}

type FormData = {
  title: string;
  description: string;
  category: string;
  project_url: string;
  image_url: string;
  tags: string;
};

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

// ─── Canvas Drawing Component ──────────────────────────────
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
    <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PaintBrushIcon className="w-4 h-4 text-pink-400" />
          <span className="text-white font-bold text-sm">Creative Canvas</span>
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
          <button onClick={downloadCanvas} className="p-1.5 text-white/30 hover:text-emerald-400 transition-colors" title="Download artwork">
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
      <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Project Image</label>
      {value && (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/10 bg-white/5">
          <img src={value} alt="preview" className="w-full h-full object-cover" />
          <button onClick={() => onChange('')}
            className="absolute top-2 right-2 p-1 bg-black/60 rounded-lg text-white/60 hover:text-white">
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
          className="flex-1 bg-white/5 border border-white/10 text-white px-3 py-2 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-xs"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
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
    image_url: editing.image_url ?? '',
    tags: editing.tags.join(', '),
  } : {
    title: '', description: '', category: 'Coding', project_url: '', image_url: '', tags: '',
  });

  async function handleSave() {
    if (!form.title.trim() || saving) return;
    await onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      project_url: form.project_url.trim() || undefined,
      image_url: form.image_url.trim() || undefined,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      is_featured: editing?.is_featured ?? false,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-white font-black">{editing ? 'Edit Project' : 'Add Project'}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Title *</label>
            <input
              placeholder="e.g. Line-following Robot"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Description</label>
            <textarea
              placeholder="What did you build? What does it do?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-violet-500 text-sm"
            >
              {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Tags (comma separated)</label>
            <input
              placeholder="python, arduino, sensor"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Project URL</label>
            <input
              placeholder="https://github.com/… or demo link"
              value={form.project_url}
              onChange={e => setForm(f => ({ ...f, project_url: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-2.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 text-sm"
            />
          </div>

          <ImageUpload value={form.image_url} onChange={url => setForm(f => ({ ...f, image_url: url }))} userId={userId} />
        </div>

        <div className="flex gap-3 p-5 border-t border-white/10">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 bg-white/5 text-white/60 font-bold rounded-xl hover:bg-white/10 transition-colors text-sm disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors text-sm"
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
  const catColor = CAT_COLORS[project.category] ?? 'bg-white/10 text-white/40';
  const date = new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className={`bg-[#0d1526] border rounded-2xl overflow-hidden transition-all group ${project.is_featured ? 'border-amber-500/40 shadow-lg shadow-amber-900/10' : 'border-white/10 hover:border-white/20'}`}>
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
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${project.is_featured ? 'bg-amber-500/80 text-black hover:bg-amber-400' : 'bg-black/60 text-white/60 hover:text-amber-400'}`}
              >
                {project.is_featured ? <StarSolid className="w-3.5 h-3.5" /> : <StarIcon className="w-3.5 h-3.5" />}
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                disabled={saving}
                className="p-1.5 bg-black/60 rounded-lg text-white/60 hover:text-white transition-colors disabled:opacity-40"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="p-1.5 bg-rose-500/80 rounded-lg text-white hover:bg-rose-500 transition-colors disabled:opacity-40"
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
            <span key={t} className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
        <h3 className="text-white font-bold text-sm leading-snug">{project.title}</h3>
        {project.description && (
          <p className="text-white/40 text-xs mt-1 line-clamp-2">{project.description}</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <span className="flex items-center gap-1 text-white/20 text-[10px]">
            <CalendarIcon className="w-3 h-3" /> {date}
          </span>
          {project.project_url && (
            <a
              href={project.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-violet-400 text-xs hover:text-violet-300 transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5" /> View
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
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Search students by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
        />
        {/* Dropdown results */}
        {(students.length > 0 || loading) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d1526] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
            {loading && <p className="text-white/40 text-sm px-4 py-3">Searching…</p>}
            {students.map(s => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
                <div className="w-8 h-8 rounded-full bg-violet-600/30 flex items-center justify-center text-xs font-black text-violet-400 flex-shrink-0">
                  {(s.full_name ?? '?')[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{s.full_name}</p>
                  <p className="text-xs text-white/30">{s.school_name ?? s.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected student portfolio */}
      {selectedStudent && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white">
              {(selectedStudent.full_name ?? '?')[0]}
            </div>
            <div>
              <p className="text-white font-bold">{selectedStudent.full_name}</p>
              <p className="text-white/40 text-xs">{selectedStudent.school_name ?? selectedStudent.email}</p>
            </div>
            <button onClick={() => { setSelectedStudent(null); setStudentProjects([]); }}
              className="ml-auto text-white/30 hover:text-white text-xs underline">
              Clear
            </button>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : studentProjects.length === 0 ? (
            <div className="text-center py-14 bg-white/5 border border-white/10 rounded-2xl">
              <RocketLaunchIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">{selectedStudent.full_name} hasn't added any projects yet.</p>
            </div>
          ) : (
            <>
              <p className="text-white/40 text-xs mb-4">{studentProjects.length} project{studentProjects.length !== 1 ? 's' : ''}</p>
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
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
          <UserGroupIcon className="w-14 h-14 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">Search for a student above to view their portfolio</p>
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
    const db = createClient();

    if (editing) {
      const { error } = await db.from('portfolio_projects')
        .update({
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags,
          project_url: data.project_url || null,
          image_url: data.image_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id);

      if (error) {
        setSaveError(error.message);
      } else {
        setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, ...data } : p));
      }
    } else {
      const { data: inserted, error } = await db.from('portfolio_projects')
        .insert({
          user_id: profile.id,
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags,
          project_url: data.project_url || null,
          image_url: data.image_url || null,
          is_featured: false,
        })
        .select()
        .single();

      if (error) {
        setSaveError('Saved locally (DB unavailable)');
        const newProject: Project = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        setProjects(prev => [newProject, ...prev]);
        localStorage.setItem(`portfolio_${profile.id}`, JSON.stringify([newProject, ...projects]));
      } else {
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
    const db = createClient();
    await db.from('portfolio_projects').update({ is_featured: newVal }).eq('id', id);
  }, [projects]);

  // ── Delete project ──
  const deleteProject = useCallback(async (id: string) => {
    if (!confirm('Delete this project?')) return;
    setSaving(true);
    const db = createClient();
    await db.from('portfolio_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setSaving(false);
  }, []);

  const filtered = (catFilter === 'All' ? projects : projects.filter(p => p.category === catFilter));
  const featuredProjects = projects.filter(p => p.is_featured);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <RocketLaunchIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Portfolio</span>
            </div>
            <h1 className="text-3xl font-extrabold">
              {isStaff && tab === 'browse' ? 'Student Portfolios' : 'My Portfolio'}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              {isStaff && tab === 'browse'
                ? 'Browse and explore what your students have built'
                : 'Showcase your projects, ideas, and creations'}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-violet-900/30"
              >
                <PlusIcon className="w-4 h-4" /> Add Project
              </button>
            )}
          </div>
        </div>

        {/* Stats strip — own projects only */}
        {tab !== 'browse' && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Projects', value: projects.length, icon: CodeBracketIcon, color: 'text-violet-400' },
              { label: 'Featured', value: featuredProjects.length, icon: StarSolid, color: 'text-amber-400' },
              { label: 'Links Shared', value: projects.filter(p => p.project_url).length, icon: LinkIcon, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                <p className="text-xl font-black text-white">{s.value}</p>
                <p className="text-white/30 text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-4 flex-wrap">
          <button onClick={() => setTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'projects' ? 'bg-[#7a0606] text-white' : 'text-white/40 hover:text-white'}`}>
            <CodeBracketIcon className="w-4 h-4" /> My Projects
          </button>
          {isStaff && (
            <button onClick={() => setTab('browse')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'browse' ? 'bg-[#7a0606] text-white' : 'text-white/40 hover:text-white'}`}>
              <UserGroupIcon className="w-4 h-4" /> Student Portfolios
            </button>
          )}
          <button onClick={() => setTab('canvas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'canvas' ? 'bg-[#7a0606] text-white' : 'text-white/40 hover:text-white'}`}>
            <PaintBrushIcon className="w-4 h-4" /> Canvas
          </button>
          <Link href="/dashboard/playground"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white/40 hover:text-white transition-colors">
            <CodeBracketIcon className="w-4 h-4" /> Code Playground →
          </Link>
        </div>

        {/* Tab content */}
        {tab === 'canvas' && <DrawingCanvas />}

        {tab === 'browse' && <StaffPortfolioView />}

        {tab === 'projects' && (
          <>
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
                <div className="mt-6 border-t border-white/10 pt-6">
                  <h2 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-3">All Projects</h2>
                </div>
              </div>
            )}

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${catFilter === c ? 'bg-[#7a0606] text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}>
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
              <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
                <RocketLaunchIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
                {projects.length === 0 ? (
                  <>
                    <h3 className="text-white font-bold mb-2">No projects yet!</h3>
                    <p className="text-white/30 text-sm mb-6">
                      Start building something cool and add it here.<br />
                      Every great coder started with project #1 🚀
                    </p>
                    <button onClick={() => { setEditing(null); setShowForm(true); }}
                      className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors">
                      Add My First Project
                    </button>
                  </>
                ) : (
                  <p className="text-white/30 text-sm">No projects in this category.</p>
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
                    className="bg-white/3 border border-white/5 rounded-xl p-4 cursor-pointer hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
                    onClick={() => { setEditing(null); setShowForm(true); }}>
                    <div className="text-2xl mb-2">{idea.emoji}</div>
                    <p className="text-white text-xs font-bold">{idea.title}</p>
                    <p className="text-white/30 text-[10px] mt-1">{idea.desc}</p>
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
