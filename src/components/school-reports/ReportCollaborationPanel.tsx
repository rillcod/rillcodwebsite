'use client';

import { FormEvent, useEffect, useState } from 'react';

type CommentRow = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  revisionId: string | null;
};

export function ReportCollaborationPanel({ reportId }: { reportId: string }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function loadComments() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}/comments`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load comments.');
      setComments(
        (json.data?.comments ?? []).map((row: any) => ({
          id: row.id,
          body: row.body,
          authorName: row.authorName,
          createdAt: row.created_at,
          revisionId: row.revision_id,
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load comments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComments();
  }, [reportId]);

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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to post comment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-black">Review comments</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Staff notes for editorial review before publish — visible to admins and assigned teachers.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading comments…</p>
      ) : (
        <ul className="mt-4 space-y-3">
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
            <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No review comments yet. Add the first note below.
            </li>
          ) : null}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <label className="block text-sm font-black" htmlFor={`comment-${reportId}`}>
          Add comment
        </label>
        <textarea
          id={`comment-${reportId}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="e.g. Confirm Teen Dev delivery ticks before publishing."
        />
        <button
          type="submit"
          disabled={submitting || body.trim().length < 2}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Post comment'}
        </button>
      </form>
    </section>
  );
}
