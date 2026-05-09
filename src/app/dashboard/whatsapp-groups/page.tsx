'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Search, Plus, Trash2, Send, Copy, Check, RefreshCw,
  ChevronRight, Clock, Tag, X, Pencil, BookOpen,
  Users, MessageSquare, Layers,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Group = {
  id: string;
  name: string;
  link: string;
  school_id: string | null;
  created_by: string;
  created_at?: string;
};

interface Template {
  id: string;
  title: string;
  body: string;
}

const TEMPLATES_KEY = 'rillcod_wa_templates_v1';
const LAST_SENT_KEY = 'rillcod_wa_last_sent_v1';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Parents:  ['parent', 'guardian', 'pta', 'family'],
  Teachers: ['teacher', 'staff', 'faculty', 'tutor'],
  Students: ['student', 'pupil', 'class', 'jss', 'ss', 'primary', 'basic'],
  Admin:    ['admin', 'management', 'office', 'school'],
  All:      ['all', 'general', 'school-wide', 'everyone'],
};

function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'Other';
}

const CATEGORY_COLORS: Record<string, string> = {
  Parents:  '#7c3aed',
  Teachers: '#0284c7',
  Students: '#00a884',
  Admin:    '#d97706',
  All:      '#dc2626',
  Other:    '#6b7280',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

// ── Component ────────────────────────────────────────────────────────────────
export default function WhatsAppGroupsPage() {
  const [groups, setGroups]           = useState<Group[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Add / Edit group form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formName, setFormName]       = useState('');
  const [formLink, setFormLink]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // Message composer
  const [message, setMessage]         = useState('');
  const [charCount, setCharCount]     = useState(0);

  // Multi-select
  const [selected, setSelected]       = useState<Set<string>>(new Set());

  // Templates
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTplTitle, setNewTplTitle] = useState('');

  // Send state
  const [sending, setSending]         = useState(false);
  const [toastMsg, setToastMsg]       = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  // Filters
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState<string>('All');

  // Last-sent timestamps (localStorage)
  const [lastSent, setLastSent]       = useState<Record<string, string>>({});

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadGroups();
    const saved = localStorage.getItem(TEMPLATES_KEY);
    if (saved) { try { setTemplates(JSON.parse(saved)); } catch {} }
    const ls = localStorage.getItem(LAST_SENT_KEY);
    if (ls) { try { setLastSent(JSON.parse(ls)); } catch {} }
  }, []);

  useEffect(() => { setCharCount(message.length); }, [message]);

  function showToast(msg: string, duration = 3000) {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(null), duration);
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  async function loadGroups() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/whatsapp-groups', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setGroups(json.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveGroup() {
    if (!formName.trim() || !formLink.trim()) return;
    setSaving(true); setError(null);
    try {
      if (editingGroup) {
        const res = await fetch('/api/whatsapp-groups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingGroup.id, name: formName, link: formLink }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Update failed');
        setGroups(prev => prev.map(g => g.id === editingGroup.id ? json.data : g));
      } else {
        const res = await fetch('/api/whatsapp-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, link: formLink }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Save failed');
        setGroups(prev => [...prev, json.data]);
      }
      resetForm();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteGroup(id: string) {
    if (!confirm('Remove this WhatsApp group?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/whatsapp-groups?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setGroups(prev => prev.filter(g => g.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e: any) { setError(e.message); }
    finally { setDeletingId(null); }
  }

  function resetForm() {
    setFormName(''); setFormLink(''); setEditingGroup(null); setShowAddForm(false);
  }

  function openEdit(group: Group) {
    setEditingGroup(group); setFormName(group.name); setFormLink(group.link);
    setShowAddForm(true);
  }

  // ── Send logic ───────────────────────────────────────────────────────────
  function recordSent(ids: string[]) {
    const now = new Date().toISOString();
    const updated = { ...lastSent };
    ids.forEach(id => { updated[id] = now; });
    setLastSent(updated);
    localStorage.setItem(LAST_SENT_KEY, JSON.stringify(updated));
  }

  async function sendToGroup(group: Group) {
    if (message.trim()) {
      await navigator.clipboard?.writeText(message).catch(() => {});
    }
    recordSent([group.id]);
    setTimeout(() => window.open(group.link, '_blank', 'noopener,noreferrer'), 80);
    showToast(`✓ Message copied — paste it in "${group.name}"`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function broadcastToSelected() {
    if (selected.size === 0) { showToast('Select at least one group first'); return; }
    if (!message.trim()) { showToast('Write a message first'); return; }
    setSending(true);

    await navigator.clipboard?.writeText(message).catch(() => {});
    showToast(`Opening ${selected.size} group${selected.size > 1 ? 's' : ''}… paste the message in each.`, 6000);

    const targets = groups.filter(g => selected.has(g.id));
    recordSent(targets.map(g => g.id));

    for (let i = 0; i < targets.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 100 : 1200));
      window.open(targets[i].link, '_blank', 'noopener,noreferrer');
    }

    setSending(false);
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  function saveTemplate() {
    if (!message.trim()) { showToast('Write a message first to save as template'); return; }
    const title = newTplTitle.trim() || `Template ${templates.length + 1}`;
    const tpl: Template = { id: Date.now().toString(), title, body: message };
    const updated = [...templates, tpl];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setNewTplTitle('');
    showToast(`Saved as "${title}"`);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  }

  function loadTemplate(tpl: Template) {
    setMessage(tpl.body);
    setShowTemplates(false);
    showToast(`Loaded: "${tpl.title}"`);
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const categories = ['All', ...Array.from(new Set(groups.map(g => detectCategory(g.name))))];
  const filtered = groups.filter(g => {
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = catFilter === 'All' || detectCategory(g.name) === catFilter;
    return matchSearch && matchCat;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full" style={{ background: '#0b141a', color: '#e9edef' }}>

      {/* Toast */}
      {toastMsg && (
        <div
          className="fixed top-[70px] left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-xl text-sm font-bold shadow-2xl text-white text-center max-w-xs"
          style={{ background: '#1f2c34', border: '1px solid rgba(0,168,132,0.4)' }}
        >
          {toastMsg}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#00a884' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                </svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#00a884' }}>
                WhatsApp Groups
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Group Broadcast</h1>
            <p className="text-[12px] mt-0.5" style={{ color: '#8696a0' }}>
              Save group links · compose announcements · broadcast to multiple groups at once
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={loadGroups}
              className="p-2.5 rounded-full hover:bg-white/5 transition-colors" style={{ color: '#8696a0' }} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setShowAddForm(v => !v); setEditingGroup(null); setFormName(''); setFormLink(''); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[12px] font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: '#00a884' }}
            >
              <Plus className="w-4 h-4" /> Add Group
            </button>
          </div>
        </div>

        {/* ── Add / Edit Form ──────────────────────────────────────────────── */}
        {showAddForm && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#2a3942' }}>
              <div className="flex items-center gap-2">
                {editingGroup ? <Pencil className="w-4 h-4" style={{ color: '#00a884' }} /> : <Plus className="w-4 h-4" style={{ color: '#00a884' }} />}
                <span className="font-black text-white text-[14px]">{editingGroup ? 'Edit Group' : 'New Group'}</span>
              </div>
              <button onClick={resetForm} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" style={{ color: '#8696a0' }} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="rounded-xl px-4 py-3 text-[13px] font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  Group Name <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. JSS1A Parents, Teachers Staff, SS2 Students"
                  className="w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  WhatsApp Invite Link <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input value={formLink} onChange={e => setFormLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  type="url"
                  className="w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }} />
                <p className="text-[10px] mt-1.5 ml-1" style={{ color: '#8696a0' }}>
                  In WhatsApp: open the group → Group Info → Invite via link → Copy link
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-black transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                  Cancel
                </button>
                <button onClick={saveGroup}
                  disabled={saving || !formName.trim() || !formLink.trim()}
                  className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: '#00a884' }}>
                  {saving ? 'Saving…' : editingGroup ? 'Update Group' : 'Save Group'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main grid ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

          {/* Left — Groups list */}
          <div className="space-y-4">

            {/* Search + Category filter */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Search className="w-4 h-4 shrink-0" style={{ color: '#8696a0' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search groups…"
                  className="flex-1 bg-transparent text-white text-[14px] outline-none placeholder-white/20"
                  style={{ caretColor: '#00a884' }} />
                {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5" style={{ color: '#8696a0' }} /></button>}
              </div>
              {categories.length > 1 && (
                <div className="px-4 py-2.5 flex gap-2 overflow-x-auto">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCatFilter(cat)}
                      className="shrink-0 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest transition-all"
                      style={{
                        background: catFilter === cat ? (CATEGORY_COLORS[cat] || '#00a884') + '30' : 'rgba(255,255,255,0.05)',
                        color: catFilter === cat ? (CATEGORY_COLORS[cat] || '#00a884') : '#8696a0',
                        border: `1px solid ${catFilter === cat ? (CATEGORY_COLORS[cat] || '#00a884') + '50' : 'transparent'}`,
                      }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Multi-select bar */}
            {selected.size > 0 && (
              <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: 'rgba(0,168,132,0.12)', border: '1px solid rgba(0,168,132,0.3)' }}>
                <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: '#00a884' }}>
                  <Check className="w-4 h-4" />
                  {selected.size} group{selected.size > 1 ? 's' : ''} selected
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(new Set())}
                    className="text-[12px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ color: '#8696a0' }}>
                    Clear
                  </button>
                  <button onClick={broadcastToSelected} disabled={sending || !message.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-white text-[12px] font-black uppercase tracking-widest disabled:opacity-40 transition-all active:scale-95"
                    style={{ background: '#00a884' }}>
                    <Layers className="w-3.5 h-3.5" />
                    {sending ? 'Opening…' : `Broadcast to ${selected.size}`}
                  </button>
                </div>
              </div>
            )}

            {/* Groups list */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#2a3942' }}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: '#8696a0' }} />
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>
                    {filtered.length} Group{filtered.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {filtered.length > 0 && (
                  <button
                    onClick={() => {
                      if (selected.size === filtered.length) setSelected(new Set());
                      else setSelected(new Set(filtered.map(g => g.id)));
                    }}
                    className="text-[11px] font-black uppercase tracking-widest transition-colors"
                    style={{ color: '#00a884' }}>
                    {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="p-12 text-center text-[13px]" style={{ color: '#8696a0' }}>Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 mx-auto" style={{ color: '#2a3942' }} />
                  <p className="text-[13px]" style={{ color: '#8696a0' }}>
                    {groups.length === 0 ? 'No groups saved yet. Add your first group above.' : 'No groups match your filter.'}
                  </p>
                </div>
              ) : (
                <div>
                  {filtered.map((group, idx) => {
                    const cat = detectCategory(group.name);
                    const catColor = CATEGORY_COLORS[cat] || '#6b7280';
                    const isSelected = selected.has(group.id);
                    const sentAt = lastSent[group.id];
                    return (
                      <div key={group.id}
                        className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${isSelected ? '' : 'hover:bg-white/[0.03]'}`}
                        style={{
                          borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          background: isSelected ? 'rgba(0,168,132,0.07)' : undefined,
                        }}>

                        {/* Select checkbox */}
                        <button
                          onClick={() => setSelected(prev => {
                            const s = new Set(prev);
                            if (s.has(group.id)) s.delete(group.id); else s.add(group.id);
                            return s;
                          })}
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                          style={{
                            borderColor: isSelected ? '#00a884' : 'rgba(255,255,255,0.2)',
                            background: isSelected ? '#00a884' : 'transparent',
                          }}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </button>

                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-black text-[14px] text-white"
                          style={{ background: catColor + '25', color: catColor, border: `1.5px solid ${catColor}40` }}>
                          {group.name.slice(0, 2).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-[14px] truncate">{group.name}</span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: catColor + '20', color: catColor }}>
                              {cat}
                            </span>
                          </div>
                          {sentAt ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5" style={{ color: '#00a884' }} />
                              <span className="text-[11px]" style={{ color: '#8696a0' }}>Sent {formatRelativeTime(sentAt)}</span>
                            </div>
                          ) : (
                            <p className="text-[11px] truncate mt-0.5" style={{ color: '#8696a0' }}>Never sent</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => openEdit(group)}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5" style={{ color: '#8696a0' }} />
                          </button>
                          <button
                            onClick={() => sendToGroup(group)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-[12px] font-black transition-all active:scale-95"
                            style={{ background: '#00a884' }}
                            title="Copy message & open group">
                            <Send className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Send</span>
                          </button>
                          <button onClick={() => deleteGroup(group.id)} disabled={deletingId === group.id}
                            className="p-2 rounded-full hover:bg-rose-500/10 transition-colors disabled:opacity-40" title="Remove">
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right — Message Composer */}
          <div className="space-y-4 lg:sticky lg:top-4">

            {/* Composer card */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: '#2a3942', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" style={{ color: '#00a884' }} />
                  <span className="font-black text-white text-[13px]">Message Composer</span>
                </div>
                <button onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors"
                  style={{
                    background: showTemplates ? 'rgba(0,168,132,0.15)' : 'rgba(255,255,255,0.05)',
                    color: showTemplates ? '#00a884' : '#8696a0',
                  }}>
                  <BookOpen className="w-3.5 h-3.5" /> Templates
                </button>
              </div>

              <div className="p-4 space-y-3">
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={8}
                  placeholder="Type your announcement here…&#10;&#10;e.g. Dear Parents, please be informed that..."
                  className="w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none resize-none leading-relaxed"
                  style={{ background: '#2a3942', caretColor: '#00a884' }}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: charCount > 1000 ? '#f87171' : '#8696a0' }}>
                    {charCount} characters
                    {charCount > 0 && ` · ~${Math.ceil(charCount / 160)} SMS segment${Math.ceil(charCount / 160) !== 1 ? 's' : ''}`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigator.clipboard?.writeText(message).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); showToast('Copied to clipboard'); })}
                      disabled={!message.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black disabled:opacity-40 transition-all"
                      style={{ background: 'rgba(255,255,255,0.07)', color: '#8696a0' }}>
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => setMessage('')} disabled={!message.trim()}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black disabled:opacity-40 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.07)', color: '#8696a0' }}>
                      Clear
                    </button>
                  </div>
                </div>

                {/* Save as template */}
                <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <input
                    value={newTplTitle}
                    onChange={e => setNewTplTitle(e.target.value)}
                    placeholder="Template name (optional)…"
                    className="flex-1 text-white text-[12px] rounded-lg px-3 py-2 outline-none"
                    style={{ background: '#2a3942', caretColor: '#00a884' }}
                    onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); }}
                  />
                  <button onClick={saveTemplate} disabled={!message.trim()}
                    className="px-3 py-2 rounded-lg text-[12px] font-black disabled:opacity-40 transition-all text-white active:scale-95"
                    style={{ background: 'rgba(0,168,132,0.2)', color: '#00a884', border: '1px solid rgba(0,168,132,0.3)' }}>
                    Save template
                  </button>
                </div>
              </div>
            </div>

            {/* Templates panel */}
            {showTemplates && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-5 py-3" style={{ background: '#2a3942', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="font-black text-white text-[13px]">Saved Templates</span>
                </div>
                {templates.length === 0 ? (
                  <div className="p-6 text-center text-[12px]" style={{ color: '#8696a0' }}>
                    No templates yet. Write a message and save it as a template.
                  </div>
                ) : (
                  <div>
                    {templates.map((tpl, idx) => (
                      <div key={tpl.id}
                        style={{ borderBottom: idx < templates.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                        className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-[13px] truncate">{tpl.title}</p>
                          <p className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed" style={{ color: '#8696a0' }}>{tpl.body}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => loadTemplate(tpl)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white transition-all active:scale-95"
                            style={{ background: '#00a884' }}>
                            Use
                          </button>
                          <button onClick={() => deleteTemplate(tpl.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* How it works */}
            <div className="rounded-xl p-4 text-[11px] leading-relaxed space-y-1.5"
              style={{ background: 'rgba(0,168,132,0.07)', border: '1px solid rgba(0,168,132,0.18)', color: '#8696a0' }}>
              <p className="font-black uppercase tracking-widest text-[10px]" style={{ color: '#00a884' }}>How to broadcast</p>
              <p>1. Write your announcement in the composer</p>
              <p>2. Tick one or more groups from the list</p>
              <p>3. Tap <strong style={{ color: '#00a884' }}>Broadcast</strong> — the message is copied and each group opens in a new tab</p>
              <p>4. Paste in each group and send — done</p>
              <p className="mt-2 italic" style={{ color: '#8696a0' }}>
                Note: This uses standard WhatsApp invite links since the Business API does not support group messaging.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
