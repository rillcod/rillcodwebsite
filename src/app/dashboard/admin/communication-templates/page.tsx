'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Version = { id: string; version_number: number; subject: string | null; body: string; change_note: string | null; test_status: 'untested' | 'passed' | 'failed'; test_notes: string | null; created_at: string };
type Template = { id: string; template_key: string; name: string; description: string | null; category: string; channel: string; status: 'draft' | 'approved' | 'retired'; required_variables: string[]; current_version_id: string | null; currentVersion: Version | null; versions: Version[] };

const EMPTY = { templateId: '', templateKey: '', name: '', description: '', category: 'operations', channel: 'email', subject: '', body: '', changeNote: '' };

export default function CommunicationTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/communication-templates', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load templates.');
      setTemplates(json.templates ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load templates.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function request(payload: Record<string, unknown>, key: string) {
    setSaving(key); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/communication-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Template action failed.');
      setMessage(payload.action === 'test' ? 'Template test passed.' : 'Template saved successfully.');
      await load();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Template action failed.');
      return false;
    } finally { setSaving(''); }
  }

  async function saveVersion() {
    const action = form.templateId ? 'new_version' : 'create';
    const ok = await request({ action, ...form }, 'editor');
    if (ok) setForm(EMPTY);
  }

  function edit(template: Template) {
    const latest = template.versions[0] || template.currentVersion;
    setForm({
      templateId: template.id, templateKey: template.template_key, name: template.name,
      description: template.description || '', category: template.category, channel: template.channel,
      subject: latest?.subject || '', body: latest?.body || '', changeNote: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administration</p><h1 className="text-2xl font-black">Communication template registry</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">One controlled source for message identity, variables, versions, testing, approval, and retirement.</p></div>
      <div className="flex gap-2"><Link href="/dashboard/admin/automation-controls" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Automation controls</Link><button onClick={() => setForm(EMPTY)} className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white">New template</button></div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</p>}
    {message && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-500">{message}</p>}

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{form.templateId ? 'Create a new version' : 'Create a template'}</h2><p className="mt-1 text-xs text-muted-foreground">Use variables such as {'{{customer_name}}'}. Every variable must render before approval.</p></div>{form.templateId && <button onClick={() => setForm(EMPTY)} className="text-xs font-bold text-muted-foreground">Cancel editing</button>}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {!form.templateId && <><label className="space-y-1"><span className="text-xs font-bold">Template key</span><input value={form.templateKey} onChange={(e) => setForm({ ...form, templateKey: e.target.value })} placeholder="customer_case_receipt" className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label><label className="space-y-1"><span className="text-xs font-bold">Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label></>}
        <label className="space-y-1"><span className="text-xs font-bold">Category</span><input value={form.category} disabled={!!form.templateId} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm disabled:opacity-60" /></label>
        <label className="space-y-1"><span className="text-xs font-bold">Channel</span><select value={form.channel} disabled={!!form.templateId} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm disabled:opacity-60"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="in_app">In-app</option><option value="sms">SMS</option></select></label>
        {!form.templateId && <label className="space-y-1 md:col-span-2"><span className="text-xs font-bold">Description</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>}
        <label className="space-y-1 md:col-span-2"><span className="text-xs font-bold">Subject</span><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <label className="space-y-1 md:col-span-2"><span className="text-xs font-bold">Message body</span><textarea rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
        <label className="space-y-1 md:col-span-2"><span className="text-xs font-bold">Change note</span><input value={form.changeNote} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} placeholder="What changed and why" className="w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
      </div>
      <button disabled={saving === 'editor' || !form.body.trim() || (!form.templateId && !form.name.trim())} onClick={() => void saveVersion()} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving === 'editor' ? 'Saving...' : form.templateId ? 'Save new version' : 'Create draft'}</button>
    </section>

    <section className="space-y-3">
      <div><h2 className="font-black">Registered templates</h2><p className="text-xs text-muted-foreground">Only a tested version can become the approved current version.</p></div>
      {loading ? <p className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading templates...</p> : templates.map((template) => {
        const latest = template.versions[0];
        return <article key={template.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{template.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${template.status === 'approved' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : template.status === 'retired' ? 'border-border bg-muted text-muted-foreground' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'}`}>{template.status}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{template.channel}</span></div><p className="mt-1 font-mono text-[11px] text-muted-foreground">{template.template_key}</p><p className="mt-2 text-sm text-muted-foreground">{template.description || 'No description.'}</p><p className="mt-2 text-xs text-muted-foreground">Variables: {template.required_variables?.length ? template.required_variables.join(', ') : 'none'}</p></div>
            <div className="flex flex-wrap gap-2"><button onClick={() => edit(template)} className="rounded-lg border border-border px-3 py-2 text-xs font-black">New version</button>{latest && <button disabled={saving === latest.id} onClick={() => void request({ action: 'test', versionId: latest.id }, latest.id)} className="rounded-lg border border-primary px-3 py-2 text-xs font-black text-primary disabled:opacity-50">Test v{latest.version_number}</button>}{latest?.test_status === 'passed' && template.current_version_id !== latest.id && <button disabled={saving === latest.id} onClick={() => void request({ action: 'approve', versionId: latest.id }, latest.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve v{latest.version_number}</button>}{template.status !== 'retired' && <button disabled={saving === template.id} onClick={() => void request({ action: 'retire', templateId: template.id }, template.id)} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black text-rose-500 disabled:opacity-50">Retire</button>}</div>
          </div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-2">Version</th><th className="py-2">Test</th><th className="py-2">Change</th><th className="py-2">Created</th></tr></thead><tbody>{template.versions.map((version) => <tr key={version.id} className="border-t border-border"><td className="py-2 font-bold">v{version.version_number}{template.current_version_id === version.id ? ' (current)' : ''}</td><td className={`py-2 font-bold ${version.test_status === 'passed' ? 'text-emerald-500' : version.test_status === 'failed' ? 'text-rose-500' : 'text-amber-500'}`}>{version.test_status}</td><td className="py-2">{version.change_note || '-'}</td><td className="py-2">{new Date(version.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </article>;
      })}
    </section>
  </div>;
}
