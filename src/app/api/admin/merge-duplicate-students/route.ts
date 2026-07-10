/**
 * POST /api/admin/merge-duplicate-students   (admin only)
 *
 * Cleans up duplicate `students` rows for the same child (same parent email +
 * name) that cause a child to appear twice on the parent dashboard. For each
 * duplicate group it:
 *   1. Picks a canonical row (prefers one with a portal account, then oldest).
 *   2. Repoints valuable references (submissions, attendance, grades, progress,
 *      enrolments, payments, parent links) from the duplicates onto the canonical.
 *   3. Deactivates any extra duplicate login accounts.
 *   4. Hard-deletes the duplicate student rows (their links cascade away).
 *
 * Body: { dryRun?: boolean }. Idempotent and safe to re-run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Tables whose student_id FK references students.id (no unique constraint on it),
// so a plain repoint update is safe.
const REPOINT_TABLES = [
  'assignment_submissions',
  'attendance',
  'grade_reports',
  'student_progress',
  'student_enrollments',
  'payments',
];

interface StudentRow {
  id: string;
  user_id: string | null;
  full_name: string | null;
  parent_email: string | null;
  created_at: string | null;
}

type ReportStats = { total: number; published: number; drafts: number; thirdTerm: number };
const EMPTY_REPORT_STATS: ReportStats = { total: 0, published: 0, drafts: 0, thirdTerm: 0 };

function groupKey(s: StudentRow): string | null {
  const email = (s.parent_email || '').trim().toLowerCase();
  const name = (s.full_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!email || !name) return null;
  return `${email}|${name}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { dryRun = false } = await req.json().catch(() => ({}));

    // Pull non-deleted students that have a parent email (the dedupe key).
    const { data: rows } = await admin
      .from('students')
      .select('id, user_id, full_name, parent_email, created_at')
      .not('parent_email', 'is', null)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(5000);

    // Reports are keyed to portal_users.id, not students.id. Score every candidate
    // before selecting a survivor so even one Third Term draft/published report wins.
    const portalIds = ((rows ?? []) as StudentRow[]).map((row) => row.user_id).filter(Boolean) as string[];
    const reportStats = new Map<string, ReportStats>();
    for (let i = 0; i < portalIds.length; i += 500) {
      const { data: reports, error: reportsError } = await admin
        .from('student_progress_reports')
        .select('student_id, is_published, report_term, report_period')
        .in('student_id', portalIds.slice(i, i + 500));
      if (reportsError) throw reportsError;
      for (const row of reports ?? []) {
        if (!row.student_id) continue;
        const stats = reportStats.get(row.student_id) ?? { ...EMPTY_REPORT_STATS };
        stats.total += 1;
        if (row.is_published) stats.published += 1; else stats.drafts += 1;
        if (`${row.report_term ?? ''} ${row.report_period ?? ''}`.toLowerCase().includes('third')) stats.thirdTerm += 1;
        reportStats.set(row.student_id, stats);
      }
    }
    const statsFor = (student: StudentRow): ReportStats =>
      student.user_id ? (reportStats.get(student.user_id) ?? EMPTY_REPORT_STATS) : EMPTY_REPORT_STATS;
    // Group by parent email + normalized name.
    const groups = new Map<string, StudentRow[]>();
    for (const s of (rows ?? []) as StudentRow[]) {
      const key = groupKey(s);
      if (!key) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }

    const report = {
      dryRun,
      duplicateGroups: 0,
      duplicateRows: 0,
      merged: 0,
      loginsDeactivated: 0,
      details: [] as Array<{ child: string; kept: string; keptReports: ReportStats; removed: Array<{ id: string; reports: ReportStats }>; reason: string }>,
    };

    for (const [, members] of groups) {
      if (members.length < 2) continue;
      report.duplicateGroups++;
      report.duplicateRows += members.length - 1;

      // Canonical priority: any published or draft report wins (one Third Term is enough),
      // then published count, total reports, Third Term evidence, portal login, oldest.
      const sorted = [...members].sort((a, b) => {
        const ar = statsFor(a), br = statsFor(b);
        const comparisons = [
          Number(br.total > 0) - Number(ar.total > 0),
          br.published - ar.published,
          br.total - ar.total,
          br.thirdTerm - ar.thirdTerm,
          Number(!!b.user_id) - Number(!!a.user_id),
        ];
        for (const comparison of comparisons) if (comparison !== 0) return comparison;
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      });
      const canonical = sorted[0];
      const dups = sorted.slice(1);

      report.details.push({
        child: `${canonical.full_name} <${canonical.parent_email}>`,
        kept: canonical.id,
        keptReports: statsFor(canonical),
        removed: dups.map((d) => ({ id: d.id, reports: statsFor(d) })),
        reason: statsFor(canonical).total > 0
          ? 'Kept report-bearing account (published and draft reports protected; Third Term alone qualifies).'
          : canonical.user_id
            ? 'No reports found; kept portal-linked account.'
            : 'No reports or portal accounts found; kept oldest record.',
      });

      if (dryRun) continue;

      for (const d of dups) {
        // 1. Move parent links onto the canonical (idempotent), then they cascade
        //    away when the duplicate row is deleted.
        try {
          const { data: links } = await admin.from('parent_student_links').select('parent_id').eq('student_id', d.id);
          for (const l of (links ?? []) as Array<{ parent_id: string }>) {
            await admin.from('parent_student_links').upsert(
              { parent_id: l.parent_id, student_id: canonical.id, updated_at: new Date().toISOString() },
              { onConflict: 'parent_id,student_id' },
            );
          }
        } catch (e) { console.error('[merge-students] link move failed:', e); }

        // 2. Repoint valuable references onto the canonical.
        for (const table of REPOINT_TABLES) {
          try { await admin.from(table).update({ student_id: canonical.id }).eq('student_id', d.id); } catch { /* table/col may differ — skip */ }
        }

        // 3. Deactivate a duplicate login (a different portal account for the same child).
        if (d.user_id && d.user_id !== canonical.user_id) {
          try {
            await admin.from('portal_users').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', d.user_id);
            report.loginsDeactivated++;
          } catch { /* non-fatal */ }
        }

        // 4. Hard-delete the duplicate student row (its links cascade away).
        try {
          await admin.from('students').delete().eq('id', d.id);
          report.merged++;
        } catch (e) {
          console.error('[merge-students] delete dup failed, soft-deleting instead:', e);
          try { await admin.from('students').update({ is_deleted: true, is_active: false }).eq('id', d.id); } catch { /* */ }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun ? 'Dry run — no changes written.' : 'Duplicate students merged.',
      ...report,
    });
  } catch (err: any) {
    console.error('[merge-duplicate-students]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
