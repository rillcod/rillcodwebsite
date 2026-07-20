'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfficeOptional } from './OfficeContext';

interface FeedbackRecord {
  id: string;
  user_name: string;
  user_email: string | null;
  user_role: string | null;
  type: string;
  rating: number | null;
  subject: string;
  message: string;
  status: 'new' | 'reopened' | 'in_progress' | 'resolved' | 'closed';
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
  satisfaction_score?: number | null;
}

const statusClasses: Record<string, string> = {
  new: 'bg-amber-500/15 text-amber-600',
  in_progress: 'bg-blue-500/15 text-blue-600',
  resolved: 'bg-emerald-500/15 text-emerald-600',
  closed: 'bg-slate-500/15 text-slate-600',
  reopened: 'bg-violet-500/15 text-violet-600',
};

type Props = { feedbackId: string };

export function OfficeFeedbackDetailPanel({ feedbackId }: Props) {
  const { profile } = useAuth();
  const office = useOfficeOptional();
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [relatedCaseId, setRelatedCaseId] = useState<string | null>(null);
  const [canRespond, setCanRespond] = useState(false);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<'in_progress' | 'resolved' | 'closed'>('resolved');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [delivery, setDelivery] = useState<{ in_app: boolean; email: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      setRelatedCaseId(null);
      try {
        const res = await fetch(`/api/feedback/${feedbackId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to load feedback.');
        if (!active) return;
        setFeedback(json.data);
        setCanRespond(json.canRespond === true);
        setResponse(json.data.admin_response || '');
        if (['in_progress', 'resolved', 'closed'].includes(json.data.status)) setStatus(json.data.status);

        // Find the linked communication case created from this feedback (same subject + requester).
        const casesRes = await fetch('/api/communication-cases', { cache: 'no-store' });
        if (casesRes.ok) {
          const casesJson = await casesRes.json();
          const match = (casesJson.data || []).find(
            (row: { id: string; subject?: string; requester_email?: string | null; channels?: string[] }) =>
              row.subject === json.data.subject &&
              (row.channels || []).includes('feedback') &&
              (!json.data.user_email || !row.requester_email || row.requester_email === json.data.user_email),
          );
          if (match?.id) setRelatedCaseId(match.id);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load feedback.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [feedbackId]);

  async function saveResponse() {
    if (!response.trim()) {
      setError('Write a response before sending.');
      return;
    }
    setSaving(true);
    setError('');
    setDelivery(null);
    try {
      const res = await fetch(`/api/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: response.trim(), status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to save response.');
      setFeedback(json.data);
      setDelivery(json.delivery);
      office?.notifyOfficeChange('feedback');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save response.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading feedback...</p>;
  if (error && !feedback) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          type="button"
          onClick={() => office?.clearFeedback()}
          className="min-h-11 touch-manipulation text-sm font-bold text-primary"
        >
          Back to feedback queue
        </button>
      </div>
    );
  }
  if (!feedback) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => office?.clearFeedback()}
            className="min-h-11 touch-manipulation text-sm font-semibold text-primary"
          >
            Back to feedback queue
          </button>
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-muted-foreground">
            FB-{feedback.id.slice(0, 8)}
          </p>
          <h2 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">{feedback.subject}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Submitted by {feedback.user_name} on {new Date(feedback.created_at).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
            statusClasses[feedback.status] || statusClasses.new
          }`}
        >
          {feedback.status.replace('_', ' ')}
        </span>
      </div>

      {relatedCaseId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            This feedback is linked to a Help Request case in Office Center.
          </p>
          <button
            type="button"
            onClick={() => office?.openCase(relatedCaseId)}
            className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"
          >
            Open linked case
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1 font-bold uppercase">{feedback.type}</span>
          {feedback.rating ? <span className="rounded-full bg-muted px-3 py-1 font-bold">{feedback.rating}/5 rating</span> : null}
          {canRespond && feedback.user_email ? (
            <span className="rounded-full bg-muted px-3 py-1">{feedback.user_email}</span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{feedback.message}</p>
      </section>

      {canRespond ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-black text-foreground">Administrator response</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Saving writes the response into the feedback record and the linked communication case.
          </p>
          <textarea
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            rows={8}
            maxLength={5000}
            className="mt-5 w-full rounded-xl border border-border bg-background p-4 text-sm text-foreground outline-none focus:border-primary"
            placeholder="Write a clear response, action taken, and next step..."
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="min-h-11 rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={() => void saveResponse()}
              disabled={saving || !response.trim()}
              className="min-h-11 touch-manipulation rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? 'Sending...' : feedback.admin_response ? 'Update response' : 'Send response'}
            </button>
            <span className="text-xs text-muted-foreground">Signed in as {profile?.full_name || 'Administrator'}</span>
          </div>
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          {delivery ? (
            <p className="mt-4 text-sm text-emerald-700">
              Saved. In-app: {delivery.in_app ? 'sent' : 'not available'}; email: {delivery.email ? 'sent' : 'not delivered'}.
              Desk and Help Requests will refresh automatically.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
