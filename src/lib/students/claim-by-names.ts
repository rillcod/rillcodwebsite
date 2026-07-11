import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanStudentName, duplicateNameKey } from '@/lib/students/clean-name';
import { loadSchoolStudentsForNameCheck } from '@/lib/students/duplicate-name-barricade';

export type ClaimNameStudent = {
  id: string;
  full_name: string;
  email: string;
  class_id: string | null;
};

export type ClaimNameMatch =
  | { input: string; status: 'claimable'; student: ClaimNameStudent }
  | { input: string; status: 'already_here'; student: ClaimNameStudent }
  | { input: string; status: 'ambiguous'; candidates: ClaimNameStudent[] }
  | { input: string; status: 'unmatched' };

function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Parse pasted lines into unique cleaned display names (order preserved). */
export function parsePastedStudentNames(raw: string | string[]): string[] {
  const lines = Array.isArray(raw) ? raw : String(raw ?? '').split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = cleanStudentName(line);
    if (!cleaned) continue;
    const key = normalizeDisplayName(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/**
 * Load school students including class_id so we can detect "already in destination".
 */
export async function loadSchoolStudentsForClaim(
  admin: SupabaseClient,
  schoolId: string | null,
  schoolName: string | null,
): Promise<ClaimNameStudent[]> {
  const base = await loadSchoolStudentsForNameCheck(admin, schoolId, schoolName);
  if (base.length === 0) return [];

  const ids = base.map((s) => s.id);
  const byId = new Map(base.map((s) => [s.id, { ...s, class_id: null as string | null }]));

  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('portal_users')
      .select('id, class_id')
      .in('id', slice);
    if (error) throw error;
    for (const row of data ?? []) {
      const hit = byId.get(row.id);
      if (hit) hit.class_id = row.class_id ?? null;
    }
  }

  return [...byId.values()];
}

function indexStudents(students: ClaimNameStudent[]) {
  const byNorm = new Map<string, ClaimNameStudent[]>();
  const byKey = new Map<string, ClaimNameStudent[]>();
  const byReversed = new Map<string, ClaimNameStudent[]>();

  const push = (map: Map<string, ClaimNameStudent[]>, key: string, s: ClaimNameStudent) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((x) => x.id === s.id)) list.push(s);
    map.set(key, list);
  };

  for (const s of students) {
    if (!s.full_name?.trim()) continue;
    const norm = normalizeDisplayName(s.full_name);
    push(byNorm, norm, s);
    const parts = norm.split(/\s+/);
    if (parts.length >= 2) push(byReversed, [...parts].reverse().join(' '), s);
    const key = duplicateNameKey(s.full_name);
    if (key) push(byKey, key, s);
  }

  return { byNorm, byKey, byReversed };
}

/**
 * Resolve pasted names against school students.
 * Ambiguous when 2+ distinct students share the same exact/key/swap match.
 */
export function matchPastedNamesToStudents(
  names: string[],
  students: ClaimNameStudent[],
  destinationClassId: string,
): ClaimNameMatch[] {
  const { byNorm, byKey, byReversed } = indexStudents(students);

  return names.map((input) => {
    const norm = normalizeDisplayName(input);
    const key = duplicateNameKey(input);

    let candidates: ClaimNameStudent[] = [];
    const exact = byNorm.get(norm) ?? [];
    if (exact.length) {
      candidates = exact;
    } else {
      const swap = byReversed.get(norm) ?? [];
      if (swap.length) candidates = swap;
      else if (key) candidates = byKey.get(key) ?? [];
    }

    if (candidates.length === 0) return { input, status: 'unmatched' as const };
    if (candidates.length > 1) return { input, status: 'ambiguous' as const, candidates };

    const student = candidates[0];
    if (student.class_id === destinationClassId) {
      return { input, status: 'already_here' as const, student };
    }
    return { input, status: 'claimable' as const, student };
  });
}
