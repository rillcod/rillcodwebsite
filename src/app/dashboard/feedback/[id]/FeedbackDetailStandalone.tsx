'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';

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
  new: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  resolved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  reopened: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

/** Non-admin feedback detail (customers, teachers). Admins use Office Center. */
export default function FeedbackDetailStandalone() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [canRespond, setCanRespond] = useState(false);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<'in_progress' | 'resolved' | 'closed'>('resolved');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [delivery, setDelivery] = useState<{ in_app: boolean; email: boolean } | null>(null);
  const [satisfactionScore, setSatisfactionScore] = useState(0);
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/feedback/${params.id}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to load feedback.');
        if (!active) return;
        setFeedback(json.data);
        setCanRespond(json.canRespond === true);
        setResponse(json.data.admin_response || '');
        if (['in_progress', 'resolved', 'closed'].includes(json.data.status)) setStatus(json.data.status);
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
  }, [params.id]);

  async function saveResponse() {
    if (!response.trim()) {
      setError('Write a response before sending.');
      return;
    }
    setSaving(true);
    setError('');
    setDelivery(null);
    try {
      const res = await fetch(`/api/feedback/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: response.trim(), status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to save response.');
      setFeedback(json.data);
      setDelivery(json.delivery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save response.');
    } finally {
      setSaving(false);
    }
  }

  async function customerAction(payload: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/feedback/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to update feedback.');
      setFeedback(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update feedback.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading feedback...</div>;
  if (error && !feedback) {
    return (
      <div className="p-8">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link href="/dashboard/feedback" className="text-primary underline">
          Back to feedback
        </Link>
      </div>
    );
  }
  if (!feedback) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/feedback" className="text-sm font-semibold text-primary">
            Back to feedback
          </Link>
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-muted-foreground">
            FB-{feedback.id.slice(0, 8)}
          </p>
          <h1 className="mt-1 text-3xl font-black text-foreground">{feedback.subject}</h1>
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

      {feedback.admin_response && !canRespond ? (
        <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Rillcod response</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{feedback.admin_response}</p>
          {feedback.responded_at ? (
            <p className="mt-4 text-xs text-muted-foreground">Responded {new Date(feedback.responded_at).toLocaleString()}</p>
          ) : null}
        </section>
      ) : null}

      {canRespond ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-black text-foreground">Administrator response</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The response is saved to the case, shown in-app, and emailed when an address is available.
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
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
            >
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button
              type="button"
              onClick={() => void saveResponse()}
              disabled={saving || !response.trim()}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? 'Sending...' : feedback.admin_response ? 'Update response' : 'Send response'}
            </button>
            <span className="text-xs text-muted-foreground">Signed in as {profile?.full_name || 'Staff'}</span>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {delivery ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
              Saved. In-app: {delivery.in_app ? 'sent' : 'not available'}; email: {delivery.email ? 'sent' : 'not delivered'}.
            </p>
          ) : null}
        </section>
      ) : null}

      {!canRespond && ['resolved', 'closed'].includes(feedback.status) ? (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-black">Was this response useful?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your answer measures real customer value. You can also reopen the request if more help is needed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => setSatisfactionScore(score)}
                className={`rounded-lg border px-3 py-2 text-sm font-black ${
                  satisfactionScore === score ? 'border-primary bg-primary text-white' : 'border-border'
                }`}
              >
                {score}
              </button>
            ))}
          </div>
          <textarea
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="What helped, or what is still missing?"
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !satisfactionScore}
              onClick={() => void customerAction({ satisfactionScore, outcome })}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              Save rating
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void customerAction({ status: 'reopened' })}
              className="rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-black text-amber-600 dark:text-amber-400"
            >
              I still need help
            </button>
          </div>
          {feedback.satisfaction_score ? (
            <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">Saved rating: {feedback.satisfaction_score}/5</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
