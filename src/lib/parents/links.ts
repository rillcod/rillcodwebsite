import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type ParentLinkScope = {
  studentIds: string[];
  studentUserIds: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

// Returns true when a Supabase/PostgreSQL error is "relation does not exist"
// (code 42P01). We only want to silently skip that specific case — all other
// errors should surface so they are not hidden.
function isRelationMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  return e['code'] === '42P01' || String(e['message'] ?? '').includes('relation') && String(e['message'] ?? '').includes('does not exist');
}

export async function getParentLinkScope(
  admin: AnySupabase,
  parent: { id: string; email?: string | null },
): Promise<ParentLinkScope> {
  const normalizedEmail = parent.email?.trim().toLowerCase() || '';

  // ── Explicit junction table (primary path) ─────────────────────────────────
  let explicitStudentIds: string[] = [];
  const { data: linkData, error: linkErr } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parent.id);

  if (linkErr) {
    if (!isRelationMissing(linkErr)) throw linkErr;
    // Table not yet migrated — fall through to email-only path
  } else {
    const rows = (linkData ?? []) as unknown as Array<{ student_id: string }>;
    explicitStudentIds = unique(rows.map((row) => row.student_id));
  }

  let explicitRows: Array<{ id: string; user_id: string | null }> = [];
  if (explicitStudentIds.length > 0) {
    const { data, error } = await admin
      .from('students')
      .select('id, user_id')
      .in('id', explicitStudentIds);
    if (error) throw error;
    explicitRows = data ?? [];
  }

  // ── Email-based fallback (legacy denormalized path) ────────────────────────
  let legacyRows: Array<{ id: string; user_id: string | null }> = [];
  if (normalizedEmail) {
    const { data, error } = await admin
      .from('students')
      .select('id, user_id')
      .ilike('parent_email', normalizedEmail);
    if (error) throw error;
    legacyRows = data ?? [];
  }

  return {
    studentIds: unique([
      ...explicitStudentIds,
      ...explicitRows.map((row) => row.id),
      ...legacyRows.map((row) => row.id),
    ]),
    studentUserIds: unique([
      ...explicitRows.map((row) => row.user_id),
      ...legacyRows.map((row) => row.user_id),
    ]),
  };
}

export async function syncExplicitParentStudentLink(
  admin: AnySupabase,
  parentId: string,
  studentId: string,
): Promise<void> {
  const { error } = await admin
    .from('parent_student_links')
    .upsert(
      { parent_id: parentId, student_id: studentId, updated_at: new Date().toISOString() },
      { onConflict: 'parent_id,student_id' },
    );
  if (error) {
    if (isRelationMissing(error)) return; // table not migrated yet — no-op
    throw new Error(`Failed to sync parent-student link: ${error.message}`);
  }
}
