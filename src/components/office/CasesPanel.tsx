'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';

type CaseEvent = { id: string; channel: string; direction: string; subject?: string | null; body: string; created_at: string };
type Delivery = { id: string; channel: string; status: string; created_at: string };
type Staff = { id: string; full_name: string; role: string };
type CaseRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  requester_name?: string | null;
  channels: string[];
  next_action?: string | null;
  next_action_due_at?: string | null;
  restricted?: boolean;
  assigned_to?: string | null;
  assigned_name?: string | null;
  satisfaction_score?: number | null;
  updated_at: string;
  events?: CaseEvent[];
  delivery?: Delivery[];
  incident?: { incident_type: string; risk_level: string; status: string } | null;
};

const channelName = (value: string) =>
  ({ in_app: 'In the app', email: 'Email', whatsapp: 'WhatsApp', feedback: 'Feedback form', system: 'Office record' }[value] || value);
const directionName = (value: string) =>
  ({ inbound: 'Received', outbound: 'Sent', internal: 'Staff note' }[value] || value);
const stageName = (value: string) =>
  ({
    active: 'Active',
    all: 'All',
    open: 'Open',
    reopened: 'Needs help again',
    in_progress: 'Being handled',
    pending_customer: 'Waiting for customer',
    resolved: 'Solved',
    closed: 'Closed',
    queued: 'Waiting to send',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
    suppressed: 'Stopped by preference',
  }[value] || value.replace('_', ' '));

type Props = { embedded?: boolean; initialCaseId?: string | null };

