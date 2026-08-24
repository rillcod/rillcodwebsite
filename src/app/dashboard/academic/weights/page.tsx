'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

const COMPONENTS = [
  ['theory', 'Theory / main examination'],
  ['classwork', 'Classwork'],
  ['practical', 'Practical / project'],
  ['assignments', 'Assignments'],
  ['attendance', 'Attendance'],
  ['assessment', 'Mid-term assessment'],
] as const;

const DEFAULTS: Record<string, number> = {
  theory: 20, classwork: 10, practical: 25, assignments: 20, attendance: 10, assessment: 15,
};

type NamedRelation = { name?: string | null } | Array<{ name?: string | null }> | null;
type TitledRelation = { title?: string | null } | Array<{ title?: string | null }> | null;
type ActiveScheme = {
  id: string;
  name: string;
  school_id?: string | null;
  course_id?: string | null;
  academic_term_id?: string | null;
  academic_offering_id?: string | null;
  components: unknown;
  schools?: NamedRelation;
  courses?: TitledRelation;
};

function relationLabel(value: NamedRelation | TitledRelation | undefined, key: 'name' | 'title'): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return null;
  const label = key === 'name' ? (row as { name?: string | null }).name : (row as { title?: string | null }).title;
  return typeof label === 'string' && label.trim() ? label : null;
}

function publishedComponents(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const next: Record<string, number> = {};
  let total = 0;
  for (const [key] of COMPONENTS) {
    const amount = Number(record[key]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) return null;
    next[key] = amount;
    total += amount;
  }
  return Math.abs(total - 100) <= 0.001 ? next : null;
}

