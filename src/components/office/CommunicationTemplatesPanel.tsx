'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useOfficeOptional } from './OfficeContext';

type Version = {
  id: string;
  version_number: number;
  subject: string | null;
  body: string;
  change_note: string | null;
  test_status: 'untested' | 'passed' | 'failed';
  test_notes: string | null;
  created_at: string;
  createdByName?: string | null;
};
type DeliverySummary = {
  sent: number;
  failed: number;
  suppressed: number;
  lastStatus: string | null;
  lastAt: string | null;
  lastError: string | null;
};
type Template = {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  category: string;
  channel: string;
  status: 'draft' | 'approved' | 'retired';
  required_variables: string[];
  current_version_id: string | null;
  createdByName?: string | null;
  approvedByName?: string | null;
  delivery?: DeliverySummary;
  currentVersion: Version | null;
  versions: Version[];
};

const EMPTY = {
  templateId: '',
  templateKey: '',
  name: '',
  description: '',
  category: 'operations',
  channel: 'email',
  subject: '',
  body: '',
  changeNote: '',
};

type Props = { embedded?: boolean };

export function CommunicationTemplatesPanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const notify = office?.notifyOfficeChange;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pendingRecovery, setPendingRecovery] = useState(0);
  const [recoveryHref, setRecoveryHref] = useState('/dashboard/office?workspace=settings&section=health');
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Template['status']>('all');
  const [preview, setPreview] = useState<{ subject?: string | null; body?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/communication-templates', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load templates.');
      setTemplates(json.templates ?? []);
      setPendingRecovery(Number(json.pendingRecovery || 0));
      setRecoveryHref(json.recoveryHref || '/dashboard/office?workspace=settings&section=health');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(payload: Record<string, unknown>, key: string) {
    setSaving(key);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/communication-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Template action failed.');
      setMessage(payload.action === 'test' ? 'Template test passed.' : 'Template saved successfully.');
      if (payload.action === 'test') setPreview(json.rendered ?? null);
      await load();
      notify?.('settings');
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Template action failed.');
      return false;
    } finally {
      setSaving('');
    }
  }

  async function saveVersion() {
    const action = form.templateId ? 'new_version' : 'create';
    const ok = await request({ action, ...form }, 'editor');
    if (ok) setForm(EMPTY);
  }

  function edit(template: Template) {
    const latest = template.versions[0] || template.currentVersion;
    setForm({
      templateId: template.id,
      templateKey: template.template_key,
      name: template.name,
      description: template.description || '',
      category: template.category,
      channel: template.channel,
      subject: latest?.subject || '',
      body: latest?.body || '',
      changeNote: '',
    });
    setPreview(null);
  }

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (statusFilter !== 'all' && template.status !== statusFilter) return false;
      if (!query) return true;
      return `${template.name} ${template.template_key} ${template.description ?? ''} ${template.category} ${template.channel}`
        .toLowerCase().includes(query);
    });
  }, [templates, search, statusFilter]);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administration</p>
            <h1 className="text-2xl font-black">Communication template registry</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              One controlled source for message identity, who changed it, versions, testing, approval, delivery outcomes, and failed-message recovery.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
            className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
          >
            New template
          </button>
        </header>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Review wording, who changed it, delivery results, and recover failed sends from one place.</p>
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
            className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
          >
            New template
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
      ) : null}
      {preview ? (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black">Rendered test preview</h2>
              <p className="mt-1 text-xs text-muted-foreground">Sample values replaced every declared variable. Review the human-facing wording before approval.</p>
            </div>
            <button type="button" onClick={() => setPreview(null)} className="min-h-10 text-xs font-black text-muted-foreground">Close</button>
          </div>
          {preview.subject ? <p className="mt-4 rounded-xl bg-background p-3 text-sm font-black">{preview.subject}</p> : null}
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-4 font-sans text-sm leading-relaxed text-foreground">{preview.body}</pre>
        </section>
      ) : null}

      <section className={`rounded-2xl border p-5 ${pendingRecovery ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-card'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black">Failed-message recovery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingRecovery
                ? `${pendingRecovery} message${pendingRecovery === 1 ? '' : 's'} still need a person to retry or close them.`
                : 'No failed messages are waiting. Delivery evidence for each template appears below.'}
            </p>
          </div>
          <Link
            href={recoveryHref}
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
          >
            Open recovery
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black">{form.templateId ? 'Create a new version' : 'Create a template'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use variables such as {'{{customer_name}}'}. Every variable must render before approval.
            </p>
          </div>
          {form.templateId ? (
            <button type="button" onClick={() => setForm(EMPTY)} className="min-h-11 touch-manipulation text-xs font-bold text-muted-foreground">
              Cancel editing
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {!form.templateId ? (
              <label className="space-y-1">
                <span className="text-xs font-bold">Template key</span>
                <input
                  value={form.templateKey}
                  onChange={(e) => setForm({ ...form, templateKey: e.target.value })}
                  placeholder="customer_case_receipt"
                  className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
              </label>
          ) : null}
          <label className="space-y-1">
            <span className="text-xs font-bold">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold">Category</span>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold">Channel</span>
            <select
              value={form.channel}
              disabled={!!form.templateId}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm disabled:opacity-60"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in_app">In-app</option>
              <option value="sms">SMS</option>
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold">Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
              />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold">Subject</span>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold">Message body</span>
            <textarea
              rows={7}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold">Change note</span>
            <input
              value={form.changeNote}
              onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
              placeholder="What changed and why"
              className="min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={saving === 'editor' || !form.body.trim() || (!form.templateId && !form.name.trim())}
          onClick={() => void saveVersion()}
          className="mt-4 min-h-11 touch-manipulation rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
        >
          {saving === 'editor' ? 'Saving...' : form.templateId ? 'Save new version' : 'Create draft'}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-black">Registered templates</h2>
            <p className="text-xs text-muted-foreground">Only a tested version can become the approved current version.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search message templates"
              placeholder="Search name, key or channel"
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="all">All states</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        {loading ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading templates...</p>
        ) : (
          visibleTemplates.map((template) => {
            const latest = template.versions[0];
            return (
              <article key={template.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black">{template.name}</h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                          template.status === 'approved'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : template.status === 'retired'
                              ? 'border-border bg-muted text-muted-foreground'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {template.status}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{template.channel}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{template.template_key}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{template.description || 'No description.'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Variables: {template.required_variables?.length ? template.required_variables.join(', ') : 'none'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {template.createdByName ? `Created by ${template.createdByName}` : 'Creator not recorded'}
                      {template.approvedByName ? ` · Approved by ${template.approvedByName}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last 30 days: {template.delivery?.sent ?? 0} delivered
                      {(template.delivery?.failed ?? 0) > 0 ? ` · ${template.delivery?.failed} failed` : ''}
                      {(template.delivery?.suppressed ?? 0) > 0 ? ` · ${template.delivery?.suppressed} stopped by preference` : ''}
                      {template.delivery?.lastAt
                        ? ` · latest ${template.delivery.lastStatus} ${new Date(template.delivery.lastAt).toLocaleString()}`
                        : ' · no delivery yet'}
                    </p>
                    {template.delivery?.lastError ? (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{template.delivery.lastError}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => edit(template)}
                      className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black"
                    >
                      New version
                    </button>
                    {latest ? (
                      <button
                        type="button"
                        disabled={saving === latest.id}
                        onClick={() => void request({ action: 'test', versionId: latest.id }, latest.id)}
                        className="min-h-11 touch-manipulation rounded-lg border border-primary px-3 py-2 text-xs font-black text-primary disabled:opacity-50"
                      >
                        Test v{latest.version_number}
                      </button>
                    ) : null}
                    {latest?.test_status === 'passed' && template.current_version_id !== latest.id ? (
                      <button
                        type="button"
                        disabled={saving === latest.id}
                        onClick={() => void request({ action: 'approve', versionId: latest.id }, latest.id)}
                        className="min-h-11 touch-manipulation rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        Approve v{latest.version_number}
                      </button>
                    ) : null}
                    {(template.delivery?.failed ?? 0) > 0 ? (
                      <Link
                        href={recoveryHref}
                        className="inline-flex min-h-11 touch-manipulation items-center rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black text-rose-600 dark:text-rose-400"
                      >
                        Recover failed sends
                      </Link>
                    ) : null}
                    {template.status !== 'retired' ? (
                      <button
                        type="button"
                        disabled={saving === template.id}
                        onClick={() => void request({ action: 'retire', templateId: template.id }, template.id)}
                        className="min-h-11 touch-manipulation rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black text-rose-600 dark:text-rose-400 disabled:opacity-50"
                      >
                        Retire
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving === template.id}
                        onClick={() => void request({ action: 'restore', templateId: template.id }, template.id)}
                        className="min-h-11 touch-manipulation rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-400 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-2">Version</th>
                        <th className="py-2">Test</th>
                        <th className="py-2">Change</th>
                        <th className="py-2">Changed by</th>
                        <th className="py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {template.versions.map((version) => (
                        <tr key={version.id} className="border-t border-border">
                          <td className="py-2 font-bold">
                            v{version.version_number}
                            {template.current_version_id === version.id ? ' (current)' : ''}
                          </td>
                          <td
                            className={`py-2 font-bold ${
                              version.test_status === 'passed'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : version.test_status === 'failed'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {version.test_status}
                          </td>
                          <td className="py-2">{version.change_note || '-'}</td>
                          <td className="py-2">{version.createdByName || 'Not recorded'}</td>
                          <td className="py-2">{new Date(version.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        )}
        {!loading && visibleTemplates.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No templates match these filters.</p>
        ) : null}
      </section>
    </div>
  );
}
