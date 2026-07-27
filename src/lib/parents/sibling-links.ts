import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getExistingParentLink,
  isParentLinkConflict,
  syncExplicitParentStudentLink,
} from '@/lib/parents/links';
// Tokeniser is shared with the self-service claim guard. The MATCHING rule is not:
// `looseNameMatch` is deliberately permissive because it only ever confirms a name the
// parent already typed for a child they hold the card for. Here we are searching a whole
// school roster with no such proof, so the same leniency produces false families
// ("Angela"/"Angel", "Victor"/"Victorious"). Hence the stricter local rule below.
import { normTokens as nameTokens } from '@/lib/parent-claim/name-match';

type AnySupabase = SupabaseClient<any>;

/**
 * Sibling reconciliation for STAFF-initiated parent onboarding.
 *
 * The self-service claim journey has always expanded a single scanned child into
 * the whole family (`autoLinkSiblings`). The staff/consent journey never did — it
 * linked exactly the one child named on the lead and stopped, so a parent onboarded
 * from a consent form silently ended up owning one child while their other children
 * stayed unlinked and their reports stayed gated behind "parent setup required".
 *
 * This is the same policy, factored so any staff path can apply it.
 *
 * Safety: a student is only ever linked when their OWN record already names this
 * parent's email or phone. A student already owned by a different parent is never
 * touched — it is reported back as `skipped` so staff can resolve it deliberately.
 * Contact matches at a different school are reported as `suggested` and NOT linked,
 * because a shared/recycled parent email across schools must stay a human decision.
 */

const STUDENT_COLS = 'id, user_id, full_name, school_id, school_name, parent_email, parent_phone';

export type SiblingCandidate = {
  studentRowId: string;
  portalUserId: string | null;
  fullName: string | null;
  schoolId: string | null;
  /**
   * `email` / `phone` — the student record itself names this parent. Strong enough
   * to link automatically.
   * `surname` — only the family name matches, within the same school. NEVER linked
   * automatically; surnames are not proof of a family.
   */
  matchedOn: 'email' | 'phone' | 'surname';
  /**
   * For surname matches: the exact name token that matched, so staff can see the
   * evidence. A shared family name and a shared given name look identical in a list
   * — showing the token is what makes the suggestion judgeable rather than a guess.
   */
  matchedToken?: string;
};

export type SiblingLinkResult = {
  parentId: string;
  /** Newly linked (empty when dryRun). */
  linked: SiblingCandidate[];
  /** Contact matches at the parent's school already owned by a different parent. */
  skipped: Array<SiblingCandidate & { reason: 'owned_by_other_parent' | 'link_failed'; detail?: string }>;
  /**
   * Needs a human decision, never linked automatically: contact matches at a
   * different school, and same-school surname matches (the only signal available
   * for the ~92% of students who carry no parent contact at all).
   */
  suggested: Array<SiblingCandidate & { reason: 'different_school' | 'surname_only' }>;
  /** Candidates that would be linked, when dryRun is true. */
  wouldLink: SiblingCandidate[];
};

function normEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Last 10 significant digits — tolerates +234 / 0803 / spacing variants. */
function normPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Titles carry no family information and must never drive a match. */
const NAME_NOISE = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'engr', 'prof', 'chief', 'pastor', 'rev',
  'alhaji', 'alhaja', 'barr', 'sir', 'lady', 'and', 'the',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Family-name match for roster search. Deliberately stricter than `looseNameMatch`:
 *   • tokens under 4 characters are ignored (too collision-prone)
 *   • an exact token match always counts
 *   • a one-character typo only counts when BOTH tokens are 7+ characters, which is
 *     what keeps "Ihueghian"/"Ihuaghian" while dropping "Angela"/"Angel" and
 *     "Hope"/"Tope"
 *   • no substring matching — that is what produced "Victor"/"Victorious"
 * Returns the matched token so staff can see the evidence and judge it themselves.
 */
function familyTokenMatch(studentName: string, parentName: string): string | null {
  const parentTokens = nameTokens(parentName).filter((t) => t.length >= 4 && !NAME_NOISE.has(t));
  const studentTokens = nameTokens(studentName).filter((t) => t.length >= 4 && !NAME_NOISE.has(t));
  for (const pt of parentTokens) {
    for (const st of studentTokens) {
      if (pt === st) return pt;
      if (pt.length >= 7 && st.length >= 7 && levenshtein(pt, st) <= 1) return pt;
    }
  }
  return null;
}

function emptyResult(parentId: string): SiblingLinkResult {
  return { parentId, linked: [], skipped: [], suggested: [], wouldLink: [] };
}

/**
 * Find every student whose record already names this parent, and link the ones
 * that are unowned and at the parent's school.
 */
