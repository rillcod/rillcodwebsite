/**
 * Platform sanitation — shared inspect / repair / purge for System Health.
 * Used by /api/admin/debris and /api/admin/sanitize.
 *
 * Hollow / placeholder purge targets only accounts that are:
 *   - very old (default 90+ days), AND
 *   - have no real records (no login, no class, no submissions, no reports,
 *     no cards, no attendance, no paid registration, no parent links with kids).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { wipePortalUserCascade, prepareRoleSpecificWipe, pruneRegistrationArchiveByEmails } from '@/lib/students/permanent-wipe';

export type HollowAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string | null;
  reason: string;
};

export type DebrisSnapshot = {
  orphaned_lessons: { count: number; items: any[] };
  orphaned_assignments: { count: number; items: any[] };
  deleted_accounts: { count: number; items: any[] };
  hollow_accounts: { count: number; items: HollowAccount[] };
  empty_classes: { count: number; items: any[] };
  disconnected_links: { count: number; items: any[] };
  stale_unpaid_students: { count: number; items: any[] };
  purgeable_count: number;
  total_items: number;
};

export type PurgeCounts = {
  orphaned_lessons: number;
  orphaned_assignments: number;
  deleted_accounts: number;
  hollow_accounts: number;
  disconnected_links: number;
  empty_classes: number;
  stale_unpaid_students: number;
};

export type RepairResult = {
  classAssigned: number;
  schoolNamesResynced: number;
};

const DEFAULT_HOLLOW_AGE_DAYS = 120;
/** Hard floor — never treat fresh registrations as hollow shells. */
const MIN_HOLLOW_AGE_DAYS = 60;
const STALE_UNPAID_DAYS = 14;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function resolveHollowAgeDays(requested?: number): number {
  const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_HOLLOW_AGE_DAYS;
  return Math.max(MIN_HOLLOW_AGE_DAYS, n);
}

