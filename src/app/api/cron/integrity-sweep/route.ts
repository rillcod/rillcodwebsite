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
 *   2b. Purge stale unpaid registration attempts (term students + summer prospects)
 *       older than 14 days with no completed payment, plus their pending gateway txs.
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
import {
  isParentLinkConflict,
  resolveStudentRowId,
  syncExplicitParentStudentLink,
  unlinkExplicitParentStudentLink,
} from '@/lib/parents/links';

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
    staleUnpaidStudentsPurged: 0,
    staleUnpaidProspectsPurged: 0,
    stalePendingTxPurged: 0,
    danglingLinksRemoved: 0,
    duplicateParentLinks: 0,
    legacyLinksBackfilled: 0,
    staleLeadStudentRefs: 0,
    staleConsentLinksPruned: 0,
    invalidApprovalsDowngraded: 0,
    academicTermsSynced: false,
    parentMirrorsResynced: 0,
    ownershipConflicts: 0,
    throttleRowsPurged: 0,
    gradesRepaired: 0,
    sectionsSyncedFromClass: 0,
    studentsNoSchool: 0,
    studentsNoClass: 0,
    errors: [] as string[],
  };

  try {
    // Keep is_current aligned with calendar live year+term (not only when settings open).
    const { error: termSyncErr } = await admin.rpc('sync_academic_terms_is_current');
    if (termSyncErr) report.errors.push(`academic_terms sync: ${termSyncErr.message}`);
    else report.academicTermsSynced = true;

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

    // ── 2b. Purge stale unpaid registration attempts (14+ days, never paid) ──
    const staleBefore = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleStudents } = await admin
      .from('students')
      .select('id, full_name, parent_name, parent_email, parent_phone, grade_level, section_class, course_interest, school_name, enrollment_type, preferred_schedule')
      .eq('status', 'pending')
      .is('registration_payment_at', null)
      .lt('created_at', staleBefore)
      .limit(200);
    const staleStudentIds = (staleStudents ?? []).map((s: any) => s.id).filter(Boolean);
    for (const s of staleStudents ?? []) {
      try {
        const { syncDroppedPayerFromStudent } = await import('@/lib/crm/sync-dropped-payer');
        await syncDroppedPayerFromStudent(admin, s as Record<string, unknown>);
      } catch { /* preserve contact even when purging stale row */ }
    }
    for (const id of staleStudentIds) {
      const { data: txs } = await admin
        .from('payment_transactions')
        .select('id')
        .eq('payment_status', 'pending')
        .or(`payment_gateway_response->>student_id.eq.${id},payment_gateway_response->>registration_id.eq.${id}`);
      for (const tx of txs ?? []) {
        const { error } = await admin.from('payment_transactions').delete().eq('id', tx.id).eq('payment_status', 'pending');
        if (!error) report.stalePendingTxPurged++;
      }
    }
    if (staleStudentIds.length) {
      const { error } = await admin.from('students').delete().in('id', staleStudentIds).eq('status', 'pending');
      if (error) report.errors.push(`stale students: ${error.message}`);
      else report.staleUnpaidStudentsPurged += staleStudentIds.length;
    }

    const { data: staleProspects } = await admin
      .from('prospective_students')
      .select('id, full_name, parent_name, parent_email, parent_phone, grade, school_name, course_interest, preferred_schedule, status, notes, age, gender, email')
      .in('status', ['unpaid', 'pending_verification'])
      .lt('created_at', staleBefore)
      .limit(200);
    const staleProspectIds = (staleProspects ?? []).map((p: any) => p.id).filter(Boolean);
    for (const p of staleProspects ?? []) {
      try {
        const { syncDroppedPayerFromProspect } = await import('@/lib/crm/sync-dropped-payer');
        await syncDroppedPayerFromProspect(admin, p as Record<string, unknown>);
      } catch { /* preserve contact even when purging stale row */ }
    }
    for (const id of staleProspectIds) {
      const { data: txs } = await admin
        .from('payment_transactions')
        .select('id')
        .eq('payment_status', 'pending')
        .contains('payment_gateway_response', { prospect_id: id });
      for (const tx of txs ?? []) {
        const { error } = await admin.from('payment_transactions').delete().eq('id', tx.id).eq('payment_status', 'pending');
        if (!error) report.stalePendingTxPurged++;
      }
    }
    if (staleProspectIds.length) {
      const { error } = await admin
        .from('prospective_students')
        .delete()
        .in('id', staleProspectIds)
        .in('status', ['unpaid', 'pending_verification']);
      if (error) report.errors.push(`stale prospects: ${error.message}`);
      else report.staleUnpaidProspectsPurged += staleProspectIds.length;
    }

    // ── 3. Remove dangling parent_student_links ──
    const links = await fetchAll(admin, 'parent_student_links', 'parent_id, student_id');
    const parentIds = new Set((await fetchAll(admin, 'portal_users', 'id', (q: any) => q.eq('role', 'parent'))).map((p: any) => p.id));
    const studentRowIds = new Set((await fetchAll(admin, 'students', 'id')).map((s: any) => s.id));
    for (const l of links) {
      if (!parentIds.has(l.parent_id) || !studentRowIds.has(l.student_id)) {
        try {
          // Kernel teardown also clears the stale denormalised parent_* columns
          // on the surviving student, so a deleted parent stops showing as the
          // contact on their child's record.
          await unlinkExplicitParentStudentLink(admin as any, l.parent_id, l.student_id, {
            source: 'integrity-sweep.danglingLink',
          });
          report.danglingLinksRemoved++;
        } catch (unlinkErr: any) {
          report.errors.push(`dangling link ${l.student_id}: ${unlinkErr?.message ?? String(unlinkErr)}`);
        }
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
      try {
        // Through the kernel, not a raw insert: this keeps the denormalised
        // parent_* columns harmonised, promotes the CRM stage, and leaves an
        // audit row — an unattributed cron-created family link is exactly the
        // kind of change staff later cannot explain.
        await syncExplicitParentStudentLink(admin as any, parentId, student.id, {
          source: 'integrity-sweep.legacyBackfill',
        });
        linkedStudentIds.add(student.id);
        report.legacyLinksBackfilled++;
      } catch (linkErr: any) {
        if (isParentLinkConflict(linkErr)) continue;
        if (linkErr?.code !== '23505') {
          report.errors.push(`legacy link ${student.id}: ${linkErr?.message ?? String(linkErr)}`);
        }
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

    // ── 4b. Repair grade vs section mix-ups from consent/registration ──
    // If section_class holds a specific grade (Basic 2 / JSS 1) and grade is empty,
    // move it into grade. If class_id is set, sync section_class from classes.name.
    const { canonicalGrade, SINGLE_GRADES } = await import('@/lib/classes/naming');
    const portalStudents = await fetchAll(
      admin,
      'portal_users',
      'id, class_id, section_class, grade',
      (q: any) => q.eq('role', 'student').neq('is_deleted', true),
    );
    const classIds = [...new Set(portalStudents.map((s: any) => s.class_id).filter(Boolean))];
    const classNameById = new Map<string, string>();
    for (let i = 0; i < classIds.length; i += 100) {
      const chunk = classIds.slice(i, i + 100);
      const { data: classes } = await admin.from('classes').select('id, name').in('id', chunk);
      for (const c of classes ?? []) classNameById.set(c.id, (c.name || '').trim());
    }
    for (const s of portalStudents) {
      const patch: Record<string, unknown> = {};
      const section = String(s.section_class || '').trim();
      const existingGrade = String(s.grade || '').trim();
      const canon = canonicalGrade(section);
      // Only treat as a misplaced grade when the label itself is a single grade
      // (e.g. "JSS 2"), not a band ("JSS 1-3") or composed class name ("School · …").
      const sectionIsSpecificGrade =
        !!canon
        && (SINGLE_GRADES as readonly string[]).includes(canon)
        && !section.includes('·')
        && !/\d+\s*[-–]\s*\d+/.test(section);

      if (!existingGrade && sectionIsSpecificGrade) {
        patch.grade = canon;
      }

      const className = s.class_id ? classNameById.get(s.class_id) : null;
      if (className && (sectionIsSpecificGrade || !section)) {
        patch.section_class = className;
        report.sectionsSyncedFromClass++;
      } else if (className && section && section !== className && sectionIsSpecificGrade) {
        patch.section_class = className;
        report.sectionsSyncedFromClass++;
      }

      if (Object.keys(patch).length === 0) continue;
      const { error } = await admin.from('portal_users').update(patch).eq('id', s.id);
      if (error) {
        report.errors.push(`grade repair ${s.id}: ${error.message}`);
        continue;
      }
      if (patch.grade) report.gradesRepaired++;
      const studentPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.grade) {
        studentPatch.grade = patch.grade;
        studentPatch.grade_level = patch.grade;
      }
      if (patch.section_class) {
        studentPatch.current_class = patch.section_class;
        studentPatch.section = patch.section_class;
      }
      await admin.from('students').update(studentPatch).eq('user_id', s.id);
    }

    // ── 5. Report (no change) students missing a school / class ──
    const { count: noSchool } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').neq('is_deleted', true).is('school_id', null);
    const { count: noClass } = await admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').neq('is_deleted', true).is('class_id', null);
    report.studentsNoSchool = noSchool ?? 0;
    report.studentsNoClass = noClass ?? 0;

    // ── 6. Auto-promote portal parents out of prospect (contacted / won) ──
    try {
      const { reconcileKnownParentStages } = await import('@/lib/crm/reconcile-known-parent-stages');
      const parentCrm = await reconcileKnownParentStages(admin);
      Object.assign(report, {
        parentCrmReconciled: parentCrm.portalParents,
        parentCrmPromoted: parentCrm.pipelinePromoted,
        parentBookRowsUpdated: parentCrm.bookRowsUpdated,
      });
    } catch (e: any) {
      report.errors.push(`parent CRM promotion: ${e?.message ?? 'failed'}`);
    }
  } catch (e: any) {
    report.errors.push(e?.message ?? 'sweep error');
  }

  return NextResponse.json({ ok: true, ...report, ranAt: new Date().toISOString() });
}
