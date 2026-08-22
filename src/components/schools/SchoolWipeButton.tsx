'use client';

import { useCallback, useState } from 'react';
import { ExclamationTriangleIcon, TrashIcon, XMarkIcon } from '@/lib/icons';

type Counts = Record<string, number>;
type ProtectedEvidence = Record<string, number | string> & {
  policy: 'flexible' | 'standard' | 'strict';
  immutable_total: number;
  policy_total: number;
  total: number;
};

// Danger-zone control: totally and irreversibly remove a school and everything scoped to it.
// Flow: open → scan (preview counts) → type the school name → wipe. Admin-only surface.
export default function SchoolWipeButton({ school, onWiped }: { school: { id: string; name: string }; onWiped?: () => void }) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [protectedEvidence, setProtectedEvidence] = useState<ProtectedEvidence | null>(null);
  const [canPermanentlyDelete, setCanPermanentlyDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [error, setError] = useState('');

  const openDialog = useCallback(async () => {
    setOpen(true); setError(''); setCounts(null); setProtectedEvidence(null); setCanPermanentlyDelete(false); setConfirmText('');
    setScanning(true);
    try {
      const r = await fetch(`/api/schools/${school.id}/wipe`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Scan failed');
      setCounts(j.counts ?? {});
      setProtectedEvidence(j.protectedEvidence ?? null);
      setCanPermanentlyDelete(j.canPermanentlyDelete === true);
    } catch (e: any) { setError(e.message ?? 'Scan failed'); }
    finally { setScanning(false); }
  }, [school.id]);

  const wipe = useCallback(async () => {
    setWiping(true); setError('');
    try {
      const r = await fetch(`/api/schools/${school.id}/wipe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: confirmText }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Wipe failed');
      setOpen(false);
      onWiped?.();
      alert(`"${school.name}" and all its data were permanently removed.`);
    } catch (e: any) { setError(e.message ?? 'Wipe failed'); }
    finally { setWiping(false); }
  }, [school.id, school.name, confirmText, onWiped]);

  const nameMatches = confirmText.trim().toLowerCase() === school.name.trim().toLowerCase();
  const LABELS: Record<string, string> = {
    students: 'Students', staff: 'Teachers / school accounts', classes: 'Classes', cards: 'ID cards',
    reports: 'Progress reports', batches: 'Registration batches', sessions: 'Live sessions',
    recordings: 'Recordings', consentForms: 'Consent forms', leads: 'Form leads',
    invoices: 'Invoices', payments: 'Payment records',
  };
  const PROTECTED_LABELS: Record<string, string> = {
    assignment_scores: 'Graded assignments', cbt_attempts: 'CBT attempts', progress_reports: 'Progress reports',
    term_grades: 'Term grades', issued_invoices: 'Issued invoices', payment_transactions: 'Payment transactions',
    legacy_payments: 'Legacy payment records', receipts: 'Receipts', consent_responses: 'Consent responses',
  };
  const isProtected = (protectedEvidence?.total ?? 0) > 0;

  return (
    <>
      <button
        onClick={openDialog}
        title="Permanently delete this school and ALL its data"
        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-600/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 hover:bg-rose-600/20 transition-colors whitespace-nowrap"
      >
        <TrashIcon className="h-3.5 w-3.5" /> Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={() => !wiping && setOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-rose-500/30 bg-card p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15"><ExclamationTriangleIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" /></span>
                <div>
                  <h2 className="text-base font-black text-foreground">Permanent deletion review</h2>
                  <p className="text-[11px] text-muted-foreground">{school.name} · protected-record safety check</p>
                </div>
              </div>
              <button onClick={() => !wiping && setOpen(false)} className="text-muted-foreground hover:text-foreground"><XMarkIcon className="h-5 w-5" /></button>
            </div>

            {/* Scan preview */}
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">This will permanently erase</p>
              {scanning ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> Scanning…
                </div>
              ) : counts ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {Object.entries(counts).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{LABELS[k] ?? k}</span>
                      <span className={`font-black ${v > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>{v}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
              <p className="mt-3 text-[11px] text-rose-700/90 dark:text-rose-300/90">…plus every other record keyed to this school and all its cloud files. This cannot be undone.</p>
            </div>

            {isProtected && protectedEvidence ? (
              <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
                <p className="text-sm font-black text-foreground">Archive required — permanent deletion is locked</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This school has academic, finance, receipt, or consent evidence that must remain auditable. Deactivate or archive the school; its protected records and student scores will not be erased.
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {Object.entries(protectedEvidence)
                    .filter(([key, value]) => !['policy', 'total', 'immutable_total', 'policy_total'].includes(key) && typeof value === 'number' && value > 0)
                    .map(([key, value]) => (
                      <li key={key} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">{PROTECTED_LABELS[key] ?? key}</span>
                        <span className="font-black text-foreground">{value}</span>
                      </li>
                    ))}
                </ul>
                {protectedEvidence.immutable_total === 0 && protectedEvidence.policy_total > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Current policy: <span className="font-bold text-foreground capitalize">{protectedEvidence.policy}</span>. An administrator can choose Flexible under Settings → Platform Policy → Data Cleanup & Retention for test/setup records.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Type-to-confirm */}
            <div className={isProtected ? 'hidden' : undefined}>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Type the school name to confirm
              </label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={school.name}
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-rose-500 focus:outline-none"
              />
            </div>

            {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => !wiping && setOpen(false)} className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={wipe}
                disabled={!canPermanentlyDelete || !nameMatches || wiping || scanning}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProtected ? 'Protected records locked' : wiping ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