async function collectOrphans(db: SupabaseClient) {
  const { data: plans } = await db.from('lesson_plans').select('id');
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  const { data: lessons } = await db
    .from('lessons')
    .select('id, title, metadata, created_at')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedLessons = (lessons ?? []).filter((l: any) => {
    const lpId = l.metadata?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  const { data: assignments } = await db
    .from('assignments')
    .select('id, title, metadata, created_at')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedAssignments = (assignments ?? []).filter((a: any) => {
    const lpId = a.metadata?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  return { orphanedLessons, orphanedAssignments };
}

async function collectDisconnectedLinks(db: SupabaseClient) {
  const { data: parentLinks } = await db.from('parent_student_links').select('id, parent_id, student_id');
  const { data: validUsers } = await db.from('portal_users').select('id');
  const validUserIds = new Set((validUsers ?? []).map((v: any) => v.id));

  const { data: studentRows } = await db.from('students').select('id, user_id');
  const validStudentKeys = new Set<string>();
  for (const s of studentRows ?? []) {
    if (s.id) validStudentKeys.add(s.id);
    if (s.user_id) validStudentKeys.add(s.user_id);
  }

  return (parentLinks ?? []).filter((link: any) => {
    const parentOk = validUserIds.has(link.parent_id);
    const studentOk = validStudentKeys.has(link.student_id) || validUserIds.has(link.student_id);
    return !parentOk || !studentOk;
  });
}

async function collectEmptyClasses(db: SupabaseClient) {
  const { data: allClasses } = await db.from('classes').select('id, name, school_id, created_at');
  const { data: userClasses } = await db
    .from('portal_users')
    .select('class_id')
    .eq('role', 'student')
    .eq('is_deleted', false)
    .not('class_id', 'is', null);
  const activeClassIds = new Set((userClasses ?? []).map((u: any) => u.class_id));
  return (allClasses ?? []).filter((c: any) => !activeClassIds.has(c.id));
}

async function collectStaleUnpaidStudents(db: SupabaseClient) {
  const cutoff = daysAgoIso(STALE_UNPAID_DAYS);
  const { data } = await db
    .from('students')
    .select('id, full_name, student_email, user_id, status, created_at')
    .eq('status', 'pending')
    .is('registration_payment_at', null)
    .lt('created_at', cutoff)
    .limit(500);
  return data ?? [];
}

/**
 * Very old portal accounts with zero real records — empty shells / placeholders.
 * Never touches admin / school / teacher roles.
 * Never touches fresh registrations (must be at least MIN_HOLLOW_AGE_DAYS old).
 */
export async function collectHollowAccounts(
  db: SupabaseClient,
  opts: { minAgeDays?: number } = {},
): Promise<HollowAccount[]> {
  const minAgeDays = resolveHollowAgeDays(opts.minAgeDays);
  const cutoff = daysAgoIso(minAgeDays);

  const { data: candidates } = await db
    .from('portal_users')
    .select('id, full_name, email, role, created_at, last_login, class_id, school_id, is_active, is_deleted, primary_teacher_id')
    .in('role', ['student', 'parent'])
    .eq('is_deleted', false)
    .is('last_login', null)
    .lt('created_at', cutoff)
    .limit(800);

  if (!candidates?.length) return [];

  // Students must also have no class placement to count as hollow.
  const pool = candidates.filter((u: any) => {
    if (u.role === 'student' && u.class_id) return false;
    return true;
  });
  if (!pool.length) return [];

  const ids = pool.map((u: any) => u.id as string);
  const withActivity = new Set<string>();

  const mark = (rows: any[] | null, key: string) => {
    for (const r of rows ?? []) {
      const v = r[key];
      if (v) withActivity.add(v);
    }
  };

  // Batch-check for any meaningful records
  const [
    submissions,
    reports,
    cards,
    attendance,
    cbt,
    parentLinksAsParent,
    parentLinksAsStudent,
    paidStudents,
    anyStudentsWithPayment,
    grades,
  ] = await Promise.all([
    db.from('assignment_submissions').select('user_id').in('user_id', ids).limit(2000),
    db.from('student_progress_reports').select('student_id').in('student_id', ids).limit(2000),
    db.from('identity_cards').select('holder_id').in('holder_id', ids).limit(2000),
    db.from('attendance').select('student_id').in('student_id', ids).limit(2000),
    db.from('cbt_sessions').select('student_id').in('student_id', ids).limit(2000),
    db.from('parent_student_links').select('parent_id').in('parent_id', ids).limit(2000),
    db.from('parent_student_links').select('student_id').in('student_id', ids).limit(2000),
    db.from('students').select('user_id').in('user_id', ids).not('registration_payment_at', 'is', null).limit(2000),
    db.from('students').select('user_id, id').in('user_id', ids).limit(2000),
    db.from('grades').select('student_id').in('student_id', ids).limit(2000).then(
      (r) => r,
      () => ({ data: null as any[] | null }), // grades table may not exist / name differs
    ),
  ]);

  mark(submissions.data, 'user_id');
  mark(reports.data, 'student_id');
  mark(cards.data, 'holder_id');
  mark(attendance.data, 'student_id');
  mark(cbt.data, 'student_id');
  mark(parentLinksAsParent.data, 'parent_id');
  mark(parentLinksAsStudent.data, 'student_id');
  mark(paidStudents.data, 'user_id');
  mark((grades as any)?.data, 'student_id');

  // Also mark students registry rows that have payment or approved status with school
  const studentRowIds = ((anyStudentsWithPayment.data ?? []) as any[]).map((s) => s.id).filter(Boolean);
  if (studentRowIds.length) {
    const { data: cardByStudent } = await db.from('identity_cards').select('holder_id').in('holder_id', studentRowIds).limit(2000);
    mark(cardByStudent, 'holder_id');
    // Map student row holder back to portal user
    for (const s of anyStudentsWithPayment.data ?? []) {
      if (s.user_id && cardByStudent?.some((c: any) => c.holder_id === s.id)) {
        withActivity.add(s.user_id);
      }
    }
  }

  // Invoices linked by student/customer id if table exists
  try {
    const { data: inv } = await db.from('invoices').select('student_id').in('student_id', ids).limit(500);
    mark(inv, 'student_id');
  } catch { /* optional */ }

  const hollow: HollowAccount[] = [];
  for (const u of pool) {
    if (withActivity.has(u.id)) continue;

    const ageDays = u.created_at
      ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / (24 * 60 * 60 * 1000))
      : minAgeDays;

    const bits: string[] = [];
    bits.push(`${ageDays}d old`);
    bits.push('never logged in');
    if (u.role === 'student' && !u.class_id) bits.push('no class');
    if (!u.school_id) bits.push('no school');
    if (u.is_active === false) bits.push('inactive');
    bits.push('no records');

    hollow.push({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
      reason: bits.join(' · '),
    });
  }

  return hollow;
}

export async function inspectDebris(
  db: SupabaseClient,
  opts: { minAgeDays?: number } = {},
): Promise<DebrisSnapshot> {
  const { orphanedLessons, orphanedAssignments } = await collectOrphans(db);

  const { data: deletedUsers } = await db
    .from('portal_users')
    .select('id, full_name, email, role, created_at')
    .eq('is_deleted', true);

  const [emptyClasses, disconnectedLinks, hollowAccounts, staleUnpaid] = await Promise.all([
    collectEmptyClasses(db),
    collectDisconnectedLinks(db),
    collectHollowAccounts(db, opts),
    collectStaleUnpaidStudents(db),
  ]);

  const deleted = deletedUsers ?? [];
  const purgeable =
    orphanedLessons.length +
    orphanedAssignments.length +
    deleted.length +
    disconnectedLinks.length +
    hollowAccounts.length +
    staleUnpaid.length;

  return {
    orphaned_lessons: { count: orphanedLessons.length, items: orphanedLessons },
    orphaned_assignments: { count: orphanedAssignments.length, items: orphanedAssignments },
    deleted_accounts: { count: deleted.length, items: deleted },
    hollow_accounts: { count: hollowAccounts.length, items: hollowAccounts },
    empty_classes: { count: emptyClasses.length, items: emptyClasses },
    disconnected_links: { count: disconnectedLinks.length, items: disconnectedLinks },
    stale_unpaid_students: { count: staleUnpaid.length, items: staleUnpaid },
    purgeable_count: purgeable,
    total_items: purgeable + emptyClasses.length,
  };
}

/** Safe roster repair: assign class when section_class matches a class name; resync school_name. */
export async function runSafeRepair(db: SupabaseClient): Promise<RepairResult> {
  const { data: allClasses } = await db.from('classes').select('id, name, school_id, teacher_id');
  const sectionToClass: Record<string, { id: string; teacher_id: string | null }> = {};
  (allClasses ?? []).forEach((c: any) => {
    if (c.school_id && c.name) {
      sectionToClass[`${c.school_id}::${c.name}`] = { id: c.id, teacher_id: c.teacher_id ?? null };
    }
  });

  const { data: noClassStudents } = await db
    .from('portal_users')
    .select('id, school_id, section_class')
    .eq('role', 'student')
    .is('class_id', null)
    .not('school_id', 'is', null)
    .not('section_class', 'is', null)
    .eq('is_deleted', false);

  let classAssigned = 0;
  for (const s of noClassStudents ?? []) {
    const match = sectionToClass[`${s.school_id}::${s.section_class}`];
    if (!match) continue;
    await db.from('portal_users').update({ class_id: match.id, primary_teacher_id: match.teacher_id }).eq('id', s.id);
    await db.from('students').update({ class_id: match.id, section_class: s.section_class }).eq('user_id', s.id);
    classAssigned++;
  }

  const { data: schools } = await db.from('schools').select('id, name');
  const realName = new Map((schools ?? []).map((s: any) => [s.id, s.name]));
  let schoolNamesResynced = 0;
  const { data: students } = await db
    .from('portal_users')
    .select('id, school_id, school_name')
    .eq('role', 'student')
    .eq('is_deleted', false)
    .not('school_id', 'is', null)
    .limit(2000);
  for (const r of students ?? []) {
    const want = realName.get(r.school_id);
    if (want && (r.school_name || '') !== want) {
      await db.from('portal_users').update({ school_name: want }).eq('id', r.id);
      await db.from('students').update({ school_name: want }).eq('user_id', r.id);
      schoolNamesResynced++;
    }
  }

  return { classAssigned, schoolNamesResynced };
}

async function wipeAccount(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: user } = await db
    .from('portal_users')
    .select('id, role, email, school_id')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return false;

  await prepareRoleSpecificWipe(db as any, user);
  const result = await wipePortalUserCascade(db as any, userId);
  if (result.ok && user.email) {
    await pruneRegistrationArchiveByEmails(db as any, [user.email]);
  }
  return result.ok;
}

export async function runPurge(
  db: SupabaseClient,
  opts: {
    purgeEmptyClasses?: boolean;
    purgeHollowAccounts?: boolean;
    dryRun?: boolean;
    minAgeDays?: number;
  } = {},
): Promise<{ dry_run: boolean; would_purge: PurgeCounts; purged: PurgeCounts }> {
  const purgeHollow = opts.purgeHollowAccounts !== false;
  const { orphanedLessons, orphanedAssignments } = await collectOrphans(db);
  const orphanedLessonIds = orphanedLessons.map((l) => l.id);
  const orphanedAssignmentIds = orphanedAssignments.map((a) => a.id);

  const { data: deletedUsers } = await db
    .from('portal_users')
    .select('id, email, role, school_id')
    .eq('is_deleted', true);
  const deletedUserIds = (deletedUsers ?? []).map((u: any) => u.id);

  const disconnectedLinks = await collectDisconnectedLinks(db);
  const disconnectedLinkIds = disconnectedLinks.map((l) => l.id);

  const hollowAccounts = purgeHollow ? await collectHollowAccounts(db, { minAgeDays: opts.minAgeDays }) : [];
  const hollowIds = hollowAccounts.map((h) => h.id);

  const staleUnpaid = await collectStaleUnpaidStudents(db);
  const staleUnpaidIds = staleUnpaid.map((s: any) => s.id);
  const stalePortalIds = staleUnpaid.map((s: any) => s.user_id).filter(Boolean) as string[];

  const emptyClasses = opts.purgeEmptyClasses ? await collectEmptyClasses(db) : [];
  const emptyClassIds = emptyClasses.map((c) => c.id);

  const would_purge: PurgeCounts = {
    orphaned_lessons: orphanedLessonIds.length,
    orphaned_assignments: orphanedAssignmentIds.length,
    deleted_accounts: deletedUserIds.length,
    hollow_accounts: hollowIds.length,
    disconnected_links: disconnectedLinkIds.length,
    empty_classes: emptyClassIds.length,
    stale_unpaid_students: staleUnpaidIds.length,
  };

  const zeroed: PurgeCounts = {
    orphaned_lessons: 0,
    orphaned_assignments: 0,
    deleted_accounts: 0,
    hollow_accounts: 0,
    disconnected_links: 0,
    empty_classes: 0,
    stale_unpaid_students: 0,
  };

  if (opts.dryRun) {
    return { dry_run: true, would_purge, purged: zeroed };
  }

  const purged: PurgeCounts = { ...zeroed };

  const chunk = async (ids: string[], fn: (batch: string[]) => Promise<void>) => {
    for (let i = 0; i < ids.length; i += 80) {
      await fn(ids.slice(i, i + 80));
    }
  };

  if (orphanedLessonIds.length) {
    await chunk(orphanedLessonIds, async (batch) => {
      const { error } = await db.from('lessons').delete().in('id', batch);
      if (!error) purged.orphaned_lessons += batch.length;
    });
  }
  if (orphanedAssignmentIds.length) {
    await chunk(orphanedAssignmentIds, async (batch) => {
      const { error } = await db.from('assignments').delete().in('id', batch);
      if (!error) purged.orphaned_assignments += batch.length;
    });
  }
  if (disconnectedLinkIds.length) {
    await chunk(disconnectedLinkIds, async (batch) => {
      const { error } = await db.from('parent_student_links').delete().in('id', batch);
      if (!error) purged.disconnected_links += batch.length;
    });
  }
  if (staleUnpaidIds.length) {
    await chunk(staleUnpaidIds, async (batch) => {
      const { error } = await db.from('students').delete().in('id', batch).eq('status', 'pending');
      if (!error) purged.stale_unpaid_students += batch.length;
    });
    for (const portalId of stalePortalIds) {
      await wipeAccount(db, portalId);
    }
  }
  // Soft-deleted + hollow shells — full cascade wipe
  const accountIds = [...new Set([...deletedUserIds, ...hollowIds])];
  for (const id of accountIds) {
    const ok = await wipeAccount(db, id);
    if (!ok) continue;
    if (deletedUserIds.includes(id)) purged.deleted_accounts += 1;
    if (hollowIds.includes(id)) purged.hollow_accounts += 1;
  }
  if (emptyClassIds.length) {
    await chunk(emptyClassIds, async (batch) => {
      const { error } = await db.from('classes').delete().in('id', batch);
      if (!error) purged.empty_classes += batch.length;
    });
  }

  return { dry_run: false, would_purge, purged };
}

export function sumCounts(c: PurgeCounts): number {
  return (
    c.orphaned_lessons +
    c.orphaned_assignments +
    c.deleted_accounts +
    c.hollow_accounts +
    c.disconnected_links +
    c.empty_classes +
    c.stale_unpaid_students
  );
}
