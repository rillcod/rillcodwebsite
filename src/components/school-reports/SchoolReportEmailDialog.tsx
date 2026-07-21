'use client';

import { FormEvent, useEffect, useState } from 'react';
import { EnvelopeIcon, XMarkIcon } from '@/lib/icons';

type EmailSuggestion = {
  email: string;
  name: string | null;
  label: string;
};

export function SchoolReportEmailDialog({
  reportId,
  reportTitle,
  open,
  onClose,
}: {
  reportId: string;
  reportTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const [to, setTo] = useState('');
  const [toName, setToName] = useState('');
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<EmailSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess('');
    setLoadingSuggestions(true);
    void (async () => {
      try {
        const response = await fetch(`/api/school-performance-reports/${reportId}/email`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Unable to load email suggestions.');
        const rows = (json.data?.suggestions ?? []) as EmailSuggestion[];
        setSuggestions(rows);
        if (!to && rows[0]?.email) {
          setTo(rows[0].email);
          setToName(rows[0].name || '');
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load recipients.');
      } finally {
        setLoadingSuggestions(false);
      }
    })();
  }, [open, reportId]);

  function applySuggestion(row: EmailSuggestion) {
    setTo(row.email);
    setToName(row.name || '');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!to.trim()) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          toName: toName.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to send email.');
      setSuccess(`Report emailed to ${to.trim()} with PDF attached.`);
      setMessage('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to send email.');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby={`email-report-${reportId}`}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Email report</p>
            <h2 id={`email-report-${reportId}`} className="mt-1 text-lg font-black">
              Send PDF attachment
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{reportTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        {loadingSuggestions ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading school contacts…</p>
        ) : suggestions.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((row) => (
              <button
                key={row.email}
                type="button"
                onClick={() => applySuggestion(row)}
                className={`rounded-full border px-3 py-1 text-xs font-black ${
                  to === row.email ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                }`}
              >
                {row.label}: {row.name || row.email}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-black" htmlFor={`email-to-${reportId}`}>
              Recipient email
            </label>
            <input
              id={`email-to-${reportId}`}
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="principal@school.edu.ng"
            />
          </div>
          <div>
            <label className="block text-sm font-black" htmlFor={`email-name-${reportId}`}>
              Recipient name (optional)
            </label>
            <input
              id={`email-name-${reportId}`}
              type="text"
              value={toName}
              onChange={(event) => setToName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="School leadership"
            />
          </div>
          <div>
            <label className="block text-sm font-black" htmlFor={`email-message-${reportId}`}>
              Short note (optional)
            </label>
            <textarea
              id={`email-message-${reportId}`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Please review before our term review meeting."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The current report book will be attached as a PDF. For published reports, the live published revision is used.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-black"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !to.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              <EnvelopeIcon className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
