'use client';

import { useState } from 'react';

type Member = { id: string; full_name: string; email: string; class_id: string | null; reports: number; published: number };
type DupGroup = { kind: 'exact' | 'fuzzy'; school_name: string | null; suggestedSurvivorId: string; needsReview: boolean; members: Member[] };
type Cleanup = { id: string; from: string; to: string; school_name: string | null };
/** A child whose record holds only half a name. Optional so an older API still renders. */
type IncompleteName = {
  id: string;
  full_name: string | null;
  email: string | null;
  school_name: string | null;
  reports: number;
  published: number;
};

type ScanResult = {
  scanned: number;
  cleanups: Cleanup[];
  duplicates: DupGroup[];
  fuzzyDuplicates: DupGroup[];
  registryDesync: number;
  incompleteNames?: IncompleteName[];
};

async function heal(body: Record<string, unknown>) {
  const res = await fetch('/api/classes/heal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Action failed');
  return json;
}

/**
 * Self-serve "Student Name & Duplicate Health" panel — captures and treats the classes of
 * data damage that scripts/imports leave behind: dirty names, phantom registry rows, and
 * duplicate accounts (exact + spelling-variant), keeping the record-holder.
 */
export default function NameHealthPanel() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // survivor override per group index
  const [survivor, setSurvivor] = useState<Record<string, string>>({});

  const runScan = async () => {
    setBusy('scan'); setMsg(null);
    try { setScan(await heal({ action: 'scan_name_health' })); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const cleanNames = async () => {
    setBusy('clean'); setMsg(null);
    try {
      const r = await heal({ action: 'clean_student_names' });
      setMsg({ ok: true, text: `Cleaned ${r.cleaned} name(s).` });
      await runScan();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const resync = async () => {
    setBusy('resync'); setMsg(null);
    try {
      const r = await heal({ action: 'sync_registry' });
      setMsg({ ok: true, text: `Resynced ${r.resynced} phantom registry row(s).` });
      await runScan();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const merge = async (key: string, group: DupGroup, hard: boolean) => {
    const survivorId = survivor[key] || group.suggestedSurvivorId;
    const loserIds = group.members.filter((m) => m.id !== survivorId).map((m) => m.id);
    if (loserIds.length === 0) return;
    setBusy(key); setMsg(null);
    try {
      const r = await heal({ action: 'merge_duplicate_name', survivorId, loserIds, hard });
      setMsg({ ok: true, text: `Merged ${r.merged} account(s)${hard ? ' (hard-deleted)' : ''}${r.conflictingReports ? ` — ${r.conflictingReports} conflicting report(s) left for review` : ''}.` });
      await runScan();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  // Mark a flagged pair/group as NOT a duplicate (twins / different people) so it never
  // re-appears in future scans.
  const dismiss = async (key: string, group: DupGroup) => {
    setBusy(key); setMsg(null);
    try {
      const r = await heal({ action: 'dismiss_duplicate', ids: group.members.map((m) => m.id) });
      setMsg({ ok: true, text: `Marked as not a duplicate — won't be flagged again (${r.dismissed} pair${r.dismissed !== 1 ? 's' : ''}).` });
      await runScan();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  const allGroups: Array<[string, DupGroup]> = [
    ...(scan?.duplicates ?? []).map((g, i) => [`e${i}`, g] as [string, DupGroup]),
    ...(scan?.fuzzyDuplicates ?? []).map((g, i) => [`f${i}`, g] as [string, DupGroup]),
  ];

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-foreground">Student Name &amp; Duplicate Health</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clean script-damaged names, resync phantom registry rows, and merge duplicate accounts keeping the one with results.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={busy === 'scan'}
          className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {busy === 'scan' ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {msg && (
        <div className={`text-sm rounded-xl p-3 border ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'}`}>
          {msg.text}
        </div>
      )}

      {scan && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Scanned', value: scan.scanned },
              { label: 'Dirty names', value: scan.cleanups.length },
              { label: 'Duplicate groups', value: scan.duplicates.length + scan.fuzzyDuplicates.length },
              { label: 'Half names', value: scan.incompleteNames?.length ?? 0 },
              { label: 'Phantom rows', value: scan.registryDesync },
            ].map((t) => (
              <div key={t.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <p className="text-xl font-black text-foreground">{t.value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{t.label}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={cleanNames} disabled={busy !== null || scan.cleanups.length === 0}
              className="px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-bold rounded-lg disabled:opacity-40">
              {busy === 'clean' ? 'Cleaning…' : `Clean ${scan.cleanups.length} name(s)`}
            </button>
            <button onClick={resync} disabled={busy !== null || scan.registryDesync === 0}
              className="px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-bold rounded-lg disabled:opacity-40">
              {busy === 'resync' ? 'Resyncing…' : `Resync ${scan.registryDesync} phantom row(s)`}
            </button>
          </div>

          {/* Half names — reported, never auto-changed: only the school knows the rest. */}
          {(scan.incompleteNames?.length ?? 0) > 0 && (
            <details className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
              <summary className="text-xs font-bold text-amber-700 dark:text-amber-400 cursor-pointer">
                Missing a first name or surname ({scan.incompleteNames!.length}) — ask the school
              </summary>
              <p className="mt-2 text-[11px] text-muted-foreground">
                These are real children, most with report cards already. Only the school can supply
                the missing half, so nothing here is changed automatically.
              </p>
              <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {scan.incompleteNames!.map((s) => (
                  <li key={s.id} className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span className="font-bold text-foreground">{s.full_name || '(no name)'}</span>
                    <span>· {s.school_name || 'no school'}</span>
                    {s.reports > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-300">
                        · {s.reports} report{s.reports === 1 ? '' : 's'}
                      </span>
                    )}
                    <span className="opacity-60">· {s.email || 'no email'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Name cleanup preview */}
          {scan.cleanups.length > 0 && (
            <details className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
              <summary className="text-xs font-bold text-muted-foreground cursor-pointer">Preview name cleanups ({scan.cleanups.length})</summary>
              <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {scan.cleanups.map((c) => (
                  <li key={c.id} className="text-xs text-muted-foreground">
                    <span className="text-rose-700/70 dark:text-rose-300/70 line-through">{c.from}</span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="text-emerald-700 dark:text-emerald-300">{c.to}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Duplicate groups */}
          {allGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No duplicate accounts found. 🎉</p>
          ) : (
            <div className="space-y-3">
              {allGroups.map(([key, g]) => {
                const chosen = survivor[key] || g.suggestedSurvivorId;
                return (
                  <div key={key} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${g.kind === 'fuzzy' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-violet-500/20 text-violet-700 dark:text-violet-300'}`}>
                        {g.kind === 'fuzzy' ? 'Spelling variant' : 'Duplicate'}
                      </span>
                      {g.needsReview && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">Review</span>}
                      <span className="text-xs text-muted-foreground">{g.school_name}</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.members.map((m) => (
                        <label key={m.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${m.id === chosen ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}>
                          <input type="radio" name={`survivor-${key}`} checked={m.id === chosen}
                            onChange={() => setSurvivor((s) => ({ ...s, [key]: m.id }))} className="accent-emerald-500" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-foreground truncate">{m.full_name}
                              {m.id === chosen && <span className="ml-2 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Keep</span>}
                            </span>
                            <span className="block text-xs text-muted-foreground truncate">{m.email}</span>
                          </span>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">{m.published} pub / {m.reports} rep</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => merge(key, g, false)} disabled={busy !== null}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg disabled:opacity-40">
                        {busy === key ? 'Merging…' : 'Merge (keep records)'}
                      </button>
                      <button onClick={() => { if (confirm('Hard-delete the non-kept account(s) entirely? This cannot be undone.')) merge(key, g, true); }} disabled={busy !== null}
                        className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold rounded-lg disabled:opacity-40">
                        Merge &amp; hard-delete
                      </button>
                      <button onClick={() => { if (confirm('These are NOT the same person (twins / different children)? They will stay separate and won\'t be flagged again.')) dismiss(key, g); }} disabled={busy !== null}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-xs font-bold rounded-lg border border-white/10 disabled:opacity-40">
                        {busy === key ? '…' : 'Not a duplicate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
