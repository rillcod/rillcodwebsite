import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanStudentName, duplicateNameKey } from '@/lib/students/clean-name';

/**
 * True when one name's words are wholly contained in the other's, sharing at
 * least two — the same child written once with a middle name and once without
 * ("Ebenyi Excel Munachi" / "Excel Ebenyi").
 *
 * Deliberately EXACT token containment rather than the fuzzy
 * namesAreNearDuplicate. Fuzzy matching also reports "Ariella Smith" against
 * "Ariel Smith", and blocking a school from registering twins is a worse
 * failure than the duplicate this is meant to prevent. Containment cannot do
 * that: neither twin's words are a subset of the other's. Two shared words are
 * required, so siblings sharing only a surname stay separate.
 */
function nameTokenSet(s: string): Set<string> {
  return new Set(
    cleanStudentName(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).filter((t) => t.length > 1 && !/^\d+$/.test(t)),
  );
}

function nameIsSubsetDuplicate(a: string, b: string): boolean {
  const A = nameTokenSet(a);
  const B = nameTokenSet(b);
  if (A.size < 2 || B.size < 2) return false;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  for (const t of small) if (!large.has(t)) return false;
  return small.size >= 2;
}

// Sibling / twin confirmation is NOT handled here. The heal route already owns
// that end of the problem — scan_name_health finds related names, and
// dismiss_duplicate records "these are different children" in
// dismissed_duplicate_pairs so the pair stops being raised. Adding a second
// reviewer here would mean two engines disagreeing about the same two names.

export type ExistingNameHit = {
  id: string;
  email: string;
  full_name: string;
};

export type NameLookupMaps = {
  byName: Map<string, ExistingNameHit>;
  byReversedName: Map<string, ExistingNameHit>;
  byKey: Map<string, ExistingNameHit>;
  /**
   * Every candidate, for the near-duplicate scan.
   *
   * The three maps above are all keyed on the WHOLE name, so each requires the
   * two names to carry the same number of words. That misses the commonest real
   * shape: the same child entered once with a middle name and once without
   * ("Ebenyi Excel Munachi" / "Excel Ebenyi"). Ten of fifteen duplicates found
   * at Greenville and Franej were exactly that, created two days apart by two
   * imports, and every one passed the barricade in silence.
   */
  list: ExistingNameHit[];
};

const PAGE = 1000;

function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Active students only — treat null is_deleted as active. */
function activeStudentFilter<T extends { or: (filter: string) => T }>(query: T): T {
  return query.or('is_deleted.eq.false,is_deleted.is.null');
}

/**
 * Page through every active student at this school (by id and/or name).
 * Avoids the silent PostgREST ~1000-row cap that let same-name twins slip through.
 */
export async function loadSchoolStudentsForNameCheck(
  admin: SupabaseClient,
  schoolId: string | null,
  schoolName: string | null,
): Promise<Array<{ id: string; full_name: string; email: string }>> {
  const cols = 'id, full_name, email, school_id, school_name';
  const byId = new Map<string, { id: string; full_name: string; email: string }>();

  const fetchAll = async (apply: (q: any) => any) => {
    for (let from = 0; ; from += PAGE) {
      let q = admin.from('portal_users').select(cols).eq('role', 'student');
      q = activeStudentFilter(q);
      q = apply(q).range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        if (!row?.id || !row.full_name) continue;
        byId.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          email: row.email ?? '',
        });
      }
      if (rows.length < PAGE) break;
    }
  };

  if (schoolId) {
    await fetchAll((q) => q.eq('school_id', schoolId));
  }
  if (schoolName?.trim()) {
    const name = schoolName.trim();
    await fetchAll((q) => q.ilike('school_name', name));
  }

  return [...byId.values()];
}

/**
 * Prefer the DB RPC (uses the same key as the duplicate-name trigger). Falls back to
 * a paged portal_users scan when the RPC is not deployed yet.
 */
