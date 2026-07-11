import type { SupabaseClient } from '@supabase/supabase-js';
import { duplicateNameKey } from '@/lib/students/clean-name';

export type ExistingNameHit = {
  id: string;
  email: string;
  full_name: string;
};

export type NameLookupMaps = {
  byName: Map<string, ExistingNameHit>;
  byReversedName: Map<string, ExistingNameHit>;
  byKey: Map<string, ExistingNameHit>;
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
  }

  return { byName, byReversedName, byKey };
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
}

export type NameDuplicateKind = 'exact' | 'swap' | 'key';

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
  return null;
}

export function duplicateBlockMessage(kind: NameDuplicateKind, fullName: string, hit: ExistingNameHit): string {
  if (kind === 'swap') {
    return `Possible duplicate: "${fullName}" looks like "${hit.full_name}" with first and last name swapped (existing login: ${hit.email}). Duplicate names cannot be created through bulk registration.`;
  }
  return `Already registered at this school as "${hit.full_name}" (login: ${hit.email}). Duplicate names cannot be created through bulk registration.`;
}
