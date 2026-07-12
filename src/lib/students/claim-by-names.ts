import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanStudentName, duplicateNameKey } from '@/lib/students/clean-name';

export type ClaimNameStudent = {
  id: string;
  full_name: string;
  email: string;
  class_id: string | null;
  /** Roster status on the destination class, if any. */
  dest_roster_status: string | null;
  is_active: boolean | null;
};

export type ClaimNameMatch =
  | { input: string; status: 'claimable'; student: ClaimNameStudent }
  | { input: string; status: 'already_here'; student: ClaimNameStudent }
  | { input: string; status: 'ambiguous'; candidates: ClaimNameStudent[] }
  | { input: string; status: 'unmatched' };

const PAGE = 1000;

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
 * Emergency claim pool: every non-deleted student at this school — including
 * inactive / withdrawn kids — so paste-claim can correct decentralised roster messes.
 */
export async function loadSchoolStudentsForClaim(
  admin: SupabaseClient,
  schoolId: string | null,
  schoolName: string | null,
  destinationClassId?: string | null,
): Promise<ClaimNameStudent[]> {
  const cols = 'id, full_name, email, school_id, school_name, class_id, is_active, is_deleted';
  const byId = new Map<string, ClaimNameStudent>();

  const fetchAll = async (apply: (q: any) => any) => {
    for (let from = 0; ; from += PAGE) {
      let q = admin
        .from('portal_users')
        .select(cols)
        .eq('role', 'student')
        // Include inactive / withdrawn accounts — only hard-deleted are excluded.
        .or('is_deleted.eq.false,is_deleted.is.null');
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
          class_id: row.class_id ?? null,
          dest_roster_status: null,
          is_active: row.is_active ?? null,
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

  // Also pull anyone with a withdrawn/paused roster on this destination class
  // (covers soft-withdraw where class_id still points here, or school_id drifted).
  if (destinationClassId) {
    try {
      const { data: destRosters } = await (admin as any)
        .from('class_term_rosters')
        .select('student_id, status')
        .eq('class_id', destinationClassId)
        .in('status', ['withdrawn', 'paused', 'completed']);
      const missingIds = (destRosters ?? [])
        .map((r: any) => r.student_id)
        .filter((id: string) => id && !byId.has(id));
      if (missingIds.length) {
        const CHUNK = 200;
        for (let i = 0; i < missingIds.length; i += CHUNK) {
          const slice = missingIds.slice(i, i + CHUNK);
          const { data } = await admin
            .from('portal_users')
            .select(cols)
            .in('id', slice)
            .eq('role', 'student')
            .or('is_deleted.eq.false,is_deleted.is.null');
          for (const row of data ?? []) {
            if (!row?.id || !row.full_name) continue;
            byId.set(row.id, {
              id: row.id,
              full_name: row.full_name,
              email: row.email ?? '',
              class_id: row.class_id ?? null,
              dest_roster_status: null,
              is_active: row.is_active ?? null,
            });
          }
        }
      }

      const statusByStudent = new Map<string, string>();
      for (const r of destRosters ?? []) {
        if (r?.student_id) statusByStudent.set(r.student_id, String(r.status ?? '').toLowerCase());
      }
      // Latest active/any status for everyone already in the pool on this class
      const poolIds = [...byId.keys()];
      const CHUNK = 200;
      for (let i = 0; i < poolIds.length; i += CHUNK) {
        const slice = poolIds.slice(i, i + CHUNK);
        const { data: rosterRows } = await (admin as any)
          .from('class_term_rosters')
          .select('student_id, status, updated_at')
          .eq('class_id', destinationClassId)
          .in('student_id', slice)
          .order('updated_at', { ascending: false });
        for (const r of rosterRows ?? []) {
          if (!r?.student_id || statusByStudent.has(r.student_id)) continue;
          statusByStudent.set(r.student_id, String(r.status ?? '').toLowerCase());
        }
      }
      for (const [id, status] of statusByStudent) {
        const hit = byId.get(id);
        if (hit) hit.dest_roster_status = status;
      }
    } catch (e) {
      console.warn('[claim-by-names] dest roster enrich failed', e);
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

/** True when the kid is already active on the destination class (nothing to claim). */
export function isActivelyOnDestination(student: ClaimNameStudent, destinationClassId: string): boolean {
  if (student.class_id !== destinationClassId) return false;
  const status = (student.dest_roster_status ?? 'active').toLowerCase();
  // Soft-withdraw keeps class_id — those must be claimable so we can reactivate.
  if (status && status !== 'active') return false;
  // Inactive portal accounts still need a full claim reactivation.
  if (student.is_active === false) return false;
  return true;
}

/**
 * Resolve pasted names against school students (including withdrawn / inactive).
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
    if (isActivelyOnDestination(student, destinationClassId)) {
      return { input, status: 'already_here' as const, student };
    }
    return { input, status: 'claimable' as const, student };
  });
}
