'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Offering = {
  id: string; title: string; pathway: string; enrollment_type: string; academic_model: string;
  delivery_mode: string; awards_certificate: boolean; settings: Record<string, unknown>;
  schools?: { name: string } | { name: string }[] | null;
  academic_offering_periods?: { id: string; label: string; starts_on: string | null; ends_on: string | null; status: string }[];
  classes?: { id: string; name: string }[];
  academic_offering_curriculum_directions?: { id: string; course_id: string; release_id: string; status: string; courses?: { title: string } | null; academic_curriculum_releases?: { title: string; release_number: number } | null }[];
};
type Release = { id: string; title: string; release_number: number; course_id: string; courses?: { title: string } | null };
type Program = { id: string; name: string; program_scope?: string | null };

const label: Record<string, string> = { school: 'Regular School', online: 'Virtual School', special: 'Special Programme', in_person: 'Special Programme (in person)' };

export default function AcademicPathwaysPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [canCreatePathway, setCanCreatePathway] = useState(false);
  const [canCreateSpecialPathway, setCanCreateSpecialPathway] = useState(false);
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
    setPrograms(body.data.programs ?? []); setCanCreatePathway(body.data.can_create_pathway === true); setCanCreateSpecialPathway(body.data.can_create_special_pathway === true);
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

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 mobile-page-root">
    <section className="rounded-3xl border border-border bg-card p-6">
      <Link href="/dashboard/academic" className="text-sm font-bold text-primary">Back to Academic Office</Link>
      <h1 className="mt-3 text-3xl font-black text-foreground">Academic pathways</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Enrollment type chooses the learner's world automatically. Regular School, Online School and every Special Programme own separate curriculum directions, calendars, delivery and results while sharing the same academic engine.</p>
    </section>
    {canCreatePathway && <details className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <summary className="cursor-pointer font-black text-foreground">Create an Online or Special pathway</summary>
      <p className="mt-2 text-sm text-muted-foreground">Open a separate academic route with its own timing, delivery, curriculum direction, results and certificates.</p>
      <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post({ action: 'create_pathway', title: form.get('title'), pathway: form.get('pathway'), programme_id: form.get('programme_id'), starts_on: form.get('starts_on'), ends_on: form.get('ends_on') }); }} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-bold xl:col-span-2">Pathway name<input name="title" required placeholder="Online School Year 1 or Holiday Robotics" className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
        <label className="text-sm font-bold">Pathway type<select name="pathway" className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="online_school">Online School</option>{canCreateSpecialPathway && <><option value="bootcamp">Bootcamp</option><option value="holiday_programme">Holiday Programme</option><option value="short_course">Short Course</option></>}</select></label>
        <label className="text-sm font-bold">Programme<select name="programme_id" required className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="">Choose programme</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
        <button disabled={saving} className="self-end rounded-xl bg-primary p-3 font-black text-primary-foreground disabled:opacity-50">Create pathway</button>
        <label className="text-sm font-bold">Starts on<input name="starts_on" type="date" className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
        <label className="text-sm font-bold">Ends on<input name="ends_on" type="date" className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
      </form>
    </details>}
    {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{message}</div>}
    {issues.length > 0 && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5"><p className="font-black text-amber-800 dark:text-amber-200">{issues.length} learner placement{issues.length === 1 ? '' : 's'} need attention</p><p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Their enrollment type does not match their current class. No new results will cross that boundary.</p></section>}
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <section className="space-y-3">
        {/* With no offerings the left column was blank and the right pane never
            rendered, so the page read as broken rather than as empty. */}
        {offerings.length === 0 && !error && <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground"><p className="font-bold text-foreground">No pathway exists yet.</p><p className="mt-1">Regular School runs on the standard academic calendar without one. Create a pathway {canCreatePathway ? 'above' : '(Academic Office only)'} when Online School or a Special Programme needs its own curriculum direction, timing and results.</p></div>}
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
        <div><h3 className="font-black text-foreground">This pathway's curriculum direction</h3><p className="mt-1 text-sm text-muted-foreground">This choice belongs only to {active.title}. Future teaching plans in this pathway inherit it automatically; other pathways are not changed.</p>{active.academic_offering_curriculum_directions?.length ? <div className="mt-3 grid gap-2">{active.academic_offering_curriculum_directions.filter((direction) => direction.status === 'active').map((direction) => <div key={direction.id} className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm"><span className="font-black text-foreground">{direction.courses?.title || 'Course'}</span><span className="text-muted-foreground"> · {direction.academic_curriculum_releases?.title || 'Official edition'} · Edition {direction.academic_curriculum_releases?.release_number ?? '—'}</span></div>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">No pathway edition yet. The next central publication can provide a starting edition, or the Academic Office can choose one now.</p>}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row"><select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-background p-3"><option value="">Choose a published curriculum edition</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.courses?.title || 'Course'} · {release.title} · Edition {release.release_number}</option>)}</select><button disabled={saving || !chosenRelease} onClick={() => chosenRelease && void post({ action: 'set_direction', academic_offering_id: active.id, course_id: chosenRelease.course_id, release_id: chosenRelease.id })} className="rounded-xl bg-foreground px-5 py-3 font-bold text-background disabled:opacity-50">Assign direction</button></div>
        </div>
      </section>}
    </div>
  </div>;
}
