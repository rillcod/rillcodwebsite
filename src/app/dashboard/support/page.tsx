'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  admin_reply?: string;
  follow_up?: string;
  category: string;
  priority: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  resolved: 'bg-emerald-500/20 text-emerald-400',
  reopened: 'bg-orange-500/20 text-orange-400',
  closed: 'bg-gray-500/20 text-gray-400',
};

export default function SupportPage() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/support');
      const json = await res.json();
      setTickets(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create ticket'); return; }
      setTickets(prev => [json.data, ...prev]);
      setSubject(''); setMessage(''); setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSubmitting(true);
    try {
      const field = isStaff ? 'admin_reply' : 'follow_up';
      const res = await fetch(`/api/support/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: reply }),
      });
      if (res.ok) {
        setReply('');
        await loadTickets();
        const updated = tickets.find(t => t.id === selected.id);
        if (updated) setSelected({ ...updated, [field]: reply });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (selected) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-sm">
          ← Back to tickets
        </button>
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-foreground font-bold text-lg">{selected.subject}</h2>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[selected.status] ?? ''}`}>
              {selected.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</p>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="bg-muted/30 rounded p-3">
              <p className="text-xs text-muted-foreground mb-1 font-semibold">Your message</p>
              <p className="text-sm text-foreground">{selected.message}</p>
            </div>
            {selected.follow_up && (
              <div className="bg-blue-500/10 rounded p-3">
                <p className="text-xs text-blue-400 mb-1 font-semibold">Your follow-up</p>
                <p className="text-sm text-foreground">{selected.follow_up}</p>
              </div>
            )}
            {selected.admin_reply && (
              <div className="bg-emerald-500/10 rounded p-3">
                <p className="text-xs text-emerald-400 mb-1 font-semibold">Staff reply</p>
                <p className="text-sm text-foreground">{selected.admin_reply}</p>
              </div>
            )}
          </div>

          <form onSubmit={submitReply} className="border-t border-border pt-4 space-y-3">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={isStaff ? 'Write a reply…' : 'Add a follow-up…'}
              rows={3}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
            <button
              type="submit"
              disabled={!reply.trim() || submitting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-40"
            >
              {submitting ? 'Sending…' : 'Send Reply'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Support Tickets</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold"
        >
          {showForm ? 'Cancel' : '+ New Ticket'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTicket} className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe your issue in detail…"
              rows={4}
              className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={!subject.trim() || !message.trim() || submitting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-card animate-pulse rounded-lg" />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No support tickets yet.</div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className="w-full text-left bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(ticket.created_at).toLocaleDateString()} · #{ticket.id.slice(0, 8)}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[ticket.status] ?? ''}`}>
                  {ticket.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
