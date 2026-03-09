/**
 * POST /api/admin/sync-users
 * GET  /api/admin/sync-users
 *
 * Admin-only. Finds and repairs every inconsistency between the four user pools:
 *  1. auth.users        — who can log in
 *  2. portal_users      — who the app sees (role, profile data)
 *  3. students table    — registration submissions (approved but never got an account)
 *  4. schools table     — approved schools with no portal account
 *
 * GET  → returns a dry-run status report (counts only, no changes)
 * POST → performs the actual sync and returns what was fixed
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await supabase
    .from('portal_users').select('role, id').eq('id', user.id).single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

function makePassword() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

// ── Shared audit logic ──────────────────────────────────────────────────────
async function runAudit(admin: ReturnType<typeof adminClient>) {
  // 1. All auth users
  const { data: authListData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authListData?.users ?? [];
  const authIdSet = new Set(authUsers.map(u => u.id));
  const authEmailSet = new Set(authUsers.map(u => u.email).filter(Boolean));

  // 2. All portal_users
  const { data: portalRows } = await admin.from('portal_users').select('id, email, role, full_name, school_id, school_name');
  const portalUsers = portalRows ?? [];
  const portalIdSet = new Set(portalUsers.map((u: any) => u.id));

  // 3. Approved students with no portal account
  const { data: approvedStudents } = await admin
    .from('students')
    .select('id, full_name, student_email, parent_email, school_name, school_id, date_of_birth, user_id')
    .eq('status', 'approved')
    .is('user_id', null);

  const orphanedApprovedStudents = (approvedStudents ?? []).filter(
    (s: any) => (s.student_email || s.parent_email)
  );

  // 4. Approved schools with no portal account
  const { data: approvedSchools } = await admin
    .from('schools')
    .select('id, name, email, contact_person')
    .eq('status', 'approved');

  const orphanedApprovedSchools = (approvedSchools ?? []).filter(
    (s: any) => s.email && !authEmailSet.has(s.email)
  );

  // 5. Auth users with no portal_users row
  const authWithoutPortal = authUsers.filter(u => !portalIdSet.has(u.id));

  // 6. Portal users with no auth account
  const portalWithoutAuth = portalUsers.filter((u: any) => !authIdSet.has(u.id));

  return {
    authUsers,
    portalUsers,
    orphanedApprovedStudents,
    orphanedApprovedSchools,
    authWithoutPortal,
    portalWithoutAuth,
  };
}

// ── GET — dry run status report ─────────────────────────────────────────────
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();
  const { orphanedApprovedStudents, orphanedApprovedSchools, authWithoutPortal, portalWithoutAuth } = await runAudit(admin);

  return NextResponse.json({
    gaps: {
      approved_students_without_account: orphanedApprovedStudents.length,
      approved_schools_without_account: orphanedApprovedSchools.length,
      auth_users_without_portal_row: authWithoutPortal.length,
      portal_users_without_auth: portalWithoutAuth.length,
    },
    details: {
      students_needing_accounts: orphanedApprovedStudents.map((s: any) => ({
        id: s.id,
        name: s.full_name,
        email: s.student_email || s.parent_email,
      })),
      schools_needing_accounts: orphanedApprovedSchools.map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email,
      })),
      auth_without_portal: authWithoutPortal.map(u => ({
        id: u.id,
        email: u.email,
        role: u.user_metadata?.role ?? 'student',
      })),
      portal_without_auth: portalWithoutAuth.map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
      })),
    },
  });
}

// ── POST — perform the sync ──────────────────────────────────────────────────
export async function POST() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();
  const { orphanedApprovedStudents, orphanedApprovedSchools, authWithoutPortal, portalWithoutAuth } = await runAudit(admin);

  const results = {
    students_given_accounts: [] as any[],
    schools_given_accounts: [] as any[],
    portal_rows_created: [] as string[],
    portal_rows_synced_to_auth: [] as string[],
    errors: [] as string[],
  };

  // ── Gap 1: Approved students with no auth/portal account ───────────────
  for (const s of orphanedApprovedStudents) {
    const loginEmail = (s as any).student_email || (s as any).parent_email;
    const password = makePassword();
    try {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: (s as any).full_name,
          role: 'student',
        },
      });

      if (authErr) {
        if (authErr.message.includes('already')) {
          results.errors.push(`student ${(s as any).full_name}: auth already exists, skipping`);
          continue;
        }
        results.errors.push(`student ${(s as any).full_name}: ${authErr.message}`);
        continue;
      }

      const authUserId = authData?.user?.id;
      if (!authUserId) continue;

      await admin.from('portal_users').upsert({
        id: authUserId,
        email: loginEmail,
        full_name: (s as any).full_name,
        role: 'student',
        school_name: (s as any).school_name || null,
        school_id: (s as any).school_id || null,
        date_of_birth: (s as any).date_of_birth || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      await admin.from('students').update({ user_id: authUserId }).eq('id', (s as any).id);

      results.students_given_accounts.push({
        name: (s as any).full_name,
        email: loginEmail,
        password,
        portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`student ${(s as any).full_name}: ${err.message}`);
    }
  }

  // ── Gap 2: Approved schools with no auth/portal account ────────────────
  for (const s of orphanedApprovedSchools) {
    const password = makePassword();
    try {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: (s as any).email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: (s as any).contact_person || (s as any).name,
          role: 'school',
        },
      });

      if (authErr) {
        if (authErr.message.includes('already')) {
          results.errors.push(`school ${(s as any).name}: auth already exists, skipping`);
          continue;
        }
        results.errors.push(`school ${(s as any).name}: ${authErr.message}`);
        continue;
      }

      const authUserId = authData?.user?.id;
      if (!authUserId) continue;

      await admin.from('portal_users').upsert({
        id: authUserId,
        email: (s as any).email,
        full_name: (s as any).contact_person || (s as any).name,
        role: 'school',
        school_name: (s as any).name,
        school_id: (s as any).id,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      results.schools_given_accounts.push({
        name: (s as any).name,
        email: (s as any).email,
        password,
        portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`school ${(s as any).name}: ${err.message}`);
    }
  }

  // ── Gap 3: Auth users with no portal_users row ──────────────────────────
  for (const u of authWithoutPortal) {
    try {
      const meta = u.user_metadata ?? {};
      await admin.from('portal_users').upsert({
        id: u.id,
        email: u.email ?? '',
        full_name: meta.full_name ?? u.email?.split('@')[0] ?? '',
        role: meta.role ?? 'student',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      results.portal_rows_created.push(u.email ?? u.id);
    } catch (err: any) {
      results.errors.push(`auth ${u.email}: ${err.message}`);
    }
  }

  // ── Gap 4: Portal users with no auth account — fix ID mismatches ────────
  for (const pu of portalWithoutAuth as any[]) {
    try {
      const { data: authListData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const matchingAuth = authListData?.users?.find(u => u.email === pu.email);
      if (matchingAuth && matchingAuth.id !== pu.id) {
        await admin.from('portal_users').upsert({
          ...pu,
          id: matchingAuth.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        await admin.auth.admin.updateUserById(matchingAuth.id, {
          user_metadata: { full_name: pu.full_name, role: pu.role },
        });
        results.portal_rows_synced_to_auth.push(pu.email);
      }
    } catch (err: any) {
      results.errors.push(`portal ${pu.email}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      students_given_accounts: results.students_given_accounts.length,
      schools_given_accounts: results.schools_given_accounts.length,
      portal_rows_created: results.portal_rows_created.length,
      portal_rows_synced_to_auth: results.portal_rows_synced_to_auth.length,
      errors: results.errors.length,
    },
    credentials: [
      ...results.students_given_accounts,
      ...results.schools_given_accounts,
    ],
    errors: results.errors,
  });
}
