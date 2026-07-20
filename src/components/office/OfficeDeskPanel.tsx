'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';
import type { DeskSummary } from './types';

type DeskData = {
  summary: DeskSummary;
  attention: Array<{
    id: string;
    caseId: string;
    person: string;
    item: string;
    owner: string;
    reason: string;
    nextAction: string;
    dueAt: string | null;
    priority: string;
    restricted: boolean;
    updatedAt: string;
  }>;
  activity: Array<{
    id: string;
    person: string;
    item: string;
    kind: string;
    summary: string;
    channel: string;
    result: string;
    link: string | null;
    createdAt: string;
  }>;
};

const resultLabel = (value: string) =>
  ({ delivered: 'Delivered', read: 'Read', sent: 'Sent', queued: 'Waiting to send', failed: 'Failed', suppressed: 'Stopped by preference' }[value.toLowerCase()] || value);
const channelLabel = (value: string) =>
  ({ email: 'Email', whatsapp: 'WhatsApp', in_app: 'In the app', push: 'Phone notification' }[value.toLowerCase()] || value);

type Props = { embedded?: boolean };

export function OfficeDeskPanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const [data, setData] = useState<DeskData | null>(null);
  const [view, setView] = useState<'attention' | 'messages' | 'guide'>('attention');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const revision = office?.revision ?? 0;
  const lastChange = office?.lastChange;
  const setSummary = office?.setSummary;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/office-desk', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'The office desk could not be loaded.');
      setData(json);
      setSummary?.(json.summary ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The office desk could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [setSummary]);

  useEffect(() => {
    if (lastChange && !['cases', 'duty', 'health', 'settings', 'feedback', 'desk', 'inbox'].includes(lastChange)) return;
    void load();
  }, [load, revision, lastChange]);

  const visibleActivity = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return data?.activity || [];
    return (data?.activity || []).filter((row) =>
      `${row.person} ${row.item} ${row.kind} ${row.channel} ${row.result}`.toLowerCase().includes(value),
    );
  }, [data, search]);

  function openWork(caseId: string) {
    if (office) office.openCase(caseId);
    else window.location.assign(`/dashboard/office?workspace=cases&id=${encodeURIComponent(caseId)}`);
  }

  function openRelated(href: string | null) {
    if (!href) return;
    if (office?.followOfficeLink(href)) return;
    window.location.assign(href);
  }

  const summary = data?.summary ?? office?.summary;
  const duty = office?.duty;

  return (
    <div className="min-w-0 space-y-6">
      {!embedded ? (
        <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-primary">Start here every day</p>
            <h1 className="text-3xl font-black">Office Desk</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              See who needs help, what was sent, who owns each task, and whether the automatic office is working.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 w-full shrink-0 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-white sm:w-auto"
          >
            Refresh the desk
          </button>
        </header>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Daily attention queue, messages, and morning guide.</p>
            {duty ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                On duty now: <span className="font-bold text-foreground">{duty.primaryName || 'Admin review'}</span>
                {' · '}
                {duty.available}/{duty.totalEligible} staff available
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 w-full shrink-0 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-white sm:w-auto"
          >
            Refresh
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
      {loading && !data ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Preparing your office desk...
        </p>
      ) : null}

      {summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setView('attention')}
              className="min-h-11 touch-manipulation rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-left"
            >
              <p className="text-xs font-black uppercase text-amber-700">You should check</p>
              <p className="mt-2 text-3xl font-black">{summary.needsAttention}</p>
              <p className="mt-1 text-xs">Open items needing a person</p>
            </button>
            <button
              type="button"
              onClick={() => {
                if (office) office.setWorkspace('cases');
                else window.location.assign('/dashboard/office?workspace=cases');
              }}
              className="min-h-11 touch-manipulation rounded-2xl border border-border bg-card p-5 text-left"
            >
              <p className="text-xs font-black uppercase text-muted-foreground">No staff owner yet</p>
              <p className="mt-2 text-3xl font-black">{summary.unassigned}</p>
              <p className="mt-1 text-xs text-muted-foreground">Open Help Requests to assign</p>
            </button>
            <button
              type="button"
              onClick={() => office?.setWorkspace('settings', 'health')}
              className={`min-h-11 touch-manipulation rounded-2xl border p-5 text-left ${
                summary.failedMessages ? 'border-rose-500/30 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/10'
              }`}
            >
              <p className="text-xs font-black uppercase">Messages that failed</p>
              <p className="mt-2 text-3xl font-black">{summary.failedMessages}</p>
              <p className="mt-1 text-xs">Successful recently: {summary.successfulMessages}</p>
            </button>
            <button
              type="button"
              onClick={() => office?.setWorkspace('settings', 'health')}
              className={`min-h-11 touch-manipulation rounded-2xl border p-5 text-left ${
                summary.automationProblems ? 'border-rose-500/30 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/10'
              }`}
            >
              <p className="text-xs font-black uppercase">Automatic work problems</p>
              <p className="mt-2 text-3xl font-black">{summary.automationProblems}</p>
              <p className="mt-1 text-xs">Working normally: {summary.automationHealthy}</p>
            </button>
          </section>

          <nav
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide touch-pan-x"
            aria-label="Office desk views"
          >
            {(
              [
                ['attention', 'Attention', '1. Work needing attention'],
                ['messages', 'Messages', '2. Messages and activity'],
                ['guide', 'Guide', '3. Simple daily guide'],
              ] as const
            ).map(([key, short, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`min-h-11 shrink-0 touch-manipulation rounded-xl px-3 py-2 text-sm font-black sm:px-4 ${
                  view === key ? 'bg-primary text-white' : 'border border-border bg-card'
                }`}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          {view === 'attention' && data ? (
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-black">Work needing a human</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Begin at the top. Opening an item keeps you inside Office Center and loads the full case.
                </p>
              </div>
              {data.attention.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-xl font-black text-emerald-600">All clear</p>
                  <p className="mt-2 text-sm text-muted-foreground">The automatic office can continue working. Check again later.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.attention.map((row) => (
                    <article key={row.id} className={`p-5 ${row.restricted ? 'bg-rose-500/5' : ''}`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-black">{row.reason}</span>
                            {row.restricted ? (
                              <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[11px] font-black text-rose-600">
                                Private: approved staff only
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 break-words text-lg font-black">{row.person}</h3>
                          <p className="break-words font-bold">Item: {row.item}</p>
                          <p className="mt-1 break-words text-sm text-muted-foreground">Staff owner: {row.owner}</p>
                          <p className="mt-2 break-words text-sm">
                            <span className="font-black">Do next:</span> {row.nextAction}
                          </p>
                          {row.dueAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">Due: {new Date(row.dueAt).toLocaleString()}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => openWork(row.caseId)}
                          className="min-h-11 w-full shrink-0 touch-manipulation rounded-xl bg-primary px-4 py-3 text-center text-sm font-black text-white lg:w-auto"
                        >
                          Open this work
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {view === 'messages' && data ? (
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-black">Messages and office activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Search by a person&apos;s name or the real item. Related links open inside Office Center when possible.
                </p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search a name or item"
                  className="mt-4 min-h-11 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                />
              </div>
              {visibleActivity.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">No matching activity was found.</p>
              ) : (
                <div className="divide-y divide-border">
                  {visibleActivity.map((row) => (
                    <article key={row.id} className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase text-primary">{row.kind}</p>
                          <h3 className="mt-1 break-words font-black">{row.person}</h3>
                          <p className="break-words font-bold">{row.item}</p>
                          <p className="mt-1 break-words text-sm text-muted-foreground">{row.summary}</p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p
                            className={`text-sm font-black ${
                              row.result.toLowerCase() === 'failed' ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {resultLabel(row.result)}
                          </p>
                          <p className="text-xs text-muted-foreground">{channelLabel(row.channel)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      {row.link ? (
                        <button
                          type="button"
                          onClick={() => openRelated(row.link)}
                          className="mt-3 inline-block min-h-11 touch-manipulation py-2 text-sm font-black text-primary"
                        >
                          Open the related item
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {view === 'guide' ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-black">Your five-minute morning check</h2>
                <ol className="mt-4 space-y-3 text-sm">
                  <li>
                    <b>1. Look at “You should check.”</b> If it is zero, no customer work is waiting.
                  </li>
                  <li>
                    <b>2. Assign work with no staff owner.</b> Tap the unassigned card — it opens Help Requests in this
                    same Office Center.
                  </li>
                  <li>
                    <b>3. Check failed messages.</b> The card opens Scheduled Work so you can retry without leaving.
                  </li>
                  <li>
                    <b>4. Check automatic work problems.</b> Green means leave it running.
                  </li>
                  <li>
                    <b>5. Review the daily activity.</b> Search a person&apos;s name when someone asks what happened.
                  </li>
                </ol>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-black">What the system does without you</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  <li>It sends approved reminders and service messages.</li>
                  <li>It records what was sent and whether it arrived.</li>
                  <li>It groups replies into one customer history.</li>
                  <li>It assigns ordinary work to available staff on duty.</li>
                  <li>It raises late, failed, private, or unusual work for a person.</li>
                  <li>It respects finance controls and marketing permission.</li>
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => office?.setWorkspace('settings', 'health')}
                    className="min-h-11 touch-manipulation rounded-xl border border-border px-3 py-2 text-sm font-black"
                  >
                    Scheduled Work
                  </button>
                  <button
                    type="button"
                    onClick={() => office?.setWorkspace('settings', 'automation')}
                    className="min-h-11 touch-manipulation rounded-xl border border-border px-3 py-2 text-sm font-black"
                  >
                    Automatic Work Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => office?.setWorkspace('duty')}
                    className="min-h-11 touch-manipulation rounded-xl border border-border px-3 py-2 text-sm font-black"
                  >
                    Staff on Duty
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
