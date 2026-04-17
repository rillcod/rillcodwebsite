'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  status: string;
  expires_at?: string | null;
  created_at: string;
  portal_users?: { full_name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-zinc-500/20 text-zinc-400',
  published: 'bg-emerald-500/20 text-emerald-400',
  archived:  'bg-amber-500/20 text-amber-400',
};

const AUDIENCES = ['all', 'students', 'parents', 'teachers', 'class'];

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '', content: '', target_audience: 'all', status: 'published', expires_at: '',
  });
  const [error, setError] = useState('');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/announcements');
      const json = await res.json();
      setAnnouncements(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          target_audience: form.target_audience,
          status: form.status,
          expires_at: form.expires_at || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed'); return; }
      setAnnouncements(prev => [json.data, ...prev]);
      setShowForm(false);
      setForm({ title: '', content: '', target_audience: 'all', status: 'published', expires_at: '' });
    } finally {
      setSubmitting(false);
    }
  }

  const visible = announcements.filter(a => {
    if (a.status === 'draft' || a.status === 'archived') return isStaff;
    if (a.expires_at) {
      // Compare in UTC to avoid timezone issues
      const expiryDate = new Date(a.expires_at);
      const nowUTC = new Date();
      if (expiryDate < nowUTC) return isStaff; // NF-15.6
    }
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Announcements</h1>
        {isStaff && (
          <button onClick={() => setShowForm(v => !v)}
            className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold min-h-[44px] sm:min-h-0">
            {showForm ? 'Cancel' : '+ New Announcement'}
          </button>
        )}
      </div>

      {/* Composer form (NF-15.1, 15.2) */}
      {showForm && isStaff && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title…"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-3 sm:py-2 text-sm text-foreground focus:outline-none focus:border-primary min-h-[44px] sm:min-h-0" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Body</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={4} placeholder="Write your announcement…"
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-3 sm:py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Audience</label>
              <select value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-3 sm:py-2 text-sm text-foreground focus:outline-none focus:border-primary capitalize min-h-[44px] sm:min-h-0">
                {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-3 sm:py-2 text-sm text-foreground focus:outline-none focus:border-primary min-h-[44px] sm:min-h-0">
                <option value="published">Publish now</option>
                <option value="draft">Save as draft</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Expires at (optional)</label>
            <input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-3 sm:py-2 text-sm text-foreground focus:outline-none focus:border-primary min-h-[44px] sm:min-h-0" />
          </div>
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button type="submit" disabled={!form.title.trim() || !form.content.trim() || submitting}
            className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-40 min-h-[44px] sm:min-h-0">
            {submitting ? 'Saving…' : form.status === 'draft' ? 'Save Draft' : 'Publish'}
          </button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-card animate-pulse rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No announcements yet.</div>
      ) : (
        <div className="space-y-3">
          {visible.map(a => {
            const expiryDate = a.expires_at ? new Date(a.expires_at) : null;
            const nowUTC = new Date();
            const isExpired = expiryDate && expiryDate < nowUTC;
            const displayStatus = isExpired ? 'archived' : a.status;
            return (
              <div key={a.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[displayStatus] ?? STATUS_BADGE.published}`}>
                        {isExpired ? 'Expired' : displayStatus}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{a.target_audience}</span>
                    </div>
                    <h3 className="font-semibold text-foreground">{a.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {a.portal_users?.full_name ?? 'Staff'} · {new Date(a.created_at).toLocaleDateString()}
                  {a.expires_at && ` · Expires ${new Date(a.expires_at).toLocaleDateString()}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
