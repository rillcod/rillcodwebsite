import type { Person } from '@/lib/accountability/types';
import type { HollowAccount } from '@/lib/admin/platform-sanitation';

/** Engine version — bump when classification rules change. */
export const STUDENT_EXCEPTION_RULES_VERSION = '2026.07.29.2';

export type StudentExceptionKind =
  | 'displaced'
  | 'hollow_shell'
  | 'placeholder_noise'
  | 'withdrawn_active'
  | 'class_mismatch'
  | 'missing_parent_contact';

export type StudentExceptionRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  school_name: string | null;
  class_from_roster: string | null;
  class_on_profile: string | null;
  enrollment_type: string | null;
  is_active: boolean;
  reports_total: number;
  reports_published: number;
  reports_draft: number;
  has_parent_contact: boolean;
  has_parent_email: boolean;
  flags: string[];
  kinds: StudentExceptionKind[];
  reasons: string[];
  /** purge = hard delete test/noise only; review = human must confirm */
  recommended_action: 'purge' | 'assign_roster' | 'link_parent' | 'sync_class' | 'deactivate' | 'review';
  purge_eligible: boolean;
  created_hint?: string | null;
};

export type StudentExceptionQueues = {
  rules_version: string;
  generated_at: string;
  totals: Record<StudentExceptionKind, number>;
  queues: Record<StudentExceptionKind, StudentExceptionRow[]>;
  all: StudentExceptionRow[];
};

const PLACEHOLDER_EMAIL = /(test|dummy|fake|sample|example\.com|@test\.|no-?reply|placeholder)/i;
const PLACEHOLDER_NAME = /^(student|test|user|learner|child|n\/?a|none|-+)$/i;

function isWithdrawn(p: Person) {
  return (p.flags ?? []).includes('withdrawn')
    || String(p.enrollment_type || '').toLowerCase() === 'withdrawn'
    || ['withdrawn', 'ended', 'removed'].includes(String(p.roster_status || '').toLowerCase());
}

function hasRealReports(p: Person) {
  return (p.reports_total ?? 0) > 0 || (p.reports_published ?? 0) > 0 || (p.reports_draft ?? 0) > 0;
}

function looksLikePlaceholder(p: Person): string[] {
  const reasons: string[] = [];
  const name = (p.full_name || '').trim();
  const email = (p.email || '').trim();

  if (!name) reasons.push('No name on account');
  else if (PLACEHOLDER_NAME.test(name)) reasons.push('Generic placeholder name');

  if (!email) reasons.push('No login email');
  else if (PLACEHOLDER_EMAIL.test(email)) reasons.push('Placeholder or test email');

  if (!p.school_name) reasons.push('No school linked');

  return reasons;
}

/**
 * Classify census students into exception queues.
 * Displaced = active learner not on current-term roster (no_class).
 * Hollow = matched by platform sanitation engine (old, zero records).
 * Placeholder noise = obvious junk profile without waiting for age threshold.
 */
