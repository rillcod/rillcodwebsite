'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import {
  specialProgramPublicPath,
  slugifySpecialProgram,
  formatSpecialDate,
  resolveSpecialBonus,
  resolveSpecialOutcomes,
  DEFAULT_WEEKS_HEADING,
  DEFAULT_WEEKS_INTRO,
  DEFAULT_OUTCOMES_HEADING,
  DEFAULT_OUTCOMES_INTRO,
  DEFAULT_REGISTER_HEADING,
  DEFAULT_NEXT_PATH_HEADING,
  DEFAULT_NEXT_PATH_INTRO,
  DEFAULT_SPECIAL_BONUS,
  DEFAULT_SPECIAL_OUTCOMES,
  type SpecialProgramPage,
  type SpecialProgramContent,
  type SpecialProgramTrack,
  type SpecialProgramWeek,
  type SpecialProgramOutcome,
} from '@/lib/special-programs/types';
import {
  applySpecialProgramAiDraft,
  type AiApplyMode,
  type AiBuildScope,
  type SpecialProgramFormState,
} from '@/lib/special-programs/apply-ai-draft';
import { brandContact } from '@/config/brand';

const fieldCls =
  'mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-semibold normal-case tracking-normal text-foreground';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-muted-foreground';
const textareaCls = `${fieldCls} min-h-[72px] resize-y`;

export const EMPTY_SPECIAL_CONTENT: SpecialProgramContent = {
  hero_blurb: '',
  season_badge: '',
  title_line1: 'Rillcod',
  title_line2: '',
  ages_label: 'Ages 8+ · Kids, teens & adults',
  age_min: 8,
  age_max: 99,
  duration_label: '',
  curriculum_heading: 'Curriculum',
  curriculum_intro: '',
  tracks: [],
  weeks: [],
  weeks_heading: DEFAULT_WEEKS_HEADING,
  weeks_intro: DEFAULT_WEEKS_INTRO,
  bonus: { ...DEFAULT_SPECIAL_BONUS, items: DEFAULT_SPECIAL_BONUS.items.map((i) => ({ ...i })) },
  outcomes_heading: DEFAULT_OUTCOMES_HEADING,
  outcomes_intro: DEFAULT_OUTCOMES_INTRO,
  outcomes: DEFAULT_SPECIAL_OUTCOMES.map((o) => ({ ...o })),
  register_heading: DEFAULT_REGISTER_HEADING,
  next_path_heading: DEFAULT_NEXT_PATH_HEADING,
  next_path_intro: DEFAULT_NEXT_PATH_INTRO,
};