export async function findSchoolNameKeyConflicts(
  admin: SupabaseClient,
  schoolId: string | null,
  schoolName: string | null,
  nameKeys: string[],
): Promise<Map<string, ExistingNameHit>> {
  const keys = [...new Set(nameKeys.map((k) => k.trim()).filter(Boolean))];
  const out = new Map<string, ExistingNameHit>();
  if (!keys.length || (!schoolId && !schoolName?.trim())) return out;

  const { data, error } = await admin.rpc('find_school_student_name_conflicts', {
    p_school_id: schoolId,
    p_school_name: schoolName?.trim() || null,
    p_name_keys: keys,
  });

  if (!error && Array.isArray(data)) {
    for (const row of data as Array<{ id: string; full_name: string; email: string; name_key: string }>) {
      if (!row?.name_key || !row.id) continue;
      out.set(row.name_key, {
        id: row.id,
        email: row.email ?? '',
        full_name: row.full_name,
      });
    }
    return out;
  }

  // Fallback when migration not applied yet
  const students = await loadSchoolStudentsForNameCheck(admin, schoolId, schoolName);
  const keySet = new Set(keys);
  for (const s of students) {
    const key = duplicateNameKey(s.full_name);
    if (key && keySet.has(key) && !out.has(key)) {
      out.set(key, { id: s.id, email: s.email, full_name: s.full_name });
    }
  }
  return out;
}

export function buildNameLookupMaps(
  students: Array<{ id: string; full_name: string; email: string }>,
): NameLookupMaps {
  const byName = new Map<string, ExistingNameHit>();
  const byReversedName = new Map<string, ExistingNameHit>();
  const byKey = new Map<string, ExistingNameHit>();
  const list: ExistingNameHit[] = [];

  for (const s of students) {
    if (!s.full_name?.trim()) continue;
    const hit: ExistingNameHit = { id: s.id, email: s.email, full_name: s.full_name };
    const norm = normalizeDisplayName(s.full_name);
    byName.set(norm, hit);
    const parts = norm.split(/\s+/);
    if (parts.length >= 2) {
      byReversedName.set([...parts].reverse().join(' '), hit);
    }
    const key = duplicateNameKey(s.full_name);
    if (key) byKey.set(key, hit);
    list.push(hit);
  }

  return { byName, byReversedName, byKey, list };
}

export function registerCreatedNameInMaps(
  maps: NameLookupMaps,
  fullName: string,
  hit: ExistingNameHit,
): void {
  const norm = normalizeDisplayName(fullName);
  maps.byName.set(norm, hit);
  const parts = norm.split(/\s+/);
  if (parts.length >= 2) {
    maps.byReversedName.set([...parts].reverse().join(' '), hit);
  }
  const key = duplicateNameKey(fullName);
  if (key) maps.byKey.set(key, hit);
  // Also visible to the near-duplicate scan, so two variants of the same child
  // inside ONE batch collide with each other and not just with existing rows.
  maps.list = [...(maps.list ?? []), hit];
}

export type NameDuplicateKind = 'exact' | 'swap' | 'key' | 'near';

export function findNameDuplicate(
  maps: NameLookupMaps,
  fullName: string,
): { kind: NameDuplicateKind; hit: ExistingNameHit } | null {
  const norm = normalizeDisplayName(fullName);
  const exact = maps.byName.get(norm);
  if (exact) return { kind: 'exact', hit: exact };

  const swap = maps.byReversedName.get(norm);
  if (swap) return { kind: 'swap', hit: swap };

  const key = duplicateNameKey(fullName);
  if (key) {
    const keyHit = maps.byKey.get(key);
    if (keyHit) return { kind: 'key', hit: keyHit };
  }

  // Last, and only after the three O(1) lookups miss: the same child written
  // with a middle name added or dropped. namesAreNearDuplicate requires at
  // least two matching tokens, so siblings sharing only a surname are not
  // collapsed. Scoped to one school's roster, so the scan is bounded.
  for (const hit of maps.list ?? []) {
    if (nameIsSubsetDuplicate(fullName, hit.full_name)) {
      return { kind: 'near', hit };
    }
  }
  return null;
}

export function duplicateBlockMessage(kind: NameDuplicateKind, fullName: string, hit: ExistingNameHit): string {
  if (kind === 'swap') {
    return `Possible duplicate: "${fullName}" looks like "${hit.full_name}" with first and last name swapped (existing login: ${hit.email}). Duplicate names cannot be created through bulk registration.`;
  }
  if (kind === 'near') {
    return `Possible duplicate: "${fullName}" looks like the same learner as "${hit.full_name}" with a middle name added or dropped (existing login: ${hit.email}). If they are different children, add a distinguishing name; otherwise use the existing record.`;
  }
  return `Already registered at this school as "${hit.full_name}" (login: ${hit.email}). Duplicate names cannot be created through bulk registration.`;
}
