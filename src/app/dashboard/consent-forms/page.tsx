'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ClipboardDocumentCheckIcon, PlusIcon, XMarkIcon, CheckCircleIcon, ArrowDownTrayIcon, CalendarIcon } from '@/lib/icons';

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  due_date: string | null;
  created_at: string;
  consent_responses: { count: number }[];
}

export default function ConsentFormsPage() {
  const { profile } = useAuth();
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', due_date: '' });
  const [signingId, setSigningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isStaff = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');
  const isParent = profile?.role === 'parent';

  useEffect(() => { loadForms(); }, []);

  async function loadForms() {
    setLoading(true);
    const res = await fetch('/api/consent-forms');
    const json = await res.json();
    setForms(json.data ?? []);
    setLoading(false);
  }

  async function createForm() {
    if (!form.title.trim() || !form.body.trim()) return;
    setCreating(true);
    setError('');
    const res = await fetch('/api/consent-forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Failed to create'); setCreating(false); return; }
    setForms(prev => [json.data, ...prev]);
    setForm({ title: '', body: '', due_date: '' });
    setShowCreate(false);
    setCreating(false);
  }

  async function signForm(id: string) {
    setSigningId(id);
    const res = await fetch(`/api/consent-forms/${id}/sign`, { method: 'POST' });
    const json = await res.json();
    if (res.status === 409) { setSignedIds(prev => new Set([...prev, id])); setSigningId(null); return; }
    if (res.ok) setSignedIds(prev => new Set([...prev, id]));
    setSigningId(null);
  }

  async function exportCSV(id: string) {
    const res = await fetch(`/api/consent-forms/${id}/sign`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `consent-form-${id}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Digital Consent</span>
            </div>
            <h1 className="text-3xl font-black">Consent Forms</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Create and manage consent forms for parents' : 'Sign consent forms from your school'}
            </p>
          </div>
          {isStaff && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors">
              <PlusIcon className="w-4 h-4" /> New Form
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between">
                <h2 className="font-black">New Consent Form</h2>
                <button onClick={() => setShowCreate(false)}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Title *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Field Trip Permission" className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Body / Message *</label>
                  <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Describe the activity and what parents are consenting to…" rows={5} className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              {error && <p className="text-rose-400 text-xs">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-card text-muted-foreground font-bold rounded-none hover:bg-muted text-sm transition-colors">Cancel</button>
                <button onClick={createForm} disabled={!form.title.trim() || !form.body.trim() || creating} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold rounded-none text-sm transition-colors">
                  {creating ? 'Creating…' : 'Publish Form'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forms list */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : forms.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-none">
            <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No consent forms yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map(cf => {
              const signed = signedIds.has(cf.id);
              const responseCount = cf.consent_responses?.[0]?.count ?? 0;
              return (
                <div key={cf.id} className="bg-card border border-border rounded-none p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-foreground">{cf.title}</h3>
                    {signed && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <CheckCircleIcon className="w-3 h-3" /> Signed
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{cf.body}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {cf.due_date && (
                      <span className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Due {new Date(cf.due_date).toLocaleDateString()}</span>
                    )}
                    {isStaff && <span>{responseCount} response{responseCount !== 1 ? 's' : ''}</span>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {isParent && !signed && (
                      <button
                        onClick={() => signForm(cf.id)}
                        disabled={signingId === cf.id}
                        className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-bold rounded-none transition-colors"
                      >
                        {signingId === cf.id ? 'Signing…' : '✅ I Agree & Sign'}
                      </button>
                    )}
                    {isParent && signed && (
                      <div className="flex-1 py-2 bg-emerald-600/20 border border-emerald-600/20 text-emerald-400 text-sm font-bold rounded-none text-center">
                        You have already signed this form
                      </div>
                    )}
                    {isStaff && (
                      <button
                        onClick={() => exportCSV(cf.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-none transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