export async function linkParentSiblings(
  admin: AnySupabase,
  opts: {
    parentId: string;
    /** Defaults to the parent's own school. */
    schoolId?: string | null;
    /** students.id values to leave alone (e.g. the child just linked). */
    excludeStudentRowIds?: string[];
    /**
     * Contacts just submitted by the parent that may not have been written onto
     * portal_users (e.g. `preserveExistingProfile` kept an older phone). Matched
     * in addition to the account's own email/phone, never instead of them.
     */
    alsoMatch?: { emails?: Array<string | null | undefined>; phones?: Array<string | null | undefined> };
    actorId?: string | null;
    source: string;
    dryRun?: boolean;
  },
): Promise<SiblingLinkResult> {
  const result = emptyResult(opts.parentId);
  if (!opts.parentId) return result;

  const { data: parent } = await admin
    .from('portal_users')
    .select('id, email, phone, full_name, role, school_id')
    .eq('id', opts.parentId)
    .maybeSingle();

  if (!parent?.id || parent.role !== 'parent') return result;

  const emails = [...new Set(
    [parent.email, ...(opts.alsoMatch?.emails ?? [])].map(normEmail).filter(Boolean),
  )];
  const rawPhones = [parent.phone, ...(opts.alsoMatch?.phones ?? [])].filter(Boolean) as string[];
  const phones = [...new Set(rawPhones.map(normPhone).filter(Boolean))];
  if (emails.length === 0 && phones.length === 0) return result;

  const schoolId = opts.schoolId ?? parent.school_id ?? null;
  const exclude = new Set(opts.excludeStudentRowIds ?? []);
  const byRowId = new Map<string, SiblingCandidate>();

  const collect = (rows: any[] | null | undefined, matchedOn: 'email' | 'phone') => {
    for (const row of rows ?? []) {
      if (!row?.id || exclude.has(row.id) || byRowId.has(row.id)) continue;
      byRowId.set(row.id, {
        studentRowId: row.id,
        portalUserId: row.user_id ?? null,
        fullName: row.full_name ?? null,
        schoolId: row.school_id ?? null,
        matchedOn,
      });
    }
  };

  // 1. Email match (case-insensitive, no wildcards = exact-but-ci).
  for (const email of emails) {
    const { data } = await admin
      .from('students').select(STUDENT_COLS)
      .ilike('parent_email', email)
      .neq('is_deleted', true);
    collect(data, 'email');
  }

  // 2. Exact phone match, as stored.
  for (const raw of rawPhones) {
    const { data } = await admin
      .from('students').select(STUDENT_COLS)
      .eq('parent_phone', raw)
      .neq('is_deleted', true);
    collect(data, 'phone');
  }

  // 3. Format-tolerant phone match, bounded to the parent's school. Catches
  //    "+2347041232094" vs "07041232094" vs "7041232094" on the same roster.
  if (phones.length > 0 && schoolId) {
    const { data } = await admin
      .from('students').select(STUDENT_COLS)
      .eq('school_id', schoolId)
      .neq('is_deleted', true)
      .limit(5000);
    collect(
      (data ?? []).filter((row: any) => phones.includes(normPhone(row.parent_phone))),
      'phone',
    );
  }

  // 4. Surname match within the parent's school.
  //
  //    This exists because contact matching alone is currently near-useless: the
  //    denormalised students.parent_* columns are written BY the link mirror, so a
  //    student who has never been linked has no contact on file and cannot be found
  //    by steps 1-3. The family name is then the only remaining signal — but it is
  //    weak (shared surnames are common), so these are only ever SUGGESTED.
  const surnameHits = new Map<string, SiblingCandidate>();
  if (schoolId && parent.full_name) {
    const { data } = await admin
      .from('students').select(STUDENT_COLS)
      .eq('school_id', schoolId)
      .neq('is_deleted', true)
      .limit(5000);
    for (const row of data ?? []) {
      if (!row?.id || exclude.has(row.id) || byRowId.has(row.id) || surnameHits.has(row.id)) continue;
      const token = familyTokenMatch(row.full_name ?? '', parent.full_name);
      if (!token) continue;
      surnameHits.set(row.id, {
        studentRowId: row.id,
        portalUserId: row.user_id ?? null,
        fullName: row.full_name ?? null,
        schoolId: row.school_id ?? null,
        matchedOn: 'surname',
        matchedToken: token,
      });
    }
  }

  if (byRowId.size === 0 && surnameHits.size === 0) return result;

  // Everything already owned by this parent is a no-op, not a finding.
  const { data: ownLinks } = await admin
    .from('parent_student_links').select('student_id').eq('parent_id', opts.parentId);
  const alreadyMine = new Set((ownLinks ?? []).map((l: any) => l.student_id));

  for (const candidate of surnameHits.values()) {
    if (alreadyMine.has(candidate.studentRowId)) continue;
    let owner: { parentId: string } | null = null;
    try {
      owner = await getExistingParentLink(admin, candidate.studentRowId);
    } catch {
      owner = null;
    }
    // Already belongs to a family — not a suggestion, not a problem.
    if (owner?.parentId) continue;
    result.suggested.push({ ...candidate, reason: 'surname_only' });
  }

  for (const candidate of byRowId.values()) {
    if (alreadyMine.has(candidate.studentRowId)) continue;

    // Cross-school contact matches are a staff decision, never automatic.
    if (schoolId && candidate.schoolId && candidate.schoolId !== schoolId) {
      result.suggested.push({ ...candidate, reason: 'different_school' });
      continue;
    }

    let owner: { parentId: string } | null = null;
    try {
      owner = await getExistingParentLink(admin, candidate.studentRowId);
    } catch {
      owner = null;
    }
    if (owner?.parentId && owner.parentId !== opts.parentId) {
      result.skipped.push({ ...candidate, reason: 'owned_by_other_parent' });
      continue;
    }

    if (opts.dryRun) {
      result.wouldLink.push(candidate);
      continue;
    }

    try {
      await syncExplicitParentStudentLink(admin, opts.parentId, candidate.studentRowId, {
        actorId: opts.actorId ?? null,
        source: opts.source,
      });
      result.linked.push(candidate);
    } catch (err) {
      if (isParentLinkConflict(err)) {
        result.skipped.push({ ...candidate, reason: 'owned_by_other_parent' });
        continue;
      }
      result.skipped.push({
        ...candidate,
        reason: 'link_failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/** Names only — for staff-facing confirmation copy. */
export function siblingNames(result: SiblingLinkResult): string[] {
  return result.linked.map((c) => c.fullName ?? 'Student').filter(Boolean);
}
