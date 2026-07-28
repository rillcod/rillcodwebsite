'use client';

import { useState } from 'react';
import { GradeBandPicker } from '@/components/classes/GradeBandPicker';
import type { BandGranularity } from '@/lib/classes/naming';

export function ClassRangeEditor({ classId, initialRange, canEdit }: {
  classId: string;
  initialRange?: string | null;
  canEdit: boolean;
}) {
  const [grade, setGrade] = useState(initialRange || '');
  const [granularity, setGranularity] = useState<BandGranularity>(grade.includes('-') ? 'fixed' : 'single');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!canEdit) return null;

  async function save() {
    if (!grade) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, band_granularity: granularity }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to update the class range.');
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message || 'Unable to update the class range.');
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <p className="text-sm font-black text-foreground">Class grade coverage</p>
          <p className="mb-2 text-xs text-muted-foreground">Change only the orderly grade/range. School and programme naming stay controlled.</p>
          <GradeBandPicker
            grade={grade}
            onChange={({ grade: next, granularity: mode }) => { setGrade(next); setGranularity(mode); }}
          />
        </div>
        <button type="button" disabled={busy || !grade} onClick={() => void save()} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
          {busy ? 'Saving…' : 'Update range'}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-red-400">{message}</p>}
    </div>
  );
}