export function CasesPanel({ embedded = false, initialCaseId = null }: Props) {
  const office = useOfficeOptional();
  const revision = office?.revision ?? 0;
  const lastChange = office?.lastChange;
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [filter, setFilter] = useState('active');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDue, setNextActionDue] = useState('');
  const [score, setScore] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/communication-cases', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || 'Unable to load requests.');
      return;
    }
    setRows(json.data || []);
    setRole(json.role || '');
    setStaff(json.staff || []);
  }

  async function openCase(id: string, syncUrl = true) {
    const response = await fetch(`/api/communication-cases?id=${id}`, { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || 'Unable to open this request.');
      return;
    }
    setSelected(json.data);
    setCanManage(Boolean(json.canManage));
    if (json.staff) setStaff(json.staff.filter((person: Staff) => !json.data.restricted || person.role === 'admin'));
    setNextAction(json.data.next_action || '');
    setNextActionDue(json.data.next_action_due_at ? new Date(json.data.next_action_due_at).toISOString().slice(0, 16) : '');
    if (syncUrl && office && office.caseId !== id) office.openCase(id);
  }

  useEffect(() => {
    if (lastChange && !['cases', 'duty', 'feedback', 'desk'].includes(lastChange)) return;
    void load();
  }, [revision, lastChange]);

  useEffect(() => {
    const id =
      initialCaseId ||
      (typeof window !== 'undefined' && !office ? new URLSearchParams(window.location.search).get('id') : null);
    if (id) void openCase(id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open when case id from shell changes
  }, [initialCaseId]);

  async function save(payload: Record<string, unknown>) {
    if (!selected) return;
    setError('');
    const response = await fetch('/api/communication-cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, ...payload }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || 'Unable to save.');
      return;
    }
    await load();
    await openCase(selected.id, false);
    office?.notifyOfficeChange('cases');
  }

  const visible = useMemo(
    () =>
      rows.filter((row) =>
        filter === 'all'
          ? true
          : filter === 'active'
            ? ['open', 'reopened', 'in_progress', 'pending_customer'].includes(row.status)
            : row.status === filter,
      ),
    [rows, filter],
  );

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-7xl space-y-6 p-4 md:p-8'}>
      {!embedded ? (
        <header>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Help requests</p>
          <h1 className="mt-2 text-3xl font-black">One place for every conversation</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Choose a person and item, read the complete history, choose the real staff owner, and follow the clearly marked
            next step.
          </p>
        </header>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Choose a person and item, assign the staff owner, and complete the next step.
          </p>
          {office?.duty ? (
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              Current duty owner:{' '}
              <span className="font-bold text-foreground">{office.duty.primaryName || 'Admin review'}</span>
              {office.summary && office.summary.unassigned > 0 ? (
                <>
                  {' '}
                  · {office.summary.unassigned} unassigned — assign them here so Desk stays clear.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
      <section className={embedded ? 'rounded-xl border border-blue-500/20 bg-blue-500/5 p-3' : 'rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4'}>
        {embedded ? (
          <details className="group">
            <summary className="cursor-pointer list-none font-bold text-sm [&::-webkit-details-marker]:hidden">
              Quick routine <span className="text-muted-foreground font-normal">— tap to expand</span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              Open Active → pick the oldest → assign a staff owner → complete the next step → update the stage.
            </p>
          </details>
        ) : (
          <>
            <p className="font-black">Simple daily routine</p>
            <p className="mt-1 text-sm text-muted-foreground">
              1. Open Active. 2. Choose the oldest request. 3. Choose a teacher or administrator. 4. Complete “What must happen
              next?” 5. Update the stage. Private requests stay with approved administrators.
            </p>
          </>
        )}
      </section>
      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {['active', 'open', 'reopened', 'in_progress', 'pending_customer', 'resolved', 'closed', 'all'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`min-h-11 shrink-0 touch-manipulation rounded-full px-3 py-2 text-xs font-black ${
              filter === value ? 'bg-primary text-white' : 'bg-muted'
            }`}
          >
            {stageName(value)}
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-3">
          {visible.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => void openCase(row.id)}
              className="block min-h-11 w-full touch-manipulation rounded-2xl border border-border bg-card p-5 text-left active:border-primary/50"
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase text-muted-foreground">
                    {(row.channels || []).map(channelName).join(' + ') || 'Office message'}
                  </p>
                  <h2 className="mt-2 font-black">
                    {row.requester_name || 'Customer'} — {row.subject}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Staff owner: {row.assigned_name || 'Not assigned yet'} | Updated {new Date(row.updated_at).toLocaleString()}
                  </p>
                  <p className="mt-3 text-xs font-bold text-primary">Do next: {row.next_action || 'Review and respond'}</p>
                </div>
                <span className="h-fit shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-black">{stageName(row.status)}</span>
              </div>
            </button>
          ))}
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nothing needs attention in this view.
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-primary">{selected.requester_name || 'Customer'}</p>
                  <h2 className="mt-2 text-2xl font-black">{selected.subject}</h2>
                  <p className="mt-2 text-xs font-bold text-muted-foreground">
                    Staff owner: {selected.assigned_name || 'Not assigned yet'}
                    {selected.restricted ? ' | Private — administrator only' : ''}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase">{selected.priority}</span>
              </div>
              {canManage ? (
                <>
                  {role === 'admin' ? (
                    <div>
                      <label className="text-xs font-black uppercase text-muted-foreground">Choose the real staff owner</label>
                      <select
                        value={selected.assigned_to || ''}
                        onChange={(event) => void save({ assignedTo: event.target.value })}
                        className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm"
                      >
                        <option value="">Not assigned yet</option>
                        {staff.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.full_name} — {person.role === 'teacher' ? 'Teacher' : 'Administrator'}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Give normal class and learning work to the responsible teacher. Keep private, finance, access, and
                        exception work with the administrator.
                      </p>
                      {!selected.assigned_to && office?.duty?.primaryId ? (
                        <button
                          type="button"
                          onClick={() => void save({ assignedTo: office.duty!.primaryId })}
                          className="mt-3 min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"
                        >
                          Assign to duty owner ({office.duty.primaryName || 'on duty'})
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-black uppercase text-muted-foreground">Choose the current stage</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['reopened', 'in_progress', 'pending_customer', 'resolved', 'closed'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void save({ status })}
                          className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black"
                        >
                          {stageName(status)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="font-black">What must happen next?</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Write one clear action so the next staff member knows exactly what to do.
                    </p>
                    <input
                      value={nextAction}
                      onChange={(event) => setNextAction(event.target.value)}
                      className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background p-3 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={nextActionDue}
                      onChange={(event) => setNextActionDue(event.target.value)}
                      className="mt-2 min-h-11 rounded-lg border border-border bg-background p-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void save({
                          nextAction: nextAction.trim(),
                          nextActionDueAt: nextActionDue ? new Date(nextActionDue).toISOString() : null,
                        })
                      }
                      className="mt-2 min-h-11 touch-manipulation rounded-lg bg-primary px-4 py-3 text-sm font-black text-white"
                    >
                      Save next step
                    </button>
                  </div>
                </>
              ) : null}
              {selected.incident ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
                  <p className="font-black">Administrator attention required</p>
                  <p className="mt-1">
                    This is private {selected.incident.risk_level}-risk work. Status: {stageName(selected.incident.status)}.
                  </p>
                </div>
              ) : null}
              {!canManage && ['resolved', 'closed'].includes(selected.status) ? (
                <div className="rounded-xl border border-border p-4">
                  <p className="font-black">Did this solve your need?</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setScore(value)}
                        className={`min-h-11 min-w-11 touch-manipulation rounded-lg border px-3 py-2 font-black ${
                          score === value ? 'bg-primary text-white' : ''
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                    placeholder="Tell us what helped or what is missing"
                    className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={!score}
                    onClick={() => void save({ satisfactionScore: score, outcome })}
                    className="mt-2 min-h-11 touch-manipulation rounded-lg bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                  >
                    Save my answer
                  </button>
                </div>
              ) : null}
              <div>
                <h3 className="font-black">Conversation history</h3>
                <div className="mt-3 space-y-3">
                  {(selected.events || []).map((event) => (
                    <div key={event.id} className="rounded-xl bg-muted/50 p-4">
                      <p className="text-[11px] font-black uppercase text-muted-foreground">
                        {channelName(event.channel)} | {directionName(event.direction)} |{' '}
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                      {event.subject ? <p className="mt-2 font-bold">{event.subject}</p> : null}
                      <p className="mt-2 whitespace-pre-wrap text-sm">{event.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              {selected.delivery?.length ? (
                <div>
                  <h3 className="font-black">Was it delivered?</h3>
                  <div className="mt-2 space-y-2">
                    {selected.delivery.map((item) => (
                      <p key={item.id} className="rounded-lg bg-muted p-3 text-xs">
                        {channelName(item.channel)} | {stageName(item.status)} | {new Date(item.created_at).toLocaleString()}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a person and item on the left. The full history and next step will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