export function buildStudentExceptionQueues(
  people: Person[],
  hollowAccounts: HollowAccount[] = [],
): StudentExceptionQueues {
  const hollowById = new Map(hollowAccounts.map((h) => [h.id, h]));
  const students = people.filter((p) => (p.role || '').toLowerCase() === 'student');
  const rows: StudentExceptionRow[] = [];

  for (const p of students) {
    const kinds: StudentExceptionKind[] = [];
    const reasons: string[] = [];
    let recommended: StudentExceptionRow['recommended_action'] = 'review';
    let purgeEligible = false;

    const withdrawn = isWithdrawn(p);
    const displaced = !withdrawn && p.is_active && (p.flags ?? []).includes('no_class');
    const mismatch = !withdrawn && (p.flags ?? []).includes('class_mismatch');
    const missingParent = !withdrawn && p.is_active
      && !(p.has_parent_contact || p.has_parent_email)
      && ((p.flags ?? []).includes('no_parent_email') || (p.flags ?? []).includes('no_parent_phone'));

    const hollow = hollowById.get(p.id);
    if (hollow) {
      kinds.push('hollow_shell');
      reasons.push(hollow.reason);
      recommended = 'purge';
      purgeEligible = true;
    }

    const placeholderBits = looksLikePlaceholder(p);
    const noRealData = !hasRealReports(p)
      && !p.has_parent_contact
      && !p.has_parent_email
      && !(p.class_from_roster || p.class_on_profile);
    if (placeholderBits.length >= 2 && noRealData && !withdrawn) {
      kinds.push('placeholder_noise');
      reasons.push(...placeholderBits, 'No class, parent details, or reports');
      if (!purgeEligible) {
        recommended = 'purge';
        purgeEligible = true;
      }
    }

    if (displaced) {
      kinds.push('displaced');
      reasons.push('Still enrolled, but not put in a class for this term');
      if (recommended === 'review') recommended = 'assign_roster';
    }

    if (mismatch) {
      kinds.push('class_mismatch');
      reasons.push(
        `Their account says "${p.class_on_profile}" but this term’s class list has them in "${p.class_from_roster}"`,
      );
      if (recommended === 'review') recommended = 'sync_class';
    }

    if (missingParent && !kinds.includes('placeholder_noise')) {
      kinds.push('missing_parent_contact');
      reasons.push('No parent email or phone we can use to reach them');
      if (recommended === 'review') recommended = 'link_parent';
    }

    if (withdrawn && p.is_active) {
      kinds.push('withdrawn_active');
      reasons.push('Marked as left / ended, but their login is still on');
      if (recommended === 'review') recommended = 'deactivate';
    }

    if (kinds.length === 0) continue;

    // Never purge learners with real academic records — displaced with reports stay review-only.
    if (hasRealReports(p)) {
      purgeEligible = false;
      if (recommended === 'purge') recommended = 'review';
    }

    rows.push({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      school_name: p.school_name,
      class_from_roster: p.class_from_roster,
      class_on_profile: p.class_on_profile,
      enrollment_type: p.enrollment_type,
      is_active: p.is_active,
      reports_total: p.reports_total,
      reports_published: p.reports_published,
      reports_draft: p.reports_draft,
      has_parent_contact: p.has_parent_contact,
      has_parent_email: p.has_parent_email ?? false,
      flags: p.flags ?? [],
      kinds,
      reasons: [...new Set(reasons)],
      recommended_action: recommended,
      purge_eligible: purgeEligible,
      created_hint: hollow?.created_at ?? null,
    });
  }

  const emptyQueues = (): Record<StudentExceptionKind, StudentExceptionRow[]> => ({
    displaced: [],
    hollow_shell: [],
    placeholder_noise: [],
    withdrawn_active: [],
    class_mismatch: [],
    missing_parent_contact: [],
  });

  const queues = emptyQueues();
  for (const row of rows) {
    for (const kind of row.kinds) {
      queues[kind].push(row);
    }
  }

  for (const kind of Object.keys(queues) as StudentExceptionKind[]) {
    queues[kind].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }

  rows.sort((a, b) => {
    const purgeFirst = Number(b.purge_eligible) - Number(a.purge_eligible);
    if (purgeFirst !== 0) return purgeFirst;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const totals = Object.fromEntries(
    Object.entries(queues).map(([k, v]) => [k, v.length]),
  ) as Record<StudentExceptionKind, number>;

  return {
    rules_version: STUDENT_EXCEPTION_RULES_VERSION,
    generated_at: new Date().toISOString(),
    totals,
    queues,
    all: rows,
  };
}

/** Keep exception rows linked to a class name (roster or profile). */
export function filterExceptionQueuesByClassName(
  queues: StudentExceptionQueues,
  className: string,
): StudentExceptionQueues {
  const needle = className.trim().toLowerCase();
  if (!needle) return queues;

  const matches = (row: StudentExceptionRow) => {
    const roster = (row.class_from_roster || '').trim().toLowerCase();
    const profile = (row.class_on_profile || '').trim().toLowerCase();
    return roster === needle || profile === needle;
  };

  const filteredAll = queues.all.filter(matches);
  const emptyQueues = (): Record<StudentExceptionKind, StudentExceptionRow[]> => ({
    displaced: [],
    hollow_shell: [],
    placeholder_noise: [],
    withdrawn_active: [],
    class_mismatch: [],
    missing_parent_contact: [],
  });
  const nextQueues = emptyQueues();
  for (const row of filteredAll) {
    for (const kind of row.kinds) {
      nextQueues[kind].push(row);
    }
  }

  const totals = Object.fromEntries(
    Object.entries(nextQueues).map(([k, v]) => [k, v.length]),
  ) as Record<StudentExceptionKind, number>;

  return {
    ...queues,
    totals,
    queues: nextQueues,
    all: filteredAll,
  };
}
