'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Offering = {
  id: string; title: string; pathway: string; enrollment_type: string; academic_model: string;
  delivery_mode: string; awards_certificate: boolean; settings: Record<string, unknown>;
  schools?: { name: string } | { name: string }[] | null;
  academic_offering_periods?: { id: string; label: string; starts_on: string | null; ends_on: string | null; status: string }[];
  classes?: { id: string; name: string }[];
  academic_offering_curriculum_directions?: { id: string; course_id: string; release_id: string; courses?: { title: string } | null }[];
};
type Release = { id: string; title: string; release_number: number; course_id: string; courses?: { title: string } | null };

const label: Record<string, string> = { school: 'Regular School', online: 'Virtual School', special: 'Special Programme', in_person: 'Special Programme (in person)' };

export default function AcademicPathwaysPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/academic-spine/pathways', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return setError(body.error || 'Unable to open academic pathways.');
    setOfferings(body.data.offerings); setReleases(body.data.releases); setIssues(body.data.pathway_issues);
    setSelected((value) => value || body.data.offerings[0]?.id || '');
  }, []);
  useEffect(() => { void load(); }, [load]);
  const active = useMemo(() => offerings.find((item) => item.id === selected), [offerings, selected]);
  const chosenRelease = releases.find((item) => item.id === releaseId);

  async function post(payload: Record<string, unknown>) {
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/academic-spine/pathways', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The setting could not be saved.');
      setMessage(body.message); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The setting could not be saved.'); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="rounded-3xl border border-border bg-card p-6">
      <Link href="/dashboard/academic-spine" className="text-sm font-bold text-primary">Back to Academic Spine</Link>
      <h1 className="mt-3 text-3xl font-black text-foreground">Academic pathways</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Enrollment type chooses the learner's world automatically. Here the Academic Office only confirms dates, delivery and the official curriculum edition.</p>
    </section>
    {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700">{message}</div>}
    {issues.length > 0 && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"><p className="font-black text-amber-800">{issues.length} learner placement{issues.length === 1 ? '' : 's'} need attention</p><p className="mt-1 text-sm text-amber-800">Their enrollment type does not match their current class. No new results will cross that boundary.</p></section>}
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <section className="space-y-3">
        {offerings.map((item) => <button key={item.id} onClick={() => { setSelected(item.id); setReleaseId(''); }} className={`w-full rounded-2xl border p-4 text-left ${selected === item.id ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
          <p className="text-xs font-black uppercase tracking-wide text-primary">{label[item.enrollment_type] || item.enrollment_type}</p>
          <p className="mt-1 font-black text-foreground">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.classes?.length ?? 0} class/cohort · {item.delivery_mode.replace('_', ' ')}</p>
        </button>)}
      </section>
      {active && <section className="space-y-6 rounded-3xl border border-border bg-card p-6">
        <div><p className="text-sm font-bold text-primary">{label[active.enrollment_type]}</p><h2 className="mt-1 text-2xl font-black text-foreground">{active.title}</h2><p className="mt-2 text-sm text-muted-foreground">{active.academic_model === 'termly_school' ? 'Uses academic sessions and terms.' : 'Uses its own start and end dates.'}</p></div>
        <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-muted p-4"><p className="text-xs font-bold text-muted-foreground">Delivery</p><p className="mt-1 font-black capitalize">{active.delivery_mode.replace('_', ' ')}</p></div><div className="rounded-2xl bg-muted p-4"><p className="text-xs font-bold text-muted-foreground">Certificate</p><p className="mt-1 font-black">Verified result required</p></div><div className="rounded-2xl bg-muted p-4"><p className="text-xs font-bold text-muted-foreground">Pass mark</p><p className="mt-1 font-black">{String(active.settings?.certificate_pass_score ?? 50)}%</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post({ action: 'update_offering', academic_offering_id: active.id, delivery_mode: form.get('delivery_mode'), certificate_pass_score: form.get('pass_score'), awards_certificate: true }); }} className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-3">
          <label className="text-sm font-bold">Delivery<select name="delivery_mode" defaultValue={active.delivery_mode} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="in_school">In school</option><option value="virtual">Virtual</option><option value="onsite">In person / onsite</option><option value="hybrid">Hybrid</option></select></label>
          <label className="text-sm font-bold">Certificate pass mark<input name="pass_score" type="number" min="0" max="100" defaultValue={Number(active.settings?.certificate_pass_score ?? 50)} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
          <button disabled={saving} className="self-end rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50">Save pathway</button>
        </form>
        <div><h3 className="font-black text-foreground">Official curriculum direction</h3><p className="mt-1 text-sm text-muted-foreground">Choose once. Future lesson plans inherit it automatically.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row"><select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-background p-3"><option value="">Choose a published curriculum edition</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.courses?.title || 'Course'} · {release.title} · Edition {release.release_number}</option>)}</select><button disabled={saving || !chosenRelease} onClick={() => chosenRelease && void post({ action: 'set_direction', academic_offering_id: active.id, course_id: chosenRelease.course_id, release_id: chosenRelease.id })} className="rounded-xl bg-foreground px-5 py-3 font-bold text-background disabled:opacity-50">Assign direction</button></div>
        </div>
      </section>}
    </div>
  </div>;
}
