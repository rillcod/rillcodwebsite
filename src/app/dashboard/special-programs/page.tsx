'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  specialProgramPublicPath,
  slugifySpecialProgram,
  type SpecialProgramPage,
  type SpecialProgramContent,
} from '@/lib/special-programs/types';
import { brandContact } from '@/config/brand';

const EMPTY_CONTENT: SpecialProgramContent = {
  hero_blurb: '',
  season_badge: '',
  title_line1: 'Rillcod',
  title_line2: '',
  ages_label: 'Ages 8 – 18',
  age_min: 8,
  age_max: 18,
  duration_label: '',
  curriculum_heading: 'Curriculum',
  curriculum_intro: '',
  tracks: [],
  weeks: [],
};

type FormState = {
  title: string;
  slug: string;
  button_label: string;
  is_published: boolean;
  is_featured: boolean;
  starts_on: string;
  ends_on: string;
  registration_deadline: string;
  online_fee: string;
  onsite_fee: string;
  deposit_percent: string;
  contentJson: string;
};

function toForm(p?: SpecialProgramPage | null): FormState {
  if (!p) {
    return {
      title: '',
      slug: '',
      button_label: '',
      is_published: false,
      is_featured: false,
      starts_on: '',
      ends_on: '',
      registration_deadline: '',
      online_fee: '50000',
      onsite_fee: '100000',
      deposit_percent: '50',
      contentJson: JSON.stringify(EMPTY_CONTENT, null, 2),
    };
  }
  return {
    title: p.title,
    slug: p.slug,
    button_label: p.button_label,
    is_published: p.is_published,
    is_featured: p.is_featured,
    starts_on: p.starts_on || '',
    ends_on: p.ends_on || '',
    registration_deadline: p.registration_deadline || '',
    online_fee: String(p.online_fee),
    onsite_fee: String(p.onsite_fee),
    deposit_percent: String(p.deposit_percent),
    contentJson: JSON.stringify({ ...EMPTY_CONTENT, ...p.content }, null, 2),
  };
}

export default function SpecialProgramsAdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SpecialProgramPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SpecialProgramPage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());

  const isAdmin = profile?.role === 'admin';
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : brandContact.siteUrl;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/special-programs', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load');
      setRows(j.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load special programmes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    load();
  }, [authLoading, isAdmin, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(toForm());
    setShowForm(true);
  };

  const openEdit = (p: SpecialProgramPage) => {
    setEditing(p);
    setForm(toForm(p));
    setShowForm(true);
  };

  const copyUrl = (slug: string) => {
    const url = `${siteOrigin}${specialProgramPublicPath(slug)}`;
    navigator.clipboard?.writeText(url);
    toast.success('Public URL copied');
  };

  const setFeatured = async (id: string) => {
    try {
      const res = await fetch(`/api/special-programs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_featured: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Homepage button now points to this programme');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to set featured');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this special programme page?')) return;
    try {
      const res = await fetch(`/api/special-programs/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Deleted');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    let content: SpecialProgramContent = EMPTY_CONTENT;
    try {
      content = JSON.parse(form.contentJson);
    } catch {
      toast.error('Content JSON is invalid');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || slugifySpecialProgram(form.title),
        button_label: form.button_label.trim() || form.title.trim(),
        is_published: form.is_published,
        is_featured: form.is_featured,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        registration_deadline: form.registration_deadline || null,
        online_fee: parseFloat(form.online_fee) || 0,
        onsite_fee: parseFloat(form.onsite_fee) || 0,
        deposit_percent: parseFloat(form.deposit_percent) || 50,
        content,
      };
      const res = await fetch(editing ? `/api/special-programs/${editing.id}` : '/api/special-programs', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      toast.success(editing ? 'Updated' : 'Created');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return <div className="p-8 text-sm text-rose-500">Admin access required.</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academics</p>
          <h1 className="text-2xl font-black text-foreground">Special Programmes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Create full registration pages with auto URLs. Publish many; set one as featured for the homepage button.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-black uppercase tracking-widest"
        >
          New special programme
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No special programmes yet. Create one to generate a public URL.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="border border-border rounded-xl bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-foreground truncate">{p.title}</h2>
                  {p.is_featured && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      Featured
                    </span>
                  )}
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${p.is_published ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                    {p.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                  {siteOrigin}{specialProgramPublicPath(p.slug)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Button: {p.button_label}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button type="button" onClick={() => copyUrl(p.slug)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Copy URL
                </button>
                <Link href={specialProgramPublicPath(p.slug)} target="_blank" className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Open
                </Link>
                {!p.is_featured && (
                  <button type="button" onClick={() => setFeatured(p.id)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-amber-500/40 text-amber-500 rounded-md hover:bg-amber-500/10">
                    Set featured
                  </button>
                )}
                <button type="button" onClick={() => openEdit(p)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-md hover:bg-muted">
                  Edit
                </button>
                <button type="button" onClick={() => remove(p.id)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-rose-500/30 text-rose-500 rounded-md hover:bg-rose-500/10">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4">
          <form onSubmit={save} className="w-full max-w-2xl bg-card border border-border rounded-2xl p-5 my-8 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">{editing ? 'Edit programme' : 'New special programme'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs font-bold text-muted-foreground">Close</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Title
                <input
                  required
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((f) => ({
                      ...f,
                      title,
                      slug: f.slug || slugifySpecialProgram(title),
                      button_label: f.button_label || title,
                      contentJson: (() => {
                        try {
                          const c = JSON.parse(f.contentJson);
                          if (!editing && !c.title_line2) c.title_line2 = title;
                          return JSON.stringify(c, null, 2);
                        } catch { return f.contentJson; }
                      })(),
                    }));
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                URL slug
                <input
                  required
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugifySpecialProgram(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono normal-case tracking-normal"
                />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground sm:col-span-2">
                Homepage button label
                <input
                  value={form.button_label}
                  onChange={(e) => setForm((f) => ({ ...f, button_label: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-semibold normal-case tracking-normal"
                />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Starts
                <input type="date" value={form.starts_on} onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Ends
                <input type="date" value={form.ends_on} onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground sm:col-span-2">
                Registration deadline
                <input type="date" value={form.registration_deadline} onChange={(e) => setForm((f) => ({ ...f, registration_deadline: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Online fee (NGN)
                <input type="number" value={form.online_fee} onChange={(e) => setForm((f) => ({ ...f, online_fee: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Onsite fee (NGN)
                <input type="number" value={form.onsite_fee} onChange={(e) => setForm((f) => ({ ...f, onsite_fee: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Deposit %
                <input type="number" value={form.deposit_percent} onChange={(e) => setForm((f) => ({ ...f, deposit_percent: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm normal-case tracking-normal" />
              </label>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
                Published
              </label>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />
                Featured on homepage
              </label>
            </div>

            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Page content (JSON — tracks, weeks, hero copy)
              <textarea
                value={form.contentJson}
                onChange={(e) => setForm((f) => ({ ...f, contentJson: e.target.value }))}
                rows={14}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-xs font-mono normal-case tracking-normal"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-black uppercase tracking-widest border border-border rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-black uppercase tracking-widest bg-primary text-white rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
