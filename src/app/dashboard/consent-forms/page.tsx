'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardDocumentCheckIcon, PlusIcon, XMarkIcon, CheckCircleIcon,
  ArrowDownTrayIcon, CalendarIcon, TrashIcon, UserGroupIcon,
  ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon,
  ArrowPathIcon,
} from '@/lib/icons';

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  due_date: string | null;
  created_at: string;
  has_signed: boolean;
  consent_responses: { count: number }[];
}

interface Signatory {
  id: string;
  signed_at: string;
  portal_users: { full_name: string | null; email: string | null; phone: string | null } | null;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dueBadge(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (daysLeft < 0) return { label: 'Overdue', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' };
  if (daysLeft === 0) return { label: 'Due today', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
  if (daysLeft <= 3) return { label: `${daysLeft}d left`, cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
  return { label: `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, cls: 'bg-muted text-muted-foreground border-border/40' };
}

export default function ConsentFormsPage() {
  const { profile } = useAuth();
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', body: '', due_date: '' });
  const [createError, setCreateError] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signatories, setSignatories] = useState<Record<string, Signatory[]>>({});
  const [loadingSigs, setLoadingSigs] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [readModalId, setReadModalId] = useState<string | null>(null);

  const isStaff = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');
  const isParent = profile?.role === 'parent';

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/consent-forms');
      const json = await res.json();
      setForms(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadForms(); }, [loadForms]);

  async function createForm() {
    if (!newForm.title.trim() || !newForm.body.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/consent-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error || 'Failed to create'); return; }
      setForms(prev => [{ ...json.data, has_signed: false }, ...prev]);
      setNewForm({ title: '', body: '', due_date: '' });
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function signForm(id: string) {
    setSigningId(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}/sign`, { method: 'POST' });
      if (res.ok || res.status === 409) {
        setForms(prev => prev.map(f => f.id === id ? { ...f, has_signed: true } : f));
      }
    } finally {
      setSigningId(null);
      setReadModalId(null);
    }
  }

  async function loadSignatories(id: string) {
    if (signatories[id]) { setExpandedId(id); return; }
    setLoadingSigs(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}`);
      const json = await res.json();
      setSignatories(prev => ({ ...prev, [id]: json.data ?? [] }));
      setExpandedId(id);
    } finally {
      setLoadingSigs(null);
    }
  }

  function toggleSignatories(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    loadSignatories(id);
  }

  async function deleteForm(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}`, { method: 'DELETE' });
      if (res.ok) setForms(prev => prev.filter(f => f.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function exportCSV(id: string, title: string) {
    const res = await fetch(`/api/consent-forms/${id}/sign`);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}-responses.csv`;
    a.click();
  }

  const readModal = forms.find(f => f.id === readModalId);

  const totalResponses = forms.reduce((s, f) => s + (f.consent_responses?.[0]?.count ?? 0), 0);
  const signedCount = forms.filter(f => f.has_signed).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-black text-primary uppercase tracking-widest">Digital Consent</span>
            </div>
            <h1 className="text-3xl font-black">Consent Forms</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Create and manage consent forms for parents' : 'Sign consent forms from your school'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadForms} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Refresh">
              <ArrowPathIcon className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isStaff && (
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl transition-colors hover:opacity-90">
                <PlusIcon className="w-4 h-4" /> New Form
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {!loading && forms.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {(isStaff ? [
              { label: 'Forms', value: forms.length },
              { label: 'Total Responses', value: totalResponses },
              { label: 'Overdue', value: forms.filter(f => f.due_date && new Date(f.due_date) < new Date()).length },
            ] : [
              { label: 'Forms', value: forms.length },
              { label: 'Signed', value: signedCount },
              { label: 'Pending', value: forms.length - signedCount },
            ]).map(s => (
              <div key={s.label} className="bg-card border border-border/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-foreground">{s.value}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Create modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">New Consent Form</h2>
                  <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Title *</label>
                    <input
                      value={newForm.title}
                      onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Field Trip Permission — Science Museum"
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Body / Message *</label>
                    <textarea
                      value={newForm.body}
                      onChange={e => setNewForm(f => ({ ...f, body: e.target.value }))}
                      placeholder="Describe the activity, dates, any risks, and what parents are consenting to…"
                      rows={6}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary resize-none transition-colors"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{newForm.body.length} characters</p>
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Response Deadline</label>
                    <input
                      type="date"
                      value={newForm.due_date}
                      onChange={e => setNewForm(f => ({ ...f, due_date: e.target.value }))}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                {createError && (
                  <p className="text-rose-400 text-xs flex items-center gap-1.5">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {createError}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl hover:bg-muted text-sm transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={createForm}
                    disabled={!newForm.title.trim() || !newForm.body.trim() || creating}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground disabled:opacity-40 font-bold rounded-xl text-sm transition-all hover:opacity-90"
                  >
                    {creating ? 'Publishing…' : 'Publish Form'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full-read modal before signing */}
        <AnimatePresence>
          {readModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={e => { if (e.target === e.currentTarget) setReadModalId(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Consent Form</p>
                    <h2 className="font-black text-base">{readModal.title}</h2>
                  </div>
                  <button onClick={() => setReadModalId(null)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{readModal.body}</p>
                </div>
                <div className="px-6 py-4 border-t border-border/50 space-y-3">
                  {readModal.due_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      Response deadline: <strong>{new Date(readModal.due_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                    </p>
                  )}
                  {isParent && !readModal.has_signed && (
                    <button
                      onClick={() => signForm(readModal.id)}
                      disabled={signingId === readModal.id}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-colors"
                    >
                      {signingId === readModal.id ? 'Signing…' : '✅ I have read and I agree — Sign Now'}
                    </button>
                  )}
                  {isParent && readModal.has_signed && (
                    <div className="w-full py-3 bg-emerald-600/15 border border-emerald-500/20 text-emerald-400 font-black rounded-xl text-center text-sm">
                      ✓ You have signed this form
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirmation */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-rose-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                    <TrashIcon className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h3 className="font-black">Delete Form?</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">This will also delete all parent responses. This cannot be undone.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl text-sm hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteForm(confirmDeleteId)}
                    disabled={deletingId === confirmDeleteId}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black rounded-xl text-sm transition-colors"
                  >
                    {deletingId === confirmDeleteId ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forms list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl">
            <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-bold text-foreground">No consent forms yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Create your first consent form to get started.' : 'No forms have been sent from your school yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map(cf => {
              const responseCount = cf.consent_responses?.[0]?.count ?? 0;
              const badge = dueBadge(cf.due_date);
              const isExpanded = expandedId === cf.id;
              const sigs = signatories[cf.id] ?? [];

              return (
                <motion.div
                  key={cf.id}
                  layout
                  className={`bg-card border rounded-2xl overflow-hidden transition-colors ${
                    cf.has_signed ? 'border-emerald-500/20' : 'border-border/60'
                  }`}
                >
                  <div className="p-5 space-y-3">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        {cf.has_signed && (
                          <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <h3 className="font-bold text-foreground leading-snug">{cf.title}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {badge && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        {cf.has_signed && (
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Signed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body preview */}
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">{cf.body}</p>

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{relativeDate(cf.created_at)}</span>
                      {isStaff && (
                        <span className="flex items-center gap-1">
                          <UserGroupIcon className="w-3.5 h-3.5" />
                          {responseCount} response{responseCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Read full form */}
                      <button
                        onClick={() => setReadModalId(cf.id)}
                        className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                      >
                        Read Full Form
                      </button>

                      {/* Parent sign */}
                      {isParent && !cf.has_signed && (
                        <button
                          onClick={() => setReadModalId(cf.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-colors"
                        >
                          ✅ Read & Sign
                        </button>
                      )}

                      {/* Staff: toggle signatories */}
                      {isStaff && responseCount > 0 && (
                        <button
                          onClick={() => toggleSignatories(cf.id)}
                          disabled={loadingSigs === cf.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                        >
                          {loadingSigs === cf.id
                            ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            : isExpanded
                            ? <ChevronUpIcon className="w-3.5 h-3.5" />
                            : <ChevronDownIcon className="w-3.5 h-3.5" />
                          }
                          {isExpanded ? 'Hide' : 'View'} Signatories
                        </button>
                      )}

                      {/* Staff: export */}
                      {isStaff && (
                        <button
                          onClick={() => exportCSV(cf.id, cf.title)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> CSV
                        </button>
                      )}

                      {/* Staff: delete */}
                      {isStaff && (
                        <button
                          onClick={() => setConfirmDeleteId(cf.id)}
                          className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-xl transition-colors"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Signatories panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                            Signed by {sigs.length} parent{sigs.length !== 1 ? 's' : ''}
                          </p>
                          {sigs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No signatures yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {sigs.map(s => (
                                <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate">{s.portal_users?.full_name ?? 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{s.portal_users?.email ?? ''}</p>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {new Date(s.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