export default function AcademicWeightsPage() {
  const { profile } = useAuth();
  const [name, setName] = useState('Rillcod balanced evidence model');
  const [components, setComponents] = useState(DEFAULTS);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [applyToAll, setApplyToAll] = useState(true);
  const [activeSchemes, setActiveSchemes] = useState<ActiveScheme[]>([]);
  const [schemeLimit, setSchemeLimit] = useState(8);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const total = useMemo(() => Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0), [components]);
  const canPublish = profile?.role === 'admin';

  async function load() {
    const [schoolResponse, schemeResponse] = await Promise.all([fetch('/api/schools'), fetch('/api/academic-spine/schemes')]);
    const [schoolBody, schemeBody] = await Promise.all([
      schoolResponse.json() as Promise<{ data?: Array<{ id: string; name: string }> }>,
      schemeResponse.json() as Promise<{ data?: ActiveScheme[] }>,
    ]);
    if (schoolResponse.ok) setSchools((schoolBody.data ?? []).map((row) => ({ id: row.id, name: row.name })));
    if (schemeResponse.ok) {
      const schemes = schemeBody.data ?? [];
      setActiveSchemes(schemes);
      const central = schemes.find((scheme) =>
        !scheme.school_id && !scheme.course_id && !scheme.academic_term_id && !scheme.academic_offering_id);
      const activeComponents = publishedComponents(central?.components);
      if (central && activeComponents) {
        setName(central.name || 'Rillcod balanced evidence model');
        setComponents(activeComponents);
      }
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setError('The current weighting settings could not be loaded.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleSchool(id: string) {
    setSelectedSchools((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function copySchemeWeights(scheme: ActiveScheme) {
    const next = publishedComponents(scheme.components);
    if (!next) {
      setError('This rule is incomplete and cannot be used as a draft. Publish a valid replacement.');
      return;
    }
    setError('');
    setName(scheme.name || 'Academic result weighting');
    setComponents(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    setError(''); setMessage('');
    if (total !== 100) { setError(`The weights currently total ${total}%. They must total exactly 100%.`); return; }
    if (!applyToAll && selectedSchools.length === 0) { setError('Choose at least one school, or apply this scheme to all schools.'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/academic-spine/schemes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, components, school_ids: applyToAll ? [] : selectedSchools }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || 'The weighting scheme could not be saved.');
      setMessage(body.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The weighting scheme could not be saved.');
    } finally { setSaving(false); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 mobile-page-root">
      <header className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <Link href="/dashboard/academic" className="text-sm font-bold text-primary">Back to Academic Office</Link>
        <h1 className="mt-3 text-3xl font-black text-foreground">How results are weighted</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Set one clear academic rule for CBT, classwork, practical work, assignments, attendance and mid-term assessment. The total must be 100%. The same weights calculate manual evidence entry and automatic results; existing recorded component scores are never overwritten.</p>
      </header>

      {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{message}</div>}
      {profile && !canPublish && <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">You can review the active academic rule here. Only an administrator can publish a replacement, so one teacher cannot change result weights for everyone.</div>}

      <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <label className="text-sm font-bold text-foreground">Scheme name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} disabled={!canPublish} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground disabled:cursor-not-allowed disabled:opacity-60" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {COMPONENTS.map(([key, label]) => (
              <label key={key} className="rounded-2xl border border-border p-4">
                <span className="text-sm font-bold text-foreground">{label}</span>
                <div className="mt-3 flex items-center gap-2">
                  <input type="number" min="0" max="100" value={components[key]} onChange={(event) => setComponents((current) => ({ ...current, [key]: Number(event.target.value) }))} disabled={!canPublish} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60" />
                  <span className="font-bold text-muted-foreground">%</span>
                </div>
              </label>
            ))}
          </div>
          <div className={`mt-5 rounded-2xl p-4 text-sm font-black ${total === 100 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>Current total: {total}% {total === 100 ? '— ready' : '— adjust before saving'}</div>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-black text-foreground">Where should it apply?</h2>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
              <input type="radio" checked={applyToAll} onChange={() => setApplyToAll(true)} disabled={!canPublish} className="mt-1" />
              <span><strong className="block text-foreground">All schools</strong><small className="text-muted-foreground">One central default, including future schools.</small></span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
              <input type="radio" checked={!applyToAll} onChange={() => setApplyToAll(false)} disabled={!canPublish} className="mt-1" />
              <span><strong className="block text-foreground">Selected schools</strong><small className="text-muted-foreground">Publish the same rule to several schools in one action.</small></span>
            </label>
            {!applyToAll && <div className="mt-4 max-h-64 space-y-2 overflow-auto">{schools.map((school) => <label key={school.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm text-foreground"><input type="checkbox" checked={selectedSchools.includes(school.id)} onChange={() => toggleSchool(school.id)} disabled={!canPublish} />{school.name}</label>)}</div>}
            <button onClick={save} disabled={!canPublish || saving || total !== 100} className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-black text-primary-foreground disabled:opacity-50">{!canPublish ? 'Administrator approval required' : saving ? 'Publishing academic rule…' : 'Publish weighting scheme'}</button>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-black text-foreground">Active rules</h2>
            {/* This list was cut to 8 with nothing saying so, and rendered as an
                empty box when there were none at all. */}
            <div className="mt-4 space-y-3">{activeSchemes.slice(0, schemeLimit).map((scheme) => <div key={scheme.id} className="rounded-xl bg-muted/50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-foreground">{scheme.name}</p><p className="mt-1 text-xs text-muted-foreground">{relationLabel(scheme.schools, 'name') || 'All schools'} · {relationLabel(scheme.courses, 'title') || 'All courses'}</p></div>{canPublish && <button type="button" onClick={() => copySchemeWeights(scheme)} className="min-h-9 shrink-0 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/40">Copy weights</button>}</div></div>)}</div>
            {activeSchemes.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No weighting rule is active. Publish the reviewed default shown on the left before staff use automatic results; typed reports remain available and protected.</p>}
            {activeSchemes.length > schemeLimit && <button type="button" onClick={() => setSchemeLimit(activeSchemes.length)} className="mt-3 min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:border-primary/40">Show all {activeSchemes.length} rules</button>}
          </section>
        </div>
      </section>
    </main>
  );
}
