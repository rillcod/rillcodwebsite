import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type MarkerRow = { id: string; marker: string | null };

function markerFromUnknown(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [assignmentsRes, decksRes] = await Promise.all([
    supabase.from('assignments').select('id, metadata'),
    supabase.from('flashcard_decks').select('id, progression_policy_snapshot'),
  ]);
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
  if (decksRes.error) return NextResponse.json({ error: decksRes.error.message }, { status: 500 });

  const assignmentMarkers: MarkerRow[] = (assignmentsRes.data ?? []).map((row: { id: string; metadata: unknown }) => ({
    id: row.id,
    marker:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? markerFromUnknown((row.metadata as Record<string, unknown>).marker)
        : null,
  }));
  const deckMarkers: MarkerRow[] = (decksRes.data ?? []).map((row: { id: string; progression_policy_snapshot: unknown }) => ({
    id: row.id,
    marker:
      row.progression_policy_snapshot &&
      typeof row.progression_policy_snapshot === 'object' &&
      !Array.isArray(row.progression_policy_snapshot)
        ? markerFromUnknown((row.progression_policy_snapshot as Record<string, unknown>).marker)
        : null,
  }));

  const assignmentMap = new Map<string, number>();
  const deckMap = new Map<string, number>();
  for (const row of assignmentMarkers) {
    if (!row.marker) continue;
    assignmentMap.set(row.marker, (assignmentMap.get(row.marker) ?? 0) + 1);
  }
  for (const row of deckMarkers) {
    if (!row.marker) continue;
    deckMap.set(row.marker, (deckMap.get(row.marker) ?? 0) + 1);
  }

  const assignmentDuplicates = Array.from(assignmentMap.entries())
    .filter(([, count]) => count > 1)
    .map(([marker, count]) => ({ marker, count }));
  const deckDuplicates = Array.from(deckMap.entries())
    .filter(([, count]) => count > 1)
    .map(([marker, count]) => ({ marker, count }));
  const sharedMarkers: { marker: string; assignments: number; decks: number }[] = [];
  for (const [marker, assignments] of assignmentMap.entries()) {
    const decks = deckMap.get(marker) ?? 0;
    if (decks > 0) sharedMarkers.push({ marker, assignments, decks });
  }

  return NextResponse.json({
    data: {
      summary: {
        assignments_total: assignmentMarkers.length,
        decks_total: deckMarkers.length,
        assignments_with_marker: assignmentMarkers.filter((r) => r.marker).length,
        decks_with_marker: deckMarkers.filter((r) => r.marker).length,
        assignment_duplicate_markers: assignmentDuplicates.length,
        deck_duplicate_markers: deckDuplicates.length,
        shared_markers_between_assignments_and_decks: sharedMarkers.length,
      },
      assignmentDuplicates,
      deckDuplicates,
      sharedMarkers: sharedMarkers.slice(0, 100),
    },
  });
}
