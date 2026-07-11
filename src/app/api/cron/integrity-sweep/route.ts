/**
 * GET|POST /api/cron/integrity-sweep
 *
 * Self-healing data-integrity safety net. Runs on a schedule (same cron-secret
 * scheme as onboarding-sweep) and keeps the records tidy automatically:
 *
 *   1. Re-sync denormalised school_name → the school's REAL name (catches school
 *      renames and any stray "Rillcod Online School" stamping on local students),
 *      on both portal_users (students) and the students table.
 *   2. Purge orphaned registration credential rows whose login email no longer
 *      maps to a live account, and prune any batch left empty.
 *   3. Remove parent_student_links whose parent or student no longer exists.
 *
 * It also REPORTS (without changing) the records that need a human decision —
 * students with no school or no class — so they surface instead of silently
 * drifting. Everything here is idempotent and safe to run repeatedly.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { logAudit } from '@/lib/audit/log';
import { resolveStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
const norm = (e?: string | null) => (e || '').trim().toLowerCase();
async function fetchAll(admin: ReturnType<typeof adminClient>, table: string, cols: string, build?: (q: any) => any) {
  const out: any[] = []; let from = 0;
  for (;;) { let q: any = admin.from(table).select(cols); if (build) q = build(q); const { data, error } = await q.range(from, from + 999); if (error || !data) break; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = adminClient();
  const report = {
    schoolNameResynced: 0,
    credentialsPurged: 0,
    batchesPruned: 0,
    danglingLinksRemoved: 0,
    duplicateParentLinks: 0,
    legacyLinksBackfilled: 0,
    staleLeadStudentRefs: 0,
    staleConsentLinksPruned: 0,
    invalidApprovalsDowngraded: 0,
    parentMirrorsResynced: 0,
    ownershipConflicts: 0,
    throttleRowsPurged: 0,
    studentsNoSchool: 0,
    studentsNoClass: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Re-sync school_name to the real school name ──
    const schools = await fetchAll(admin, 'schools', 'id, name');
    const realName = new Map(schools.map((s: any) => [s.id, s.name]));
    for (const [table, build] of [
      ['portal_users', (q: any) => q.eq('role', 'student').neq('is_deleted', true).not('school_id', 'is', null)],
      ['students', (q: any) => q.not('school_id', 'is', null)],
    ] as const) {
      const rows = await fetchAll(admin, table, 'id, school_id, school_name', build);
      for (const r of rows) {
        const want = realName.get(r.school_id);
        if (want && (r.school_name || '') !== want) {
          const { error } = await admin.from(table).update({ school_name: want }).eq('id', r.id);
          if (error) report.errors.push(`${table} school_name ${r.id}: ${error.message}`); else report.schoolNameResynced++;
        }
      }
    }

    // ── 2. Purge orphaned registration credentials + prune empty batches ──
    const rr = await fetchAll(admin, 'registration_results', 'id, email, batch_id');
    const liveEmails = new Set((await fetchAll(admin, 'portal_users', 'email', (q: any) => q.neq('is_deleted', true))).map((u: any) => norm(u.email)).filter(Boolean));
    const orphanRows = rr.filter((r: any) => r.email && !liveEmails.has(norm(r.email)));
    const orphanIds = orphanRows.map((r: any) => r.id);
    for (let i = 0; i < orphanIds.length; i += 100) {
      const { error } = await admin.from('registration_results').delete().in('id', orphanIds.slice(i, i + 100));
      if (error) report.errors.push(`credential cleanup: ${error.message}`); else report.credentialsPurged += orphanIds.slice(i, i + 100).length;
    }
    for (const b of [...new Set(orphanRows.map((r: any) => r.batch_id).filter(Boolean))]) {
      const { count } = await admin.from('registration_results').select('id', { count: 'exact', head: true }).eq('batch_id', b);
      if ((count ?? 0) === 0) { await admin.from('registration_batches').delete().eq('id', b); report.batchesPruned++; }
      else await admin.from('registration_batches').update({ student_count: count }).eq('id', b);
    }

    // ── 3. Remove dangling parent_student_links ──
    const links = await fetchAll(admin, 'parent_student_links', 'parent_id, student_id');
    const parentIds = new Set((await fetchAll(admin, 'portal_users', 'id', (q: any) => q.eq('role', 'parent'))).map((p: any) => p.id));
    const studentRowIds = new Set((await fetchAll(admin, 'students', 'id')).map((s: any) => s.id));
    for (const l of links) {
      if (!parentIds.has(l.parent_id) || !studentRowIds.has(l.student_id)) {
        const { error } = await admin.from('parent_student_links').delete().eq('parent_id', l.parent_id).eq('student_id', l.student_id);
        if (!error) report.danglingLinksRemoved++;
      }
    }

    // Report impossible multi-parent conflicts. The database migration blocks
    // new ones; existing conflicts require a deliberate staff unlink decision.
    const parentCountByStudent = new Map<string, Set<string>>();
    for (const link of links) {
      const parents = parentCountByStudent.get(link.student_id) ?? new Set<string>();
      parents.add(link.parent_id);
      parentCountByStudent.set(link.student_id, parents);
    }
    report.duplicateParentLinks = [...parentCountByStudent.values()].filter((parents) => parents.size > 1).length;

    // Backfill the explicit junction for unambiguous legacy parent_email rows.
    const parentRows = await fetchAll(admin, 'portal_users', 'id, email', (q: any) => q.eq('role', 'parent').neq('is_deleted', true));
    const parentByEmail = new Map<string, string>(
      parentRows
        .map((parent: any) => [norm(parent.email), parent.id] as [string, string])
        .filter(([email]) => Boolean(email)),
    );
    const linkedStudentIds = new Set(links.map((link: any) => link.student_id));
    const legacyStudents = await fetchAll(admin, 'students', 'id, parent_email', (q: any) => q.not('parent_email', 'is', null));
    for (const student of legacyStudents) {
      if (linkedStudentIds.has(student.id)) continue;
      const parentId = parentByEmail.get(norm(student.parent_email));
      if (!parentId) continue;
      const { error } = await admin.from('parent_student_links').insert({ parent_id: parentId, student_id: student.id });
      if (!error) {
        linkedStudentIds.add(student.id);
        report.legacyLinksBackfilled++;
      } else if (error.code !== '23505') {
        report.errors.push(`legacy link ${student.id}: ${error.message}`);
      }
    }

    // Leads store portal student IDs. Count stale references rather than
    // silently changing consent provenance.
    const studentPortalIds = new Set((await fetchAll(admin, 'portal_users', 'id', (q: any) => q.eq('role', 'student').neq('is_deleted', true))).map((student: any) => student.id));
    const matchedLeads = await fetchAll(admin, 'form_leads', 'id, matched_student_id', (q: any) => q.not('matched_student_id', 'is', null));
    report.staleLeadStudentRefs = matchedLeads.filter((lead: any) => !studentPortalIds.has(lead.matched_student_id)).length;

    // ── 4. Reconcile canonical consent provenance and parent mirrors ──
    const consentLinks = await fetchAll(
      admin,
      'form_lead_child_links',
      'id, lead_id, student_portal_user_id, child_index',
    );
    for (const link of consentLinks) {
      if (studentPortalIds.has(link.student_portal_user_id)) continue;
      const { error } = await admin.from('form_lead_child_links').delete().eq('id', link.id);
      if (!error) {
        report.staleConsentLinksPruned++;
        await logAudit(admin as any, {
          action: 'integrity_consent_link_pruned',
          resourceType: 'form_lead',
          resourceId: link.lead_id,
          oldValues: { student_portal_user_id: link.student_portal_user_id, child_index: link.child_index },
        });
      }
    }

    const activeConsentLinks = consentLinks.filter((link: any) => studentPortalIds.has(link.student_portal_user_id));
    const childCountByLead = new Map<string, number>();
    for (const link of activeConsentLinks) {
      childCountByLead.set(link.lead_id, (childCountByLead.get(link.lead_id) ?? 0) + 1);
    }
    const approvedLeads = await fetchAll(
      admin,
      'form_leads',
      'id, matched_parent_id, match_status, email, response_data',
      (q: any) => q.in('match_status', ['approved', 'auto_matched', 'matched']),
    );
    for (const lead of approvedLeads) {
      if ((childCountByLead.get(lead.id) ?? 0) > 0) continue;
      const { error } = await admin.from('form_leads').update({
        match_status: 'pending_review',
        status: 'new',
      }).eq('id', lead.id);
      if (!error) {
        report.invalidApprovalsDowngraded++;
        await logAudit(admin as any, {
          action: 'integrity_consent_approval_downgraded',
          resourceType: 'form_lead',
          resourceId: lead.id,
        });
      }
    }

    const leadById = new Map(approvedLeads.map((lead: any) => [lead.id, lead]));
    for (const link of activeConsentLinks) {
      const lead = leadById.get(link.lead_id);
      if (!lead?.matched_parent_id) continue;
      const studentRowId = await resolveStudentRowId(admin as any, link.student_portal_user_id);
      if (!studentRowId) continue;
      const owner = links.find((item: any) => item.student_id === studentRowId);
      if (owner && owner.parent_id !== lead.matched_parent_id) {
        report.ownershipConflicts++;
        await admin.from('form_leads').update({
          match_status: 'pending_review',
          match_candidate_id: link.student_portal_user_id,
        }).eq('id', lead.id);
        await admin.from('form_lead_child_links').delete().eq('id', link.id);
        await logAudit(admin as any, {
          action: 'integrity_consent_ownership_conflict',
          resourceType: 'form_lead',
          resourceId: lead.id,
          newValues: { verified_parent_id: owner.parent_id, proposed_parent_id: lead.matched_parent_id },
        });
        continue;
      }
      const parent = parentRows.find((row: any) => row.id === lead.matched_parent_id);
      const rd = (lead.response_data ?? {}) as Record<string, unknown>;
      const submittedEmail = norm(String(rd.parent_email ?? lead.email ?? ''));
      if (!owner && (!submittedEmail || submittedEmail !== norm(parent?.email))) continue;
      try {
        await syncExplicitParentStudentLink(admin as any, lead.matched_parent_id, studentRowId);
        report.parentMirrorsResynced++;
      } catch (error: any) {
        report.errors.push(`consent ownership ${lead.id}: ${error.message}`);
      }
    }

    const { data: expiredThrottle, error: throttleError } = await admin
      .from('consent_submission_throttle')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    if (throttleError) report.errors.push(`throttle purge: ${throttleError.message}`);
    else report.throttleRowsPurged = expiredThrottle?.length ?? 0;

    // ── 5. Report (no change) students missing a school / class ──
    const { count: noSchool } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').neq('is_deleted', true).is('school_id', null);
    const { count: noClass } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').neq('is_deleted', true).is('class_id', null);
    report.studentsNoSchool = noSchool ?? 0;
    report.studentsNoClass = noClass ?? 0;
  } catch (e: any) {
    report.errors.push(e?.message ?? 'sweep error');
  }

  return NextResponse.json({ ok: true, ...report, ranAt: new Date().toISOString() });
}
