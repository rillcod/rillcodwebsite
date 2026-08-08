/**
 * POST /api/admin/migrate-legacy-parents   (admin only)
 *
 * Fixes the legacy "single account" case that causes the parent dashboard to show
 * 0 children: students onboarded by the OLD flow were created as ONE account on
 * the PARENT's email with role 'student'. There is no parent account, so the
 * parent can never log in as a parent.
 *
 * For each such record this safely SPLITS it into two accounts:
 *   1. Rename the existing (student) account's login to a fresh
 *      `mike123@rillcod.com` — it stays the STUDENT account. This frees the email.
 *   2. Create a PARENT account on the now-free original email (role 'parent').
 *   3. Link parent ↔ student so the dashboard + CRM resolve correctly.
 *
 * Body: { dryRun?: boolean }. Because it rewrites login emails, it is admin-
 * triggered (not an unattended cron) and supports a dry-run preview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { findOrCreateParentPortal } from '@/lib/parents/provision';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

import { generateTempPassword } from '@/lib/utils/password';

function tempPassword() {
  return generateTempPassword();
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

    const report = { candidates: 0, migrated: 0, skipped: 0, errors: [] as string[], details: [] as any[] };

    // Candidate students: account exists, and the login email == the parent email
    // (the legacy collision). We compare the portal account email to parent_email.
    const { data: rows } = await admin
      .from('students')
      .select('id, full_name, name, user_id, parent_email, parent_name, parent_phone, student_email, school_id, school_name')
      .not('user_id', 'is', null)
      .not('parent_email', 'is', null)
      .limit(500);

    for (const s of (rows ?? []) as any[]) {
      const parentEmail = (s.parent_email || '').trim().toLowerCase();
      if (!parentEmail) continue;

      // The student account's current login.
      const { data: acct } = await admin
        .from('portal_users')
        .select('id, email, role')
        .eq('id', s.user_id)
        .maybeSingle();
      if (!acct) continue;

      const acctEmail = (acct.email || '').trim().toLowerCase();
      // Legacy collision = the student account is literally on the parent's email.
      if (acctEmail !== parentEmail) { continue; }

      report.candidates++;
      const fullName = s.full_name || s.name || 'Student';

      if (dryRun) {
        if (!s.school_id) {
          report.details.push({ studentId: s.id, fullName, parentEmail, action: 'would skip — no school' });
          report.skipped++;
          continue;
        }
        report.details.push({ studentId: s.id, fullName, parentEmail, action: 'would split' });
        continue;
      }

      let renamedStudentEmail: string | null = null;
      let parentProvisioned = false;
      try {
        // Gate before any rewrite — never rename the student if we cannot create the parent.
        if (!s.school_id) {
          report.skipped++;
          report.errors.push(`${fullName}: student has no school — skip parent migrate`);
          continue;
        }

        // 1. Rename the student account to a fresh @rillcod.com login (frees parentEmail).
        const newStudentEmail = await generateUniqueStudentLoginEmail(admin as any, fullName);
        await requireSupabaseWrite(admin.auth.admin.updateUserById(s.user_id, {
          email: newStudentEmail,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'student' },
        }), `rename legacy student login for ${fullName}`);
        renamedStudentEmail = newStudentEmail;
        await requireSupabaseWrite(
          admin.from('portal_users').update({ email: newStudentEmail, role: 'student', updated_at: new Date().toISOString() }).eq('id', s.user_id),
          `update legacy student portal email for ${fullName}`,
        );
        await requireSupabaseWrite(
          admin.from('students').update({ student_email: newStudentEmail, email: newStudentEmail, updated_at: new Date().toISOString() }).eq('id', s.id),
          `update legacy student record email for ${fullName}`,
        );

        // 2. Create the PARENT account on the now-free original email.
        const parentPw = tempPassword();
        const provisioned = await findOrCreateParentPortal(admin as any, {
          email: parentEmail,
          fullName: s.parent_name || 'Parent/Guardian',
          phone: s.parent_phone || null,
          schoolId: s.school_id,
          schoolName: s.school_name,
          passwordPolicy: 'set',
          password: parentPw,
          preserveExistingProfile: false,
          archiveCredentials: false,
          batchLabel: 'Legacy Parent Migrate',
        });
        if (!provisioned.ok || !provisioned.parentId) {
          throw new Error(provisioned.error || 'could not create/resolve parent account');
        }
        parentProvisioned = true;
        const parentId = provisioned.parentId;

        // 3. Link parent ↔ student.
        await syncExplicitParentStudentLink(admin as any, parentId, s.id);

        report.migrated++;
        report.details.push({ studentId: s.id, fullName, parentEmail, newStudentEmail });
      } catch (err: any) {
        if (renamedStudentEmail && !parentProvisioned) {
          try {
            await requireSupabaseWrite(admin.auth.admin.updateUserById(s.user_id, {
              email: parentEmail,
              email_confirm: true,
              user_metadata: { full_name: fullName, role: 'student' },
            }), `roll back student login for ${fullName}`);
            await requireSupabaseWrite(
              admin.from('portal_users').update({ email: parentEmail, role: 'student', updated_at: new Date().toISOString() }).eq('id', s.user_id),
              `roll back student portal email for ${fullName}`,
            );
            await requireSupabaseWrite(
              admin.from('students').update({ student_email: parentEmail, email: parentEmail, updated_at: new Date().toISOString() }).eq('id', s.id),
              `roll back student record email for ${fullName}`,
            );
          } catch (rollbackError) {
            report.errors.push(`${s.id}: rollback failed after migration error (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)})`);
          }
        }
        report.skipped++;
        report.errors.push(`${s.id}: ${err?.message ?? 'unknown'}`);
        console.error('[migrate-legacy-parents] failed for', s.id, err);
      }
    }

    if (!dryRun) {
      await logAudit(admin as any, {
        action: report.errors.length ? 'migrate_legacy_parent_accounts_partial' : 'migrate_legacy_parent_accounts',
        actorId: user.id,
        resourceType: 'parent_student_identity_reconciliation',
        newValue: `Migrated ${report.migrated} legacy parent/student account(s); skipped ${report.skipped}`,
        newValues: {
          candidates: report.candidates,
          migrated: report.migrated,
          skipped: report.skipped,
          errors: report.errors,
        },
      });
    }

    return NextResponse.json({
      success: report.errors.length === 0,
      partial: report.errors.length > 0,
      message: dryRun ? 'Dry run — no changes written.' : 'Legacy parent migration complete.',
      report,
    });
  } catch (err: any) {
    console.error('[migrate-legacy-parents]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
