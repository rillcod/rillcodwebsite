'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon } from '@/lib/icons';
import { toast } from 'sonner';

type IntegrityResponse = {
  summary: {
    assignments_total: number;
    decks_total: number;
    assignments_with_marker: number;
    decks_with_marker: number;
    assignment_duplicate_markers: number;
    deck_duplicate_markers: number;
    shared_markers_between_assignments_and_decks: number;
  };
  assignmentDuplicates: Array<{ marker: string; count: number }>;
  deckDuplicates: Array<{ marker: string; count: number }>;
  sharedMarkers: Array<{ marker: string; assignments: number; decks: number }>;
};

export default function MarkerIntegrityPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntegrityResponse | null>(null);

  function exportCsv() {
    if (!data) return;
    const sections: string[] = [];
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

    sections.push('summary_key,summary_value');
    for (const [key, value] of Object.entries(data.summary)) {
      sections.push(`${escape(key)},${escape(value)}`);
    }

    sections.push('');
    sections.push('assignment_duplicate_marker,count');
    for (const row of data.assignmentDuplicates) {
      sections.push(`${escape(row.marker)},${escape(row.count)}`);
    }

    sections.push('');
    sections.push('deck_duplicate_marker,count');
    for (const row of data.deckDuplicates) {
      sections.push(`${escape(row.marker)},${escape(row.count)}`);
    }

    sections.push('');
    sections.push('shared_marker,assignments,decks');
    for (const row of data.sharedMarkers) {
      sections.push(`${escape(row.marker)},${escape(row.assignments)},${escape(row.decks)}`);
    }

    const blob = new Blob([sections.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marker-integrity-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/progression/marker-integrity');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData((json.data ?? null) as IntegrityResponse | null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load marker integrity');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  const s = data?.summary;
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">Marker Integrity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live health check for progression marker uniqueness and cross-content consistency.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Assignments</p><p className="text-lg font-black">{s?.assignments_total ?? 0}</p></div>
        <div className="bg-card border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Decks</p><p className="text-lg font-black">{s?.decks_total ?? 0}</p></div>
        <div className="bg-card border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Assignment marker duplicates</p><p className="text-lg font-black">{s?.assignment_duplicate_markers ?? 0}</p></div>
        <div className="bg-card border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Deck marker duplicates</p><p className="text-lg font-black">{s?.deck_duplicate_markers ?? 0}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-black mb-2">Assignment duplicate markers</h2>
          <div className="space-y-2">
            {(data?.assignmentDuplicates ?? []).map((row) => (
              <div key={row.marker} className="text-xs border border-border rounded p-2">
                <p className="font-mono break-all">{row.marker}</p>
                <p className="text-muted-foreground">Count: {row.count}</p>
              </div>
            ))}
            {(data?.assignmentDuplicates ?? []).length === 0 && <p className="text-xs text-emerald-300">No duplicates found.</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-black mb-2">Deck duplicate markers</h2>
          <div className="space-y-2">
            {(data?.deckDuplicates ?? []).map((row) => (
              <div key={row.marker} className="text-xs border border-border rounded p-2">
                <p className="font-mono break-all">{row.marker}</p>
                <p className="text-muted-foreground">Count: {row.count}</p>
              </div>
            ))}
            {(data?.deckDuplicates ?? []).length === 0 && <p className="text-xs text-emerald-300">No duplicates found.</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-black mb-2">Shared markers (assignment + deck)</h2>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {(data?.sharedMarkers ?? []).map((row) => (
              <div key={row.marker} className="text-xs border border-border rounded p-2">
                <p className="font-mono break-all">{row.marker}</p>
                <p className="text-muted-foreground">Assignments: {row.assignments} · Decks: {row.decks}</p>
              </div>
            ))}
            {(data?.sharedMarkers ?? []).length === 0 && <p className="text-xs text-muted-foreground">No shared markers found.</p>}
          </div>
        </div>
      </div>

      <details className="bg-card border border-border rounded-2xl p-4">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
          Advanced details
        </summary>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>Database sources: <code>assignments.metadata.marker</code>, <code>flashcard_decks.progression_policy_snapshot.marker</code></p>
          <p>API: <code>GET /api/progression/marker-integrity</code></p>
          <p>DB uniqueness guards: assignment and deck marker unique indexes.</p>
        </div>
      </details>
    </div>
  );
}
