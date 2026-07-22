'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ChatBubbleLeftRightIcon, ChevronDownIcon, LockClosedIcon } from '@/lib/icons';

type CommentRow = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  revisionId: string | null;
};

type ReportCollaborationPanelProps = {
  reportId: string;
  historyHref?: string;
  reportStatus?: string | null;
};

const NOTE_EXAMPLES = [
  'Hold publish until Teen Dev delivery ticks are confirmed.',
  'Check JSS2 attendance — roll marks look sparse this term.',
  'Finance invoice still draft — attach before sending to school.',
];

export function ReportCollaborationPanel({
  reportId,
  historyHref,
  reportStatus,
}: ReportCollaborationPanelProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  async function loadComments() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}/comments`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load comments.');
      const rows = (json.data?.comments ?? []).map((row: any) => ({
        id: row.id,
        body: row.body,
        authorName: row.authorName,
        createdAt: row.created_at,
        revisionId: row.revision_id,
      }));
      setComments(rows);
      if (!loadedOnce) {
        setExpanded(rows.length > 0);
        setLoadedOnce(true);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load comments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComments();
  }, [reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 2) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to post comment.');
      const row = json.data?.comment;
      if (row) {
        setComments((prev) => [
          ...prev,
          {
            id: row.id,
            body: row.body,
            authorName: row.authorName,
            createdAt: row.created_at,
            revisionId: row.revision_id,
          },
        ]);
      } else {
        await loadComments();
      }
      setBody('');
      setExpanded(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to post comment.');
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = reportStatus === 'published'
    ? 'Published report'
    : reportStatus === 'archived'
      ? 'Archived report'
      : 'Draft in progress';

  return (
    <section className="rounded-2xl border border-border/80 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 p-5 text-left hover:bg-muted/20 transition-colors"
        aria-expanded={expanded}
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black text-foreground">Internal staff notes</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              <LockClosedIcon className="h-3 w-3" />
              Not in school PDF
            </span>
            {!loading && comments.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                {comments.length} note{comments.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional coordination for admins and assigned teachers — leave reminders or blockers here while you prepare
            this {statusLabel.toLowerCase()}. Schools and parents never see these notes.
          </p>
          {!expanded ? (
            <p className="mt-2 text-xs text-muted-foreground/80">
              {comments.length
                ? `${comments.length} note${comments.length === 1 ? '' : 's'} saved — expand to read or reply.`
                : 'No notes yet — expand only if you need to flag something for another staff member.'}
            </p>
          ) : null}
        </div>
        <ChevronDownIcon
          className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded ? (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-black text-foreground">When to use this</p>
            <ul className="mt-2 space-y-1.5 list-disc pl-4">
              <li>Flag data to double-check before publish (attendance, course counts, delivery ticks).</li>
              <li>Ask another teacher to verify something without editing the report narrative.</li>
              <li>Record a publish blocker — e.g. missing invoice or pending parent consent.</li>
            </ul>
            <p className="mt-3 text-xs">
              This does <strong className="text-foreground">not</strong> change report content or appear in the exported PDF.
              {historyHref ? (
                <>
                  {' '}For who saved what and when, use{' '}
                  <Link href={historyHref} className="font-black text-primary hover:underline">
                    Activity &amp; revisions
                  </Link>
                  .
                </>
              ) : (
                <> Formal save history lives under Activity &amp; revisions.</>
              )}
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading notes…</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black">{comment.authorName || 'Staff'}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{comment.body}</p>
                </li>
              ))}
              {!comments.length ? (
                <li className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Nothing here yet. Notes are optional — skip this section if you are working alone.
                </li>
              ) : null}
            </ul>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-black" htmlFor={`comment-${reportId}`}>
              Add a staff note
            </label>
            <textarea
              id={`comment-${reportId}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder={NOTE_EXAMPLES[comments.length % NOTE_EXAMPLES.length]}
            />
            <button
              type="submit"
              disabled={submitting || body.trim().length < 2}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save note'}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