export function emptySpecialTrack(): SpecialProgramTrack {
  return {
    id: `track_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    icon: '📚',
    week: '',
    title: '',
    desc: '',
    topics: [''],
  };
}

export function emptySpecialWeek(): SpecialProgramWeek {
  return { num: '', tag: '', title: '', desc: '' };
}

export function emptySpecialOutcome(): SpecialProgramOutcome {
  return { icon: '⭐', title: '', desc: '' };
}

export function toSpecialForm(p?: SpecialProgramPage | null): SpecialProgramFormState {
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
      onsite_fee: '40000',
      deposit_percent: '50',
      content: {
        ...EMPTY_SPECIAL_CONTENT,
        tracks: [],
        weeks: [],
        bonus: { ...DEFAULT_SPECIAL_BONUS, items: DEFAULT_SPECIAL_BONUS.items.map((i) => ({ ...i })) },
        outcomes: DEFAULT_SPECIAL_OUTCOMES.map((o) => ({ ...o })),
      },
    };
  }
  const c = { ...EMPTY_SPECIAL_CONTENT, ...(p.content || {}) };
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
      tracks: Array.isArray(c.tracks)
        ? c.tracks.map((t) => ({ ...t, topics: t.topics?.length ? [...t.topics] : [''] }))
        : [],
      weeks: Array.isArray(c.weeks) ? c.weeks.map((w) => ({ ...w })) : [],
      bonus: c.bonus
        ? {
            ...DEFAULT_SPECIAL_BONUS,
            ...c.bonus,
            items: Array.isArray(c.bonus.items) && c.bonus.items.length
              ? c.bonus.items.map((i) => ({ ...i }))
              : DEFAULT_SPECIAL_BONUS.items.map((i) => ({ ...i })),
          }
        : { ...DEFAULT_SPECIAL_BONUS, items: DEFAULT_SPECIAL_BONUS.items.map((i) => ({ ...i })) },
      outcomes: Array.isArray(c.outcomes) && c.outcomes.length
        ? c.outcomes.map((o) => ({ ...o }))
        : DEFAULT_SPECIAL_OUTCOMES.map((o) => ({ ...o })),
    },
  };
}

type Selection =
  | 'basics'
  | 'hero'
  | 'tracks'
  | `track:${string}`
  | 'bonus'
  | 'weeks'
  | `week:${number}`
  | 'outcomes'
  | 'register'
  | 'ai';

type Props = {
  editing: SpecialProgramPage | null;
  initialForm: SpecialProgramFormState;
  onClose: () => void;
  onSaved: () => void;
};

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SectionHit({
  selected,
  onSelect,
  label,
  children,
  className = '',
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative rounded-2xl transition-all cursor-pointer outline-none ${
        selected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'hover:ring-1 hover:ring-primary/40'
      } ${className}`}
    >
      <span className="absolute -top-2 left-3 z-10 rounded bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white opacity-90">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function SpecialProgramVisualBuilder({ editing, initialForm, onClose, onSaved }: Props) {
  const [form, setForm] = useState<SpecialProgramFormState>(initialForm);
  const [selection, setSelection] = useState<Selection>('hero');
  const [saving, setSaving] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiMode, setAiMode] = useState<AiApplyMode>(editing ? 'fill_empty' : 'replace');
  const [aiScope, setAiScope] = useState<AiBuildScope>('full');
  const [showAiPanel, setShowAiPanel] = useState(!editing);

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : brandContact.siteUrl;
  const content = form.content;
  const tracks = content.tracks || [];
  const weeks = content.weeks || [];
  const bonus = resolveSpecialBonus(content);
  const outcomes = resolveSpecialOutcomes(content);
  const ageMin = content.age_min ?? 8;
  const ageMax = content.age_max ?? 18;

  const previewPage = useMemo(
    () => ({
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      registration_deadline: form.registration_deadline || null,
      title: form.title || 'Untitled programme',
      online_fee: Number(form.online_fee) || 0,
      onsite_fee: Number(form.onsite_fee) || 0,
      deposit_percent: Number(form.deposit_percent) || 50,
    }),
    [form],
  );

  const patchContent = (patch: Partial<SpecialProgramContent>) => {
    setForm((f) => ({ ...f, content: { ...f.content, ...patch } }));
  };

  const patchBonus = (patch: Partial<NonNullable<SpecialProgramContent['bonus']>>) => {
    setForm((f) => ({
      ...f,
      content: {
        ...f.content,
        bonus: { ...(f.content.bonus || {}), ...patch },
      },
    }));
  };

  const runAiBuild = async () => {
    const brief = aiBrief.trim() || form.title.trim();
    if (!brief) {
      toast.error('Add a short brief or title for AI to build from');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch('/api/ai/special-program-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          title: form.title || undefined,
          duration_weeks: parseInt(String(form.content.duration_label || '').replace(/\D/g, ''), 10) || 7,
          age_min: form.content.age_min || 8,
          age_max: form.content.age_max || 18,
          mode: 'both',
          scope: aiScope,
          existing: aiScope === 'full' ? undefined : { title: form.title, content: form.content },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'AI build failed');
      setForm((f) => applySpecialProgramAiDraft(f, j.data || {}, aiMode, aiScope));
      toast.success(aiMode === 'replace' ? 'AI draft applied — click any section to customize' : 'AI filled empty fields');
      if (aiScope === 'bonus') setSelection('bonus');
      else if (aiScope === 'outcomes') setSelection('outcomes');
      else if (aiScope === 'tracks') setSelection('tracks');
      else if (aiScope === 'weeks') setSelection('weeks');
      else setSelection('hero');
      setShowAiPanel(false);
    } catch (e: any) {
      toast.error(e.message || 'AI build failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      setSelection('basics');
      return;
    }
    if (!form.slug.trim()) {
      toast.error('URL slug is required');
      setSelection('basics');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        slug: slugifySpecialProgram(form.slug),
        button_label: form.button_label.trim() || form.title.trim(),
        is_published: form.is_published,
        is_featured: form.is_featured,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        registration_deadline: form.registration_deadline || null,
        online_fee: Number(form.online_fee) || 0,
        onsite_fee: Number(form.onsite_fee) || 0,
        deposit_percent: Number(form.deposit_percent) || 50,
        content: {
          ...form.content,
          tracks: (form.content.tracks || []).map((t) => ({
            ...t,
            topics: (t.topics || []).filter((x) => String(x).trim()),
          })),
        },
      };
      const url = editing ? `/api/special-programs/${editing.id}` : '/api/special-programs';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      toast.success(editing ? 'Page updated' : 'Page created');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inspectorTitle = (() => {
    if (selection === 'basics') return 'Basics & fees';
    if (selection === 'hero') return 'Hero';
    if (selection === 'tracks') return 'Modules';
    if (selection.startsWith('track:')) return 'Edit module';
    if (selection === 'bonus') return 'Bonus track';
    if (selection === 'weeks') return 'Weekly plan';
    if (selection.startsWith('week:')) return 'Edit week';
    if (selection === 'outcomes') return 'Outcomes';
    if (selection === 'register') return 'Registration';
    if (selection === 'ai') return 'AI Build';
    return 'Edit';
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Visual page builder
          </p>
          <h2 className="text-sm sm:text-base font-black truncate">
            {editing ? `Edit: ${form.title || editing.title}` : 'New special programme'}
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {siteOrigin}{specialProgramPublicPath(form.slug || 'your-slug')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAiPanel((v) => !v);
              setSelection('ai');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-muted"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Build
          </button>
          <button
            type="button"
            onClick={() => setSelection('basics')}
            className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-muted"
          >
            Basics
          </button>
          {form.slug ? (
            <a
              href={specialProgramPublicPath(form.slug)}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-muted"
            >
              Open URL
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-primary text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save page'}
          </button>
        </div>
      </header>

      {(showAiPanel || selection === 'ai') && (
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelCls} flex-1 min-w-[220px]`}>
              AI brief
              <textarea
                rows={2}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                className={textareaCls}
                placeholder="e.g. 6-week AI summer school for ages 8–17 in Benin City…"
              />
            </label>
            <label className={labelCls}>
              Scope
              <select value={aiScope} onChange={(e) => setAiScope(e.target.value as AiBuildScope)} className={fieldCls}>
                <option value="full">Full page</option>
                <option value="hero">Hero only</option>
                <option value="tracks">Modules only</option>
                <option value="weeks">Weeks only</option>
                <option value="bonus">Bonus only</option>
                <option value="outcomes">Outcomes only</option>
              </select>
            </label>
            <label className={labelCls}>
              Apply
              <select value={aiMode} onChange={(e) => setAiMode(e.target.value as AiApplyMode)} className={fieldCls}>
                <option value="replace">Overwrite</option>
                <option value="fill_empty">Fill empty only</option>
              </select>
            </label>
            <button
              type="button"
              disabled={aiGenerating}
              onClick={() => void runAiBuild()}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-primary text-white rounded-lg disabled:opacity-50 h-[42px] mt-auto"
            >
              {aiGenerating ? 'Generating…' : 'Generate'}
            </button>
            <button
              type="button"
              onClick={() => setShowAiPanel(false)}
              className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg h-[42px] mt-auto"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6" onClick={() => setSelection('basics')}>
          <div className="max-w-5xl mx-auto space-y-10 pb-24" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[11px] font-semibold text-muted-foreground">
              Click any section on the page to edit it in the panel →
            </p>

            <SectionHit selected={selection === 'hero' || selection === 'basics'} onSelect={() => setSelection('hero')} label="Hero">
              <section className="text-center space-y-6 py-8 bg-background/80 rounded-2xl border border-border/60 px-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                  ☀️ {content.season_badge || form.title || 'Season badge'}
                </div>
                <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter leading-none">
                  {content.title_line1 || 'Rillcod'} <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600">
                    {content.title_line2 || form.title || 'Programme title'}
                  </span>
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  {content.hero_blurb || 'Hero blurb for parents…'}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto pt-4">
                  {[
                    { label: 'Start Date', val: formatSpecialDate(previewPage.starts_on) },
                    { label: 'Deadline', val: formatSpecialDate(previewPage.registration_deadline), highlight: true },
                    { label: 'Ending Date', val: formatSpecialDate(previewPage.ends_on) },
                    { label: 'Duration', val: content.duration_label || 'Cohort' },
                    { label: 'Audience', val: content.ages_label || `Ages ${ageMin} – ${ageMax}` },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className={`border p-3 rounded-xl ${m.highlight ? 'bg-rose-500/15 border-rose-500/30 text-rose-500' : 'bg-card border-border'}`}
                    >
                      <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">{m.label}</p>
                      <p className="text-xs font-black mt-1">{m.val}</p>
                    </div>
                  ))}
                </div>
              </section>
            </SectionHit>

            <SectionHit selected={selection === 'tracks' || selection.startsWith('track:')} onSelect={() => setSelection('tracks')} label="Modules">
              <section className="space-y-6 bg-background/80 rounded-2xl border border-border/60 p-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black uppercase">{content.curriculum_heading || 'Curriculum'}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">{content.curriculum_intro || ''}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tracks.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-6">No modules yet — edit in the panel or use AI.</p>
                  )}
                  {tracks.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection(`track:${t.id}`);
                      }}
                      className={`bg-card border p-5 rounded-2xl text-left ${
                        selection === `track:${t.id}` ? 'border-primary ring-1 ring-primary' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">{t.icon || '📚'}</span>
                        <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase">
                          {t.week || 'Module'}
                        </span>
                      </div>
                      <h3 className="text-sm font-black uppercase">{t.title || 'Untitled module'}</h3>
                      <p className="text-xs text-muted-foreground mt-2">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </SectionHit>

            {bonus.enabled && (
              <SectionHit selected={selection === 'bonus'} onSelect={() => setSelection('bonus')} label="Bonus">
                <section className="bg-gradient-to-r from-amber-500/5 to-emerald-500/5 border border-amber-500/20 rounded-3xl p-6 sm:p-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{bonus.icon}</span>
                    <div>
                      <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest">{bonus.badge}</p>
                      <h3 className="text-xl font-black uppercase">{bonus.title}</h3>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">{bonus.desc}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {bonus.items.map((b) => (
                      <div key={b.label} className="bg-card/50 border border-border/50 p-3 rounded-xl">
                        <p className="text-xs font-black">{b.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{b.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </SectionHit>
            )}
            {!bonus.enabled && (
              <button
                type="button"
                onClick={() => {
                  patchBonus({ enabled: true });
                  setSelection('bonus');
                }}
                className="w-full py-3 border border-dashed border-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted"
              >
                Bonus section hidden — click to enable
              </button>
            )}

            <SectionHit selected={selection === 'weeks' || selection.startsWith('week:')} onSelect={() => setSelection('weeks')} label="Weeks">
              <section className="space-y-6 bg-background/80 rounded-2xl border border-border/60 p-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black uppercase">
                    {(content.weeks_heading || '').trim() || DEFAULT_WEEKS_HEADING}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
                    {(content.weeks_intro || '').trim() || DEFAULT_WEEKS_INTRO}
                  </p>
                </div>
                <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-card">
                  {weeks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No weeks yet.</p>
                  )}
                  {weeks.map((w, i) => (
                    <div
                      key={`${w.num}-${i}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection(`week:${i}`);
                      }}
                      className={`p-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-left ${
                        selection === `week:${i}` ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="text-xs font-black text-amber-500 uppercase tracking-widest">{w.num || `Week ${i + 1}`}</span>
                        <div className="text-[9px] font-black text-foreground/50 bg-muted border border-border w-fit px-2 py-0.5 rounded-full uppercase">
                          {w.tag || 'tag'}
                        </div>
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <h4 className="text-sm font-black uppercase">{w.title || 'Untitled'}</h4>
                        <p className="text-xs text-muted-foreground">{w.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </SectionHit>

            <SectionHit selected={selection === 'outcomes'} onSelect={() => setSelection('outcomes')} label="Outcomes">
              <section className="space-y-6 bg-background/80 rounded-2xl border border-border/60 p-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-black uppercase">
                    {(content.outcomes_heading || '').trim() || DEFAULT_OUTCOMES_HEADING}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
                    {(content.outcomes_intro || '').trim() || DEFAULT_OUTCOMES_INTRO}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {outcomes.map((o, i) => (
                    <div key={`${o.title}-${i}`} className="bg-card border border-border p-4 rounded-xl text-center space-y-1">
                      <span className="text-2xl block">{o.icon}</span>
                      <h4 className="text-xs font-black uppercase tracking-wider">{o.title}</h4>
                      <p className="text-[11px] text-muted-foreground">{o.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </SectionHit>

            <SectionHit selected={selection === 'register'} onSelect={() => setSelection('register')} label="Register">
              <section className="bg-card border border-border rounded-2xl p-6 space-y-3 opacity-90">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-black uppercase">
                    {(content.register_heading || '').trim() || DEFAULT_REGISTER_HEADING}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Live registration form appears here on the public page. Fees: Online ₦{Number(form.online_fee || 0).toLocaleString()} · Onsite ₦{Number(form.onsite_fee || 0).toLocaleString()} · Deposit {form.deposit_percent}%
                </p>
                <div className="h-24 rounded-xl border border-dashed border-border bg-muted/40 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Form preview (non-interactive)
                </div>
              </section>
            </SectionHit>
          </div>
        </div>

        {/* Inspector */}
        <aside className="w-full lg:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto max-h-[45vh] lg:max-h-none">
          <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest">{inspectorTitle}</h3>
            <button
              type="button"
              onClick={() => setSelection('basics')}
              className="text-[10px] font-bold text-muted-foreground hover:text-foreground"
            >
              Basics
            </button>
          </div>
          <div className="p-4 space-y-4">
            {(selection === 'basics' || selection === 'register') && (
              <>
                <label className={labelCls}>
                  Title
                  <input
                    value={form.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      setForm((f) => ({
                        ...f,
                        title,
                        slug: editing ? f.slug : f.slug || slugifySpecialProgram(title),
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
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: slugifySpecialProgram(e.target.value) }))}
                    className={`${fieldCls} font-mono`}
                  />
                </label>
                <label className={labelCls}>
                  Homepage button label
                  <input
                    value={form.button_label}
                    onChange={(e) => setForm((f) => ({ ...f, button_label: e.target.value }))}
                    className={fieldCls}
                  />
                </label>
                {selection === 'register' && (
                  <label className={labelCls}>
                    Registration form heading
                    <input
                      value={form.content.register_heading || ''}
                      onChange={(e) => patchContent({ register_heading: e.target.value })}
                      className={fieldCls}
                    />
                  </label>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    Starts
                    <input type="date" value={form.starts_on} onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Ends
                    <input type="date" value={form.ends_on} onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))} className={fieldCls} />
                  </label>
                </div>
                <label className={labelCls}>
                  Registration deadline
                  <input type="date" value={form.registration_deadline} onChange={(e) => setForm((f) => ({ ...f, registration_deadline: e.target.value }))} className={fieldCls} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    Online fee
                    <input type="number" value={form.online_fee} onChange={(e) => setForm((f) => ({ ...f, online_fee: e.target.value }))} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Onsite fee
                    <input type="number" value={form.onsite_fee} onChange={(e) => setForm((f) => ({ ...f, onsite_fee: e.target.value }))} className={fieldCls} />
                  </label>
                </div>
                <label className={labelCls}>
                  Deposit %
                  <input type="number" min={1} max={100} value={form.deposit_percent} onChange={(e) => setForm((f) => ({ ...f, deposit_percent: e.target.value }))} className={fieldCls} />
                </label>
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
                    Published
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />
                    Featured (homepage)
                  </label>
                </div>
              </>
            )}

            {selection === 'hero' && (
              <>
                <label className={labelCls}>
                  Season badge
                  <input value={content.season_badge || ''} onChange={(e) => patchContent({ season_badge: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Title line 1
                  <input value={content.title_line1 || ''} onChange={(e) => patchContent({ title_line1: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Title line 2
                  <input value={content.title_line2 || ''} onChange={(e) => patchContent({ title_line2: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Hero blurb
                  <textarea value={content.hero_blurb || ''} onChange={(e) => patchContent({ hero_blurb: e.target.value })} className={textareaCls} rows={3} />
                </label>
                <label className={labelCls}>
                  Duration label
                  <input value={content.duration_label || ''} onChange={(e) => patchContent({ duration_label: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Ages label
                  <input value={content.ages_label || ''} onChange={(e) => patchContent({ ages_label: e.target.value })} className={fieldCls} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    Age min
                    <input type="number" value={content.age_min ?? 8} onChange={(e) => patchContent({ age_min: parseInt(e.target.value, 10) || 8 })} className={fieldCls} />
                  </label>
                  <label className={labelCls}>
                    Age max
                    <input type="number" value={content.age_max ?? 18} onChange={(e) => patchContent({ age_max: parseInt(e.target.value, 10) || 18 })} className={fieldCls} />
                  </label>
                </div>
                <label className={labelCls}>
                  Curriculum heading
                  <input value={content.curriculum_heading || ''} onChange={(e) => patchContent({ curriculum_heading: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Curriculum intro
                  <textarea value={content.curriculum_intro || ''} onChange={(e) => patchContent({ curriculum_intro: e.target.value })} className={textareaCls} rows={2} />
                </label>
              </>
            )}

            {(selection === 'tracks' || selection.startsWith('track:')) && (
              <>
                {selection === 'tracks' && (
                  <>
                    <label className={labelCls}>
                      Curriculum heading
                      <input value={content.curriculum_heading || ''} onChange={(e) => patchContent({ curriculum_heading: e.target.value })} className={fieldCls} />
                    </label>
                    <label className={labelCls}>
                      Curriculum intro
                      <textarea value={content.curriculum_intro || ''} onChange={(e) => patchContent({ curriculum_intro: e.target.value })} className={textareaCls} rows={2} />
                    </label>
                    <button
                      type="button"
                      onClick={() => patchContent({ tracks: [...tracks, emptySpecialTrack()] })}
                      className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest"
                    >
                      + Add module
                    </button>
                    <ul className="space-y-2">
                      {tracks.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
                          <button type="button" className="text-xs font-bold flex-1 text-left truncate" onClick={() => setSelection(`track:${t.id}`)}>
                            {t.icon} {t.title || `Module ${i + 1}`}
                          </button>
                          <button type="button" className="text-[10px] font-bold" disabled={i === 0} onClick={() => patchContent({ tracks: moveItem(tracks, i, i - 1) })}>↑</button>
                          <button type="button" className="text-[10px] font-bold" disabled={i === tracks.length - 1} onClick={() => patchContent({ tracks: moveItem(tracks, i, i + 1) })}>↓</button>
                          <button
                            type="button"
                            className="text-[10px] font-bold text-rose-500"
                            onClick={() => patchContent({ tracks: tracks.filter((x) => x.id !== t.id) })}
                          >
                            Del
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {selection.startsWith('track:') && (() => {
                  const id = selection.slice(6);
                  const idx = tracks.findIndex((t) => t.id === id);
                  const t = tracks[idx];
                  if (!t) return <p className="text-sm text-muted-foreground">Module not found.</p>;
                  const update = (patch: Partial<SpecialProgramTrack>) => {
                    const next = tracks.map((x) => (x.id === id ? { ...x, ...patch } : x));
                    patchContent({ tracks: next });
                  };
                  return (
                    <>
                      <button type="button" onClick={() => setSelection('tracks')} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        ← All modules
                      </button>
                      <label className={labelCls}>
                        Icon (emoji)
                        <input value={t.icon} onChange={(e) => update({ icon: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Week / module label
                        <input value={t.week} onChange={(e) => update({ week: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Title
                        <input value={t.title} onChange={(e) => update({ title: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Description
                        <textarea value={t.desc} onChange={(e) => update({ desc: e.target.value })} className={textareaCls} rows={3} />
                      </label>
                      <div className="space-y-2">
                        <p className={labelCls}>Topics</p>
                        {(t.topics || []).map((topic, ti) => (
                          <div key={ti} className="flex gap-2">
                            <input
                              value={topic}
                              onChange={(e) => {
                                const topics = [...(t.topics || [])];
                                topics[ti] = e.target.value;
                                update({ topics });
                              }}
                              className={fieldCls}
                            />
                            <button
                              type="button"
                              className="text-[10px] font-bold text-rose-500 shrink-0"
                              onClick={() => update({ topics: (t.topics || []).filter((_, j) => j !== ti) })}
                            >
                              Del
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => update({ topics: [...(t.topics || []), ''] })}
                          className="text-[10px] font-black uppercase tracking-widest"
                        >
                          + Topic
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}

            {selection === 'bonus' && (
              <>
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={content.bonus?.enabled !== false}
                    onChange={(e) => patchBonus({ enabled: e.target.checked })}
                  />
                  Show bonus section
                </label>
                <label className={labelCls}>
                  Badge
                  <input value={content.bonus?.badge || ''} onChange={(e) => patchBonus({ badge: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Icon
                  <input value={content.bonus?.icon || ''} onChange={(e) => patchBonus({ icon: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Title
                  <input value={content.bonus?.title || ''} onChange={(e) => patchBonus({ title: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Description
                  <textarea value={content.bonus?.desc || ''} onChange={(e) => patchBonus({ desc: e.target.value })} className={textareaCls} rows={3} />
                </label>
                <div className="space-y-2">
                  <p className={labelCls}>Highlight items</p>
                  {(content.bonus?.items || []).map((item, i) => (
                    <div key={i} className="border border-border rounded-lg p-2 space-y-2">
                      <input
                        value={item.label}
                        placeholder="Label"
                        onChange={(e) => {
                          const items = [...(content.bonus?.items || [])];
                          items[i] = { ...items[i], label: e.target.value };
                          patchBonus({ items });
                        }}
                        className={fieldCls}
                      />
                      <input
                        value={item.desc}
                        placeholder="Description"
                        onChange={(e) => {
                          const items = [...(content.bonus?.items || [])];
                          items[i] = { ...items[i], desc: e.target.value };
                          patchBonus({ items });
                        }}
                        className={fieldCls}
                      />
                      <button
                        type="button"
                        className="text-[10px] font-bold text-rose-500"
                        onClick={() => patchBonus({ items: (content.bonus?.items || []).filter((_, j) => j !== i) })}
                      >
                        Remove item
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchBonus({ items: [...(content.bonus?.items || []), { label: '', desc: '' }] })}
                    className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest"
                  >
                    + Item
                  </button>
                </div>
              </>
            )}

            {(selection === 'weeks' || selection.startsWith('week:')) && (
              <>
                {selection === 'weeks' && (
                  <>
                    <label className={labelCls}>
                      Section heading
                      <input value={content.weeks_heading || ''} onChange={(e) => patchContent({ weeks_heading: e.target.value })} className={fieldCls} />
                    </label>
                    <label className={labelCls}>
                      Section intro
                      <textarea value={content.weeks_intro || ''} onChange={(e) => patchContent({ weeks_intro: e.target.value })} className={textareaCls} rows={2} />
                    </label>
                    <button
                      type="button"
                      onClick={() => patchContent({ weeks: [...weeks, emptySpecialWeek()] })}
                      className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest"
                    >
                      + Add week
                    </button>
                    <ul className="space-y-2">
                      {weeks.map((w, i) => (
                        <li key={i} className="flex items-center gap-2 border border-border rounded-lg px-2 py-1.5">
                          <button type="button" className="text-xs font-bold flex-1 text-left truncate" onClick={() => setSelection(`week:${i}`)}>
                            {w.num || `Week ${i + 1}`} — {w.title || 'Untitled'}
                          </button>
                          <button type="button" className="text-[10px] font-bold" disabled={i === 0} onClick={() => patchContent({ weeks: moveItem(weeks, i, i - 1) })}>↑</button>
                          <button type="button" className="text-[10px] font-bold" disabled={i === weeks.length - 1} onClick={() => patchContent({ weeks: moveItem(weeks, i, i + 1) })}>↓</button>
                          <button
                            type="button"
                            className="text-[10px] font-bold text-rose-500"
                            onClick={() => patchContent({ weeks: weeks.filter((_, j) => j !== i) })}
                          >
                            Del
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {selection.startsWith('week:') && (() => {
                  const idx = parseInt(selection.slice(5), 10);
                  const w = weeks[idx];
                  if (!w) return <p className="text-sm text-muted-foreground">Week not found.</p>;
                  const update = (patch: Partial<SpecialProgramWeek>) => {
                    const next = weeks.map((x, i) => (i === idx ? { ...x, ...patch } : x));
                    patchContent({ weeks: next });
                  };
                  return (
                    <>
                      <button type="button" onClick={() => setSelection('weeks')} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        ← All weeks
                      </button>
                      <label className={labelCls}>
                        Week label
                        <input value={w.num} onChange={(e) => update({ num: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Tag
                        <input value={w.tag} onChange={(e) => update({ tag: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Title
                        <input value={w.title} onChange={(e) => update({ title: e.target.value })} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        Description
                        <textarea value={w.desc} onChange={(e) => update({ desc: e.target.value })} className={textareaCls} rows={3} />
                      </label>
                    </>
                  );
                })()}
              </>
            )}

            {selection === 'outcomes' && (
              <>
                <label className={labelCls}>
                  Heading
                  <input value={content.outcomes_heading || ''} onChange={(e) => patchContent({ outcomes_heading: e.target.value })} className={fieldCls} />
                </label>
                <label className={labelCls}>
                  Intro
                  <textarea value={content.outcomes_intro || ''} onChange={(e) => patchContent({ outcomes_intro: e.target.value })} className={textareaCls} rows={2} />
                </label>
                {(content.outcomes || []).map((o, i) => (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={o.icon}
                        className={`${fieldCls} w-16`}
                        onChange={(e) => {
                          const next = [...(content.outcomes || [])];
                          next[i] = { ...next[i], icon: e.target.value };
                          patchContent({ outcomes: next });
                        }}
                      />
                      <input
                        value={o.title}
                        className={fieldCls}
                        placeholder="Title"
                        onChange={(e) => {
                          const next = [...(content.outcomes || [])];
                          next[i] = { ...next[i], title: e.target.value };
                          patchContent({ outcomes: next });
                        }}
                      />
                    </div>
                    <textarea
                      value={o.desc}
                      className={textareaCls}
                      rows={2}
                      onChange={(e) => {
                        const next = [...(content.outcomes || [])];
                        next[i] = { ...next[i], desc: e.target.value };
                        patchContent({ outcomes: next });
                      }}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="text-[10px] font-bold" disabled={i === 0} onClick={() => patchContent({ outcomes: moveItem(content.outcomes || [], i, i - 1) })}>↑</button>
                      <button type="button" className="text-[10px] font-bold" disabled={i === (content.outcomes || []).length - 1} onClick={() => patchContent({ outcomes: moveItem(content.outcomes || [], i, i + 1) })}>↓</button>
                      <button
                        type="button"
                        className="text-[10px] font-bold text-rose-500 ml-auto"
                        onClick={() => patchContent({ outcomes: (content.outcomes || []).filter((_, j) => j !== i) })}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patchContent({ outcomes: [...(content.outcomes || []), emptySpecialOutcome()] })}
                  className="w-full py-2 border border-dashed border-border rounded-lg text-[10px] font-black uppercase tracking-widest"
                >
                  + Outcome
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
