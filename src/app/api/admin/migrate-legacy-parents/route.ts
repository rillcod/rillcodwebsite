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

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function tempPassword() {
  return require('crypto').randomBytes(8).toString('base64url').slice(0, 10);
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
        report.details.push({ studentId: s.id, fullName, parentEmail, action: 'would split' });
        continue;
      }

      try {
        // 1. Rename the student account to a fresh @rillcod.com login (frees parentEmail).
        const newStudentEmail = await generateUniqueStudentLoginEmail(admin as any, fullName);
        const studentPw = tempPassword();
        await admin.auth.admin.updateUserById(s.user_id, {
          email: newStudentEmail,
          password: studentPw,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'student' },
        });
        await admin.from('portal_users').update({ email: newStudentEmail, role: 'student', updated_at: new Date().toISOString() }).eq('id', s.user_id);
        await admin.from('students').update({ student_email: newStudentEmail, email: newStudentEmail, updated_at: new Date().toISOString() }).eq('id', s.id);

        // 2. Create the PARENT account on the now-free original email.
        let parentId: string | null = null;
        const parentPw = tempPassword();
        const { data: existingParent } = await admin.from('portal_users').select('id').eq('email', parentEmail).maybeSingle();
        if (existingParent?.id) {
          const existingParentId: string = existingParent.id;
          parentId = existingParentId;
          await admin.auth.admin.updateUserById(existingParentId, { password: parentPw, user_metadata: { full_name: s.parent_name || 'Parent/Guardian', role: 'parent' } });
        } else {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: parentEmail,
            password: parentPw,
            email_confirm: true,
            user_metadata: { full_name: s.parent_name || 'Parent/Guardian', role: 'parent' },
          });
          parentId = created?.user?.id ?? null;
          if (cErr && !parentId) {
            const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
            parentId = list?.users?.find((u) => u.email?.trim().toLowerCase() === parentEmail)?.id ?? null;
          }
        }

        if (!parentId) throw new Error('could not create/resolve parent account');

        await admin.from('portal_users').upsert({
          id: parentId,
          email: parentEmail,
          full_name: s.parent_name || 'Parent/Guardian',
          role: 'parent',
          phone: s.parent_phone || null,
          school_id: s.school_id,
          school_name: s.school_name,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        // 3. Link parent ↔ student.
        await syncExplicitParentStudentLink(admin as any, parentId, s.id);

        report.migrated++;
        report.details.push({ studentId: s.id, fullName, parentEmail, newStudentEmail });
      } catch (err: any) {
        report.skipped++;
        report.errors.push(`${s.id}: ${err?.message ?? 'unknown'}`);
        console.error('[migrate-legacy-parents] failed for', s.id, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun ? 'Dry run — no changes written.' : 'Legacy parent migration complete.',
      report,
    });
  } catch (err: any) {
    console.error('[migrate-legacy-parents]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
