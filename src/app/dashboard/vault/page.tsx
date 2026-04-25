// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArchiveBoxIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CodeBracketIcon,
  ClockIcon,
  ChevronRightIcon,
  CheckCircleIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[200px] bg-black/20 animate-pulse rounded-none" />,
});

interface VaultItem {
  id: string;
  user_id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  tags: string[] | null;
  created_at: string | null;
}

type VaultLanguage =
  | 'javascript'
  | 'python'
  | 'html'
  | 'css'
  | 'typescript'
  | 'sql'
  | 'bash';

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: 'bg-yellow-500/15 text-yellow-400',
  python: 'bg-blue-500/15 text-blue-400',
  html: 'bg-orange-500/15 text-orange-400',
  css: 'bg-pink-500/15 text-pink-400',
  typescript: 'bg-cyan-500/15 text-cyan-400',
  sql: 'bg-emerald-500/15 text-emerald-400',
  bash: 'bg-slate-500/15 text-muted-foreground/70',
};

const RUNNER_LANGUAGES: Record<string, 'javascript' | 'python' | 'html' | 'robotics'> = {
  javascript: 'javascript',
  typescript: 'javascript',
  python: 'python',
  html: 'html',
  css: 'html',
  sql: 'javascript',
  bash: 'javascript',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface SnippetFormState {
  title: string;
  language: VaultLanguage;
  tags: string;
  description: string;
  code: string;
}

const BLANK_FORM: SnippetFormState = {
  title: '',
  language: 'javascript',
  tags: '',
  description: '',
  code: '',
};

export default function VaultPage() {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SnippetFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // Expanded snippets
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // AI explain per item
  const [aiExplaining, setAiExplaining] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && profile) fetchItems();
  }, [authLoading, profile]);

  async function fetchItems() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error: fetchErr } = await db
        .from('vault_items')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setForm(BLANK_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(item: VaultItem) {
    setForm({
      title: item.title,
      language: item.language as VaultLanguage,
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      description: item.description || '',
      code: item.code,
    });
    setEditId(item.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!profile || !form.title.trim() || !form.code.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        user_id: profile.id,
        title: form.title.trim(),
        language: form.language,
        code: form.code,
        description: form.description.trim() || null,
        tags: form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : null,
      };
      if (editId) {
        const { error: updateErr } = await db
          .from('vault_items')
          .update(payload)
          .eq('id', editId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await db.from('vault_items').insert(payload);
        if (insertErr) throw insertErr;
      }
      setShowForm(false);
      await fetchItems();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save snippet.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this snippet? This cannot be undone.')) return;
    try {
      await db.from('vault_items').delete().eq('id', id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError('Failed to delete snippet.');
    }
  }

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAIExplain(item: VaultItem) {
    setAiExplaining(item.id);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt: `Explain this ${item.language} code in simple terms for a student:\n\n${item.code}\n\nKeep it concise — 3-5 sentences max.`,
        }),
      });
      const data = await res.json();
      if (data?.content) {
        setAiExplanations((prev) => ({ ...prev, [item.id]: data.content }));
        setExpandedExplanations((prev) => new Set([...prev, item.id]));
      }
    } catch {
      setError('AI explain failed.');
    } finally {
      setAiExplaining(null);
    }
  }

  function toggleExplanation(id: string) {
    setExpandedExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.language.toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      (item.description || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: items.length,
    languages: [...new Set(items.map((i) => i.language))].length,
    lastSaved: items[0]?.created_at ? formatDate(items[0].created_at) : '—',
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-violet-500/15 flex items-center justify-center rounded-none">
            <ArchiveBoxIcon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Vault</h1>
            <p className="text-sm text-muted-foreground">Your personal code library</p>
          </div>
          <button
            onClick={openNew}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-none transition-all"
          >
            <PlusIcon className="w-4 h-4" />
            New Snippet
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Snippets', value: stats.total, icon: <CodeBracketIcon className="w-4 h-4 text-violet-400" /> },
            { label: 'Languages', value: stats.languages, icon: <ArchiveBoxIcon className="w-4 h-4 text-emerald-400" /> },
            { label: 'Last Saved', value: stats.lastSaved, icon: <ClockIcon className="w-4 h-4 text-amber-400" /> },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                {stat.icon}
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{stat.label}</span>
              </div>
              <p className="text-xl font-black text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, language, or tag..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Modal / Inline form */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-card border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-base font-black text-foreground">
                  {editId ? 'Edit Snippet' : 'New Snippet'}
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Debounce function"
                    className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Language
                    </label>
                    <select
                      className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground"
                      value={form.language}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, language: e.target.value as VaultLanguage }))
                      }
                    >
                      {(['javascript', 'python', 'html', 'css', 'typescript', 'sql', 'bash'] as VaultLanguage[]).map(
                        (l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. utility, async, DOM"
                      className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground"
                      value={form.tags}
                      onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of what this snippet does..."
                    className="w-full px-3 py-2.5 bg-white/5 border border-border rounded-none text-sm focus:outline-none focus:border-violet-500 text-foreground resize-none"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Code *
                  </label>
                  <CodeEditor
                    value={form.code}
                    onChange={(v) => setForm((f) => ({ ...f, code: v || '' }))}
                    language={RUNNER_LANGUAGES[form.language] || 'javascript'}
                    height={300}
                    title="Code"
                    showHeader={false}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-4 border-t border-border">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-sm font-bold rounded-none transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.code.trim()}
                  className="ml-auto px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-none transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Save Snippet'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Snippet list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <ArchiveBoxIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-bold text-lg mb-1">
              {search ? 'No matching snippets' : 'No snippets yet'}
            </p>
            <p className="text-muted-foreground text-sm">
              {search ? 'Try a different search term.' : 'Click "New Snippet" to add your first one!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-card border border-border border-l-2 border-l-brand-red-600">
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-foreground text-sm">{item.title}</h3>
                        <span
                          className={`px-2 py-0.5 text-xs font-bold ${
                            LANGUAGE_COLORS[item.language] || 'bg-slate-500/15 text-muted-foreground/70'
                          }`}
                        >
                          {item.language}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-white/5 border border-border text-xs text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ClockIcon className="w-3 h-3" />
                        <span>{formatDate(item.created_at || '')}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="p-1.5 text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/50 transition-all"
                        title={expandedItems.has(item.id) ? 'Hide code' : 'Show code'}
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAIExplain(item)}
                        disabled={aiExplaining === item.id}
                        className="p-1.5 text-muted-foreground hover:text-amber-400 border border-border hover:border-amber-500/50 transition-all disabled:opacity-50"
                        title="AI Explain"
                      >
                        <SparklesIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-muted-foreground hover:text-emerald-400 border border-border hover:border-emerald-500/50 transition-all"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 border border-border hover:border-red-500/50 transition-all"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded code */}
                {expandedItems.has(item.id) && (
                  <div className="border-t border-border">
                    <CodeEditor
                      value={item.code}
                      language={RUNNER_LANGUAGES[item.language] || 'javascript'}
                      height={200}
                      readOnly
                      showHeader={false}
                    />
                  </div>
                )}

                {/* AI Explanation */}
                {aiExplanations[item.id] && (
                  <div className="border-t border-border">
                    <button
                      onClick={() => toggleExplanation(item.id)}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-amber-500/5 transition-colors"
                    >
                      <SparklesIcon className="w-3.5 h-3.5" />
                      AI Explanation
                      <ChevronRightIcon
                        className={`w-3.5 h-3.5 ml-auto transition-transform ${
                          expandedExplanations.has(item.id) ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {expandedExplanations.has(item.id) && (
                      <div className="px-4 pb-4">
                        <div className="bg-amber-500/5 border border-amber-500/20 px-4 py-3 text-sm text-amber-200 leading-relaxed">
                          {aiExplaining === item.id ? (
                            <div className="flex items-center gap-2 text-amber-400">
                              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                              Explaining...
                            </div>
                          ) : (
                            aiExplanations[item.id]
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {aiExplaining === item.id && !aiExplanations[item.id] && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Analyzing code...
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
