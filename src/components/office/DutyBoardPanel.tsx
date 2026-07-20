'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';

interface StaffRow {
  id: string;
  fullName: string;
  role: 'admin' | 'teacher';
  score: number;
  activeCases: number;
  maxActiveCases: number;
  isAvailable: boolean;
  isPrimaryDuty: boolean;
  isBackupDuty: boolean;
  teachesWithinMinutes?: number | null;
  reasons: string[];
}

interface DutyBoard {
  expectedActiveStaff: number;
  staffingDifference: number;
  totalEligible: number;
  available: number;
  atCapacity: number;
  primaryDuty: number;
  backupDuty: number;
  ranked: StaffRow[];
  selected: StaffRow | null;
  warnings: string[];
}

type Props = { embedded?: boolean };

export function DutyBoardPanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const revision = office?.revision ?? 0;
  const lastChange = office?.lastChange;
  const [board, setBoard] = useState<DutyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const notify = office?.notifyOfficeChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/operations-duty', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load duty board.');
      setBoard(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load duty board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastChange && !['duty', 'cases', 'desk'].includes(lastChange)) return;
    void load();
  }, [load, revision, lastChange]);

  async function updateAvailability(row: StaffRow) {
    setSaving(row.id);
    const response = await fetch('/api/admin/operations-duty', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: row.id, isAvailable: !row.isAvailable }),
    });
    const json = await response.json();
    if (!response.ok) setError(json.error || 'Unable to update availability.');
    else {
      await load();
      notify?.('duty');
    }
    setSaving('');
  }

  async function startDuty(row: StaffRow, isPrimary: boolean) {
    setSaving(row.id);
    const response = await fetch('/api/admin/operations-duty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: row.id, dutyKind: 'general_service', hours: 8, isPrimary }),
    });
    const json = await response.json();
    if (!response.ok) setError(json.error || 'Unable to start duty.');
    else {
      await load();
      notify?.('duty');
    }
    setSaving('');
  }

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl space-y-6 p-4 md:p-8'}>
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Operations control</p>
            <h1 className="mt-2 text-3xl font-black">Staff duty board</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Built for an eight-person active team, while always using the actual active staff found in the database.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Mark availability and choose primary or backup duty. The top available person receives the next routine case.
          </p>
          {office && (office.summary?.unassigned ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => office.setWorkspace('cases')}
              className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"
            >
              Assign {office.summary?.unassigned} unowned requests
            </button>
          ) : null}
        </div>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Loading current capacity...</p> : null}
      {error ? <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{error}</p> : null}
      {board ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Active staff" value={`${board.totalEligible}/${board.expectedActiveStaff}`} />
            <Metric label="Available now" value={board.available} />
            <Metric label="At capacity" value={board.atCapacity} />
            <Metric label="Current owner" value={board.selected?.fullName || 'Admin review'} />
          </div>

          {board.warnings.map((warning) => (
            <p key={warning} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {warning}
            </p>
          ))}

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="font-black">Ranked duty capacity</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The top person receives the next routine case. Complaints remain restricted to the effective admin.
              </p>
            </div>
            <div className="divide-y divide-border">
              {board.ranked.map((row, index) => (
                <div key={row.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-black">
                      {index + 1}. {row.fullName}{' '}
                      <span className="ml-2 text-xs font-bold uppercase text-muted-foreground">{row.role}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.activeCases}/{row.maxActiveCases} active cases
                      {row.teachesWithinMinutes != null ? ` — teaches in ${row.teachesWithinMinutes} min` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.reasons.join(' · ') || 'available by default'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving === row.id}
                      onClick={() => void updateAvailability(row)}
                      className="min-h-11 touch-manipulation rounded-lg bg-muted px-3 py-2 text-xs font-black"
                    >
                      {row.isAvailable ? 'Mark away' : 'Mark available'}
                    </button>
                    <button
                      type="button"
                      disabled={saving === row.id}
                      onClick={() => void startDuty(row, false)}
                      className="min-h-11 touch-manipulation rounded-lg border border-primary px-3 py-2 text-xs font-black text-primary"
                    >
                      Backup 8h
                    </button>
                    <button
                      type="button"
                      disabled={saving === row.id}
                      onClick={() => void startDuty(row, true)}
                      className="min-h-11 touch-manipulation rounded-lg bg-primary px-3 py-2 text-xs font-black text-white"
                    >
                      Primary 8h
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {office ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => office.setWorkspace('cases')}
                className="min-h-11 touch-manipulation rounded-xl border border-border px-4 py-2 text-sm font-bold"
              >
                Help Requests
              </button>
              <button
                type="button"
                onClick={() => office.setWorkspace('feedback')}
                className="min-h-11 touch-manipulation rounded-xl border border-border px-4 py-2 text-sm font-bold"
              >
                Feedback
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-2xl font-black">{value}</p>
    </div>
  );
}
