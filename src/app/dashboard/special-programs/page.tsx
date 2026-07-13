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
  type SpecialProgramTrack,
  type SpecialProgramWeek,
} from '@/lib/special-programs/types';
import { brandContact } from '@/config/brand';

const fieldCls =
  'mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-semibold normal-case tracking-normal text-foreground';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-muted-foreground';

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
  content: SpecialProgramContent;
};

function emptyTrack(): SpecialProgramTrack {
  return {
    id: `track_${Date.now()}`,
    icon: '📚',
    week: '',
    title: '',
    desc: '',
    topics: [''],
  };
}

function emptyWeek(): SpecialProgramWeek {
  return { num: '', tag: '', title: '', desc: '' };
}

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
      content: { ...EMPTY_CONTENT, tracks: [], weeks: [] },
    };
  }
  const c = { ...EMPTY_CONTENT, ...(p.content || {}) };
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
    content: {
      ...c,
      tracks: Array.isArray(c.tracks) ? c.tracks.map((t) => ({ ...t, topics: t.topics?.length ? [...t.topics] : [''] })) : [],
      weeks: Array.isArray(c.weeks) ? c.weeks.map((w) => ({ ...w })) : [],
    },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border border-border rounded-xl p-4 bg-muted/20">
      <h3 className="text-xs font-black uppercase tracking-widest text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export default function SpecialProgramsAdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SpecialProgramPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SpecialProgramPage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(toForm());
  const [builderTab, setBuilderTab] = useState<'basics' | 'hero' | 'tracks' | 'weeks'>('basics');

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

  const patchContent = (patch: Partial<SpecialProgramContent>) => {
    setForm((f) => ({ ...f, content: { ...f.content, ...patch } }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(toForm());
    setBuilderTab('basics');
    setShowForm(true);
  };

  const openEdit = (p: SpecialProgramPage) => {
    setEditing(p);
    setForm(toForm(p));
    setBuilderTab('basics');
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
    const content: SpecialProgramContent = {
      ...form.content,
      tracks: (form.content.tracks || [])
        .filter((t) => t.title.trim())
        .map((t, i) => ({
          ...t,
          id: t.id || `track_${i + 1}`,
          topics: (t.topics || []).map((x) => x.trim()).filter(Boolean),
        })),
      weeks: (form.content.weeks || []).filter((w) => w.title.trim() || w.num.trim()),
    };
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
      toast.success(editing ? 'Updated' : 'Created — URL ready');
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

  const tracks = form.content.tracks || [];
  const weeks = form.content.weeks || [];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academics</p>
          <h1 className="text-2xl font-black text-foreground">Special Programmes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Build the full public page here (hero, modules, weeks, fees, deadline). Each programme gets a URL; set one as featured for the homepage button.
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
                  Button: {p.button_label} · {(p.content?.tracks || []).length} modules · {(p.content?.weeks || []).length} weeks
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
                  Edit page
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
          <form onSubmit={save} className="w-full max-w-3xl bg-card border border-border rounded-2xl p-5 my-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">{editing ? 'Edit programme page' : 'Build special programme page'}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  No code needed — fill tabs below, then publish.
                </p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs font-bold text-muted-foreground">Close</button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border pb-2">
              {([
                ['basics', 'Basics & fees'],
                ['hero', 'Hero copy'],
                ['tracks', 'Modules'],
                ['weeks', 'Weekly plan'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBuilderTab(id)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md ${builderTab === id ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {builderTab === 'basics' && (
              <Section title="Identity, schedule & pricing">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className={labelCls}>
                    Title
                    <input
                      required
                      value={form.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setForm((f) => ({
                          ...f,
                          title,
                          slug: editing ? f.slug : (f.slug || slugifySpecialProgram(title)),
                          button_label: f.button_label || title,
                          content: {
                            ...f.content,
                            title_line2: f.content.title_line2 || (!editing ? title : f.content.title_line2),
                          },
                        }));
                      }}
                      className={fieldCls}
                    />
                  </label>
                  <label className={labelCls}>
                    URL slug
                    <input
                      required
                      value={form.slug}
                      onChange={(e) => setForm((f) => ({ ...f, slug: slugifySpecialProgram(e.target.value) }))}
                      className={`${fieldCls} font-mono`}
                    />
                    <span className="mt-1 block text-[10px] font-mono text-muted-foreground normal-case tracking-normal">
                      {siteOrigin}{specialProgramPublicPath(form.slug || 'your-slug')}
                    </span>
                  </label>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Homepage button label
                    <input
                      value={form.button_label}
                      onChange={(e) => setForm((f) => ({ ...f, button_label: e.target.value }))}
                      className={fieldCls}
                      placeholder="☀️ AI Summer School"
                    />
                  </label>
                  <label className={labelCls}>
                    Starts
                    <input type="date" value={form.starts_on} onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Ends
                    <input type="date" value={form.ends_on} onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Registration deadline
                    <input type="date" value={form.registration_deadline} onChange={(e) => setForm((f) => ({ ...f, registration_deadline: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Online fee (NGN)
                    <input type="number" value={form.online_fee} onChange={(e) => setForm((f) => ({ ...f, online_fee: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Onsite fee (NGN)
                    <input type="number" value={form.onsite_fee} onChange={(e) => setForm((f) => ({ ...f, onsite_fee: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Deposit %
                    <input type="number" min={1} max={100} value={form.deposit_percent} onChange={(e) => setForm((f) => ({ ...f, deposit_percent: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Duration label
                    <input value={form.content.duration_label || ''} onChange={(e) => patchContent({ duration_label: e.target.value })} className={fieldCls} placeholder="7 Weeks Cohort" />
                  </label>
                  <label className={labelCls}>
                    Age min
                    <input type="number" value={form.content.age_min ?? 8} onChange={(e) => patchContent({ age_min: parseInt(e.target.value, 10) || 8 })} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Age max
                    <input type="number" value={form.content.age_max ?? 18} onChange={(e) => patchContent({ age_max: parseInt(e.target.value, 10) || 18 })} className={fieldCls} />
                  </label>
                  <label className={`${labelCls} sm:col-span-2`}>
                    Ages display label
                    <input value={form.content.ages_label || ''} onChange={(e) => patchContent({ ages_label: e.target.value })} className={fieldCls} placeholder="Ages 8 – 18" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
                    Published (public URL live)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />
                    Featured on homepage button
                  </label>
                </div>
              </Section>
            )}

            {builderTab === 'hero' && (
              <Section title="Hero section copy">
                <div className="grid gap-3">
                  <label className={labelCls}>
                    Season badge
                    <input value={form.content.season_badge || ''} onChange={(e) => patchContent({ season_badge: e.target.value })} className={fieldCls} placeholder="Active Season: Summer 2026" />
                  </label>
                  <label className={labelCls}>
                    Title line 1
                    <input value={form.content.title_line1 || ''} onChange={(e) => patchContent({ title_line1: e.target.value })} className={fieldCls} placeholder="Rillcod AI" />
                  </label>
                  <label className={labelCls}>
                    Title line 2 (highlighted)
                    <input value={form.content.title_line2 || ''} onChange={(e) => patchContent({ title_line2: e.target.value })} className={fieldCls} placeholder="Summer School" />
                  </label>
                  <label className={labelCls}>
                    Hero blurb
                    <textarea value={form.content.hero_blurb || ''} onChange={(e) => patchContent({ hero_blurb: e.target.value })} rows={3} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Curriculum heading
                    <input value={form.content.curriculum_heading || ''} onChange={(e) => patchContent({ curriculum_heading: e.target.value })} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Curriculum intro
                    <textarea value={form.content.curriculum_intro || ''} onChange={(e) => patchContent({ curriculum_intro: e.target.value })} rows={3} className={fieldCls} />
                  </label>
                </div>
              </Section>
            )}

            {builderTab === 'tracks' && (
              <Section title="Modules / tracks">
                <div className="space-y-4">
                  {tracks.map((t, ti) => (
                    <div key={t.id || ti} className="border border-border rounded-lg p-3 space-y-2 bg-background">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Module {ti + 1}</p>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-rose-500"
                          onClick={() => patchContent({ tracks: tracks.filter((_, i) => i !== ti) })}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-4 gap-2">
                        <label className={labelCls}>
                          Icon
                          <input
                            value={t.icon}
                            onChange={(e) => {
                              const next = [...tracks];
                              next[ti] = { ...t, icon: e.target.value };
                              patchContent({ tracks: next });
                            }}
                            className={fieldCls}
                          />
                        </label>
                        <label className={`${labelCls} sm:col-span-3`}>
                          Module label (e.g. Module 1 · Weeks 1–2)
                          <input
                            value={t.week}
                            onChange={(e) => {
                              const next = [...tracks];
                              next[ti] = { ...t, week: e.target.value };
                              patchContent({ tracks: next });
                            }}
                            className={fieldCls}
                          />
                        </label>
                      </div>
                      <label className={labelCls}>
                        Title
                        <input
                          value={t.title}
                          onChange={(e) => {
                            const next = [...tracks];
                            next[ti] = { ...t, title: e.target.value };
                            patchContent({ tracks: next });
                          }}
                          className={fieldCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Description
                        <textarea
                          value={t.desc}
                          onChange={(e) => {
                            const next = [...tracks];
                            next[ti] = { ...t, desc: e.target.value };
                            patchContent({ tracks: next });
                          }}
                          rows={2}
                          className={fieldCls}
                        />
                      </label>
                      <div className="space-y-1">
                        <p className={labelCls}>Topics</p>
                        {(t.topics || ['']).map((topic, xi) => (
                          <div key={xi} className="flex gap-2">
                            <input
                              value={topic}
                              onChange={(e) => {
                                const next = [...tracks];
                                const topics = [...(t.topics || [])];
                                topics[xi] = e.target.value;
                                next[ti] = { ...t, topics };
                                patchContent({ tracks: next });
                              }}
                              className={fieldCls}
                              placeholder={`Topic ${xi + 1}`}
                            />
                            <button
                              type="button"
                              className="text-[10px] font-bold text-muted-foreground px-2"
                              onClick={() => {
                                const next = [...tracks];
                                next[ti] = { ...t, topics: (t.topics || []).filter((_, i) => i !== xi) };
                                patchContent({ tracks: next });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-[10px] font-black uppercase tracking-widest text-primary"
                          onClick={() => {
                            const next = [...tracks];
                            next[ti] = { ...t, topics: [...(t.topics || []), ''] };
                            patchContent({ tracks: next });
                          }}
                        >
                          + Topic
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchContent({ tracks: [...tracks, emptyTrack()] })}
                    className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted"
                  >
                    + Add module
                  </button>
                </div>
              </Section>
            )}

            {builderTab === 'weeks' && (
              <Section title="Weekly plan">
                <div className="space-y-3">
                  {weeks.map((w, wi) => (
                    <div key={wi} className="border border-border rounded-lg p-3 space-y-2 bg-background">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Week row {wi + 1}</p>
                        <button type="button" className="text-[10px] font-bold text-rose-500" onClick={() => patchContent({ weeks: weeks.filter((_, i) => i !== wi) })}>
                          Remove
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className={labelCls}>
                          Week label
                          <input
                            value={w.num}
                            onChange={(e) => {
                              const next = [...weeks];
                              next[wi] = { ...w, num: e.target.value };
                              patchContent({ weeks: next });
                            }}
                            className={fieldCls}
                            placeholder="Week 1"
                          />
                        </label>
                        <label className={labelCls}>
                          Tag
                          <input
                            value={w.tag}
                            onChange={(e) => {
                              const next = [...weeks];
                              next[wi] = { ...w, tag: e.target.value };
                              patchContent({ weeks: next });
                            }}
                            className={fieldCls}
                            placeholder="Foundations"
                          />
                        </label>
                      </div>
                      <label className={labelCls}>
                        Title
                        <input
                          value={w.title}
                          onChange={(e) => {
                            const next = [...weeks];
                            next[wi] = { ...w, title: e.target.value };
                            patchContent({ weeks: next });
                          }}
                          className={fieldCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Description
                        <textarea
                          value={w.desc}
                          onChange={(e) => {
                            const next = [...weeks];
                            next[wi] = { ...w, desc: e.target.value };
                            patchContent({ weeks: next });
                          }}
                          rows={2}
                          className={fieldCls}
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchContent({ weeks: [...weeks, emptyWeek()] })}
                    className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted"
                  >
                    + Add week
                  </button>
                </div>
              </Section>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-border">
              <div className="flex gap-1">
                {builderTab !== 'basics' && (
                  <button
                    type="button"
                    onClick={() => setBuilderTab(builderTab === 'weeks' ? 'tracks' : builderTab === 'tracks' ? 'hero' : 'basics')}
                    className="px-3 py-2 text-xs font-black uppercase tracking-widest border border-border rounded-lg"
                  >
                    Back
                  </button>
                )}
                {builderTab !== 'weeks' && (
                  <button
                    type="button"
                    onClick={() => setBuilderTab(builderTab === 'basics' ? 'hero' : builderTab === 'hero' ? 'tracks' : 'weeks')}
                    className="px-3 py-2 text-xs font-black uppercase tracking-widest border border-border rounded-lg"
                  >
                    Next
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-black uppercase tracking-widest border border-border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-black uppercase tracking-widest bg-primary text-white rounded-lg disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save page'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
