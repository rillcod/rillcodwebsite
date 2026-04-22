'use client';

import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  ClipboardIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from '@/lib/icons';

type WhatsappGroup = {
  id: string;
  name: string;
  link: string;
  school_id: string | null;
  created_by: string;
};

export default function WhatsAppGroupsPage() {
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState('');
  const [link, setLink] = useState('');

  async function loadGroups() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-groups', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load WhatsApp groups');
      setGroups(json.data ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load WhatsApp groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function addGroup() {
    if (!name.trim() || !link.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), link: link.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save group');
      setGroups(prev => [...prev, json.data]);
      setName('');
      setLink('');
    } catch (err: any) {
      setError(err.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(id: string) {
    if (!confirm('Remove this WhatsApp group link?')) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp-groups?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete group');
      setGroups(prev => prev.filter(g => g.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete group');
    } finally {
      setDeletingId(null);
    }
  }

  function copyMessage() {
    navigator.clipboard?.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareToGroup(linkToOpen: string) {
    if (message.trim()) {
      navigator.clipboard?.writeText(message).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      });
    }
    setTimeout(() => {
      window.open(linkToOpen, '_blank', 'noopener,noreferrer');
    }, 120);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-[#25D366]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#25D366]">Communication</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">WhatsApp Groups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Keep your school WhatsApp group invite links in one place and open them quickly when needed.
            </p>
          </div>
          <button
            onClick={loadGroups}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border bg-card hover:bg-muted/40 text-xs font-bold uppercase tracking-widest"
          >
            <ArrowPathIcon className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Add New Group</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Group name (e.g. JSS1 Parents)"
              className="w-full px-4 py-2.5 bg-background border border-border text-sm focus:outline-none focus:border-[#25D366]/50"
            />
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              className="w-full px-4 py-2.5 bg-background border border-border text-sm focus:outline-none focus:border-[#25D366]/50"
            />
          </div>
          <button
            onClick={addGroup}
            disabled={!name.trim() || !link.trim() || saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Group'}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Use group invite links from WhatsApp: Group Info {'>'} Invite via link.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Share Message</p>
            <button
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background hover:bg-muted/40 text-xs font-bold"
            >
              {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            placeholder="Type the message you want to share to a WhatsApp group..."
            className="w-full px-4 py-3 bg-background border border-border text-sm focus:outline-none focus:border-[#25D366]/50 resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            When you click <strong>Send</strong>, this message is copied so you can paste it directly in the opened group.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Saved Groups ({groups.length})
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading groups...</div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No WhatsApp groups saved yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {groups.map(group => (
                <div key={group.id} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{group.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{group.link}</p>
                  </div>
                  <a
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      shareToGroup(group.link);
                    }}
                    className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold"
                  >
                    Send
                  </a>
                  <button
                    onClick={() => removeGroup(group.id)}
                    disabled={deletingId === group.id}
                    className="px-3 py-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    {deletingId === group.id ? '...' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
