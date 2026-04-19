'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  TrophyIcon, StarIcon, SparklesIcon, UserGroupIcon,
  AcademicCapIcon, CheckCircleIcon, ExclamationTriangleIcon,
  PlusIcon, EyeIcon, BookOpenIcon, RocketLaunchIcon,
} from '@/lib/icons';
import { engagementTables, type ShowcaseItemRow, type ShowcaseItemInsert } from '@/types/engagement';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ShowcaseItem {
  id: string;
  student_id: string;
  student_name?: string;
  school_name?: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  item_type: 'project' | 'assignment' | 'assessment';
  course_name?: string;
  term_number?: number;
  is_pinned: boolean;
  is_published: boolean;
  teacher_note?: string;
  views: number;
  created_at: string;
}

const TYPE_META = {
  project:    { label: 'Project',    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30',  icon: RocketLaunchIcon },
  assignment: { label: 'Assignment', color: 'text-blue-400   bg-blue-500/10   border-blue-500/30',    icon: BookOpenIcon },
  assessment: { label: 'Assessment', color: 'text-amber-400  bg-amber-500/10  border-amber-500/30',   icon: TrophyIcon },
};

const TERM_LABEL: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };

// ── Helpers ───────────────────────────────────────────────────────────────────
function AddItemModal({ onClose, onSave, schoolId }: {
  onClose: () => void;
  onSave: (item: Partial<ShowcaseItem>) => void;
  schoolId?: string | null;
}) {
  const [form, setForm] = useState({
    title: '', description: '', item_type: 'project',
    course_name: '', term_number: '1', teacher_note: '',
    student_id: '', is_published: true,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <h2 className="font-black flex items-center gap-2 text-sm">
          <StarIcon className="w-4 h-4 text-amber-400" /> Add Showcase Item
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Student ID</label>
            <input className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              value={form.student_id} onChange={e => setForm(p => ({ ...p, student_id: e.target.value }))}
              placeholder="Paste student portal user ID" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Title</label>
            <input className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Paystack Clone — Week 7 Project" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Description</label>
            <textarea rows={3} className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none"
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What did the student build or achieve?" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Type</label>
              <select className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                value={form.item_type} onChange={e => setForm(p => ({ ...p, item_type: e.target.value }))}>
                <option value="project">Project</option>
                <option value="assignment">Assignment</option>
                <option value="assessment">Assessment</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Term</label>
              <select className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                value={form.term_number} onChange={e => setForm(p => ({ ...p, term_number: e.target.value }))}>
                <option value="1">First Term</option>
                <option value="2">Second Term</option>
                <option value="3">Third Term</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Course</label>
              <input className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                value={form.course_name} onChange={e => setForm(p => ({ ...p, course_name: e.target.value }))}
                placeholder="e.g. Python Basics" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Teacher Note (optional)</label>
            <textarea rows={2} className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none"
              value={form.teacher_note} onChange={e => setForm(p => ({ ...p, teacher_note: e.target.value }))}
              placeholder="Why this work stands out…" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_published}
              onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))}
              className="accent-orange-500 w-4 h-4" />
            <span className="text-sm text-foreground font-bold">Publish immediately (visible to parents)</span>
          </label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-background border border-border text-muted-foreground font-bold text-sm hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!form.title || !form.student_id) return;
              onSave({
                ...form,
                term_number: Number(form.term_number),
                is_published: form.is_published,
                item_type: form.item_type as ShowcaseItem['item_type'],
              });
            }}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm transition-colors">
            Add to Showcase
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Showcase Item Card ────────────────────────────────────────────────────────
function ShowcaseCard({ item, canManage, onPin, onTogglePublish }: {
  item: ShowcaseItem;
  canManage: boolean;
  onPin: (id: string, pinned: boolean) => void;
  onTogglePublish: (id: string, published: boolean) => void;
}) {
  const meta = TYPE_META[item.item_type] ?? TYPE_META.project;
  const Icon = meta.icon;

  return (
    <div className={`bg-card border transition-all space-y-3 overflow-hidden ${
      item.is_pinned ? 'border-amber-500/40' : 'border-border hover:border-orange-500/30'
    }`}>
      {/* Pinned banner */}
      {item.is_pinned && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-1.5">
          <StarIcon className="w-3 h-3 text-amber-400" />
          <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Featured Showcase</span>
        </div>
      )}

      {/* Thumbnail or placeholder */}
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt={item.title} className="w-full h-36 object-cover" />
      ) : (
        <div className="w-full h-28 bg-gradient-to-br from-orange-500/5 via-violet-500/5 to-transparent flex items-center justify-center border-b border-border">
          <Icon className="w-10 h-10 text-muted-foreground/40" />
        </div>
      )}

      <div className="px-4 pb-4 space-y-3">
        {/* Type + term badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${meta.color}`}>
            {meta.label}
          </span>
          {item.term_number && (
            <span className="text-[9px] font-bold text-muted-foreground">
              {TERM_LABEL[item.term_number] ?? `Term ${item.term_number}`}
            </span>
          )}
          {!item.is_published && (
            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5">Draft</span>
          )}
        </div>

        {/* Title + student */}
        <div>
          <h3 className="font-black text-sm leading-snug">{item.title}</h3>
          {item.student_name && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{item.student_name}</p>
          )}
          {item.course_name && (
            <p className="text-[10px] text-orange-400 font-bold">{item.course_name}</p>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2">{item.description}</p>
        )}

        {/* Teacher note */}
        {item.teacher_note && (
          <div className="border-l-2 border-orange-500/40 pl-3">
            <p className="text-[10px] text-muted-foreground italic">"{item.teacher_note}"</p>
          </div>
        )}

        {/* Views + actions */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <EyeIcon className="w-3 h-3" />
            <span>{item.views} view{item.views !== 1 ? 's' : ''}</span>
          </div>
          {canManage && (
            <div className="flex gap-1.5">
              <button
                onClick={() => onTogglePublish(item.id, !item.is_published)}
                className={`text-[9px] font-black px-2 py-1 border transition-colors ${
                  item.is_published
                    ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                    : 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                {item.is_published ? '✓ Published' : 'Publish'}
              </button>
              <button
                onClick={() => onPin(item.id, !item.is_pinned)}
                className={`text-[9px] font-black px-2 py-1 border transition-colors ${
                  item.is_pinned
                    ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                    : 'border-border text-muted-foreground hover:border-amber-500/30 hover:text-amber-400'
                }`}
              >
                {item.is_pinned ? '★ Pinned' : 'Pin'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShowcasePage() {
  const { profile } = useAuth();
  const [items, setItems]       = useState<ShowcaseItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'project' | 'assignment' | 'assessment'>('all');
  const [termFilter, setTermFilter] = useState<'all' | '1' | '2' | '3'>('all');
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const isStaff   = ['admin', 'teacher'].includes(profile?.role ?? '');
  const isSchool  = profile?.role === 'school';
  const isStudent = profile?.role === 'student';
  const canManage = isStaff;

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const supabase = createClient();
    let query = engagementTables.showcase(supabase)
      .select(`
        id, student_id, title, description, thumbnail_url, item_type,
        course_name, term_number, is_pinned, is_published, teacher_note, views, created_at,
        portal_users!showcase_items_student_id_fkey(full_name, school_name)
      `)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    // Students only see published items
    if (isStudent) {
      query = query.eq('is_published', true);
      // If school-scoped student — could add school filter here
    }

    const { data } = await query;
    const formatted: ShowcaseItem[] = (data ?? []).map((row: any) => ({
      ...row,
      student_name: row.portal_users?.full_name ?? 'Student',
      school_name: row.portal_users?.school_name ?? '',
    }));
    setItems(formatted);
    setLoading(false);
  }

  async function handleAddItem(item: Partial<ShowcaseItem>) {
    setSaving(true);
    const supabase = createClient();
    const payload: ShowcaseItemInsert = {
      student_id: item.student_id ?? '',
      title: item.title ?? '',
      description: item.description ?? null,
      item_type: item.item_type ?? 'project',
      course_name: item.course_name ?? null,
      term_number: item.term_number ?? null,
      teacher_note: item.teacher_note ?? null,
      is_published: item.is_published ?? false,
      school_id: profile?.school_id ?? null,
    };
    await engagementTables.showcase(supabase).insert(payload);
    setSaving(false);
    setShowAdd(false);
    loadItems();
  }

  async function handlePin(id: string, pinned: boolean) {
    const supabase = createClient();
    await engagementTables.showcase(supabase).update({ is_pinned: pinned }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_pinned: pinned } : i));
  }

  async function handleTogglePublish(id: string, published: boolean) {
    const supabase = createClient();
    await engagementTables.showcase(supabase).update({ is_published: published }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_published: published } : i));
  }

  const filtered = items.filter(item => {
    if (filter !== 'all' && item.item_type !== filter) return false;
    if (termFilter !== 'all' && String(item.term_number) !== termFilter) return false;
    return true;
  });

  const pinned   = filtered.filter(i => i.is_pinned);
  const rest     = filtered.filter(i => !i.is_pinned);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrophyIcon className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Student Showcase</span>
          </div>
          <h1 className="text-2xl font-black">Outstanding Work</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Projects and assignments selected by teachers — your proof of mastery, ready for parents
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold transition-colors shrink-0"
          >
            <PlusIcon className="w-4 h-4" /> Add Item
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Showcased', value: items.length, color: 'text-foreground' },
          { label: 'Featured', value: items.filter(i => i.is_pinned).length, color: 'text-amber-400' },
          { label: 'Projects', value: items.filter(i => i.item_type === 'project').length, color: 'text-violet-400' },
          { label: 'Published', value: items.filter(i => i.is_published).length, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border p-4">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Nigerian showcase context banner */}
      <div className="bg-gradient-to-r from-orange-500/5 to-amber-500/5 border border-orange-500/20 p-4 flex gap-3">
        <SparklesIcon className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black text-foreground">End-of-Term Showcase Ceremony</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Featured items are displayed at the school's end-of-term parent ceremony.
            Teachers pin the best projects to celebrate students publicly — the strongest motivation
            for Nigerian students and parents to see real outcomes.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-card border border-border p-1">
          {(['all', 'project', 'assignment', 'assessment'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                filter === f ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {f === 'all' ? 'All Types' : f + 's'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-card border border-border p-1">
          {(['all', '1', '2', '3'] as const).map(t => (
            <button key={t} onClick={() => setTermFilter(t)}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                termFilter === t ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t === 'all' ? 'All Terms' : `Term ${t}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <TrophyIcon className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="font-black text-lg mb-2">No showcase items yet</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canManage
              ? 'Add outstanding student work to showcase their achievements to parents.'
              : 'Your teacher will add showcase items as you deliver excellent work.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned */}
          {pinned.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <StarIcon className="w-3 h-3" /> Featured Work
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinned.map(item => (
                  <ShowcaseCard key={item.id} item={item} canManage={canManage}
                    onPin={handlePin} onTogglePublish={handleTogglePublish} />
                ))}
              </div>
            </div>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <div className="space-y-3">
              {pinned.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">More Showcase Items</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rest.map(item => (
                  <ShowcaseCard key={item.id} item={item} canManage={canManage}
                    onPin={handlePin} onTogglePublish={handleTogglePublish} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSave={handleAddItem}
          schoolId={profile?.school_id}
        />
      )}
    </div>
  );
}
