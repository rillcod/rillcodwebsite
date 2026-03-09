/**
 * POST /api/admin/sync-users
 * GET  /api/admin/sync-users
 *
 * Admin-only. Full reconciliation across all four user pools:
 *  1. auth.users        — who can log in
 *  2. portal_users      — who the app sees (role, profile data)
 *  3. students table    — approved registrations with no portal account
 *  4. schools table     — approved schools with no portal account
 *
 * GET  → dry-run report (counts only, no changes)
 * POST → performs sync and returns what was fixed
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

async function runAudit(admin: ReturnType<typeof adminClient>) {
  const { data: authListData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authListData?.users ?? [];
  const authById = new Map(authUsers.map(u => [u.id, u]));
  const authByEmail = new Map(authUsers.map(u => [u.email ?? '', u]));

  const { data: portalRows } = await admin
    .from('portal_users')
    .select('id, email, role, full_name, school_id, school_name');
  const portalUsers = portalRows ?? [];
  const portalById = new Map(portalUsers.map((u: any) => [u.id, u]));
  const portalByEmail = new Map(portalUsers.map((u: any) => [u.email ?? '', u]));

  // Approved students with no user_id (never got a portal account)
  const { data: approvedStudents } = await admin
    .from('students')
    .select('id, full_name, student_email, parent_email, school_name, school_id, date_of_birth, user_id')
    .eq('status', 'approved')
    .is('user_id', null);

  // Approved schools — check both: not in auth at all, or in auth but missing portal row
  const { data: approvedSchools } = await admin
    .from('schools')
    .select('id, name, email, contact_person')
    .eq('status', 'approved');

  const schoolsNeedingPortal = (approvedSchools ?? []).filter((s: any) => {
    if (!s.email) return false;
    const authUser = authByEmail.get(s.email);
    if (!authUser) return true; // not in auth at all
    if (!portalById.has(authUser.id)) return true; // in auth but missing portal row
    return false;
  });

  // Auth users with no portal row
  const authWithoutPortal = authUsers.filter(u => !portalById.has(u.id));

  // Portal users with no auth account (could be ID mismatch)
  const portalWithoutAuth = portalUsers.filter((u: any) => !authById.has(u.id));

  return {
    authUsers, authById, authByEmail,
    portalUsers, portalById, portalByEmail,
    approvedStudents: (approvedStudents ?? []).filter((s: any) => s.student_email || s.parent_email),
    schoolsNeedingPortal,
    authWithoutPortal,
    portalWithoutAuth,
  };
}

// ── GET — dry run ────────────────────────────────────────────────────────────
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();
  const { approvedStudents, schoolsNeedingPortal, authWithoutPortal, portalWithoutAuth } = await runAudit(admin);

  return NextResponse.json({
    gaps: {
      approved_students_without_account: approvedStudents.length,
      approved_schools_without_portal: schoolsNeedingPortal.length,
      auth_users_without_portal_row: authWithoutPortal.length,
      portal_users_without_auth: portalWithoutAuth.length,
    },
    details: {
      students_needing_accounts: approvedStudents.map((s: any) => ({
        id: s.id, name: s.full_name, email: s.student_email || s.parent_email,
      })),
      schools_needing_portal: schoolsNeedingPortal.map((s: any) => ({
        id: s.id, name: s.name, email: s.email,
      })),
      auth_without_portal: authWithoutPortal.map(u => ({
        id: u.id, email: u.email, role: u.user_metadata?.role ?? 'student',
      })),
      portal_without_auth: portalWithoutAuth.map((u: any) => ({
        id: u.id, email: u.email, role: u.role,
      })),
    },
  });
}

// ── POST — perform sync ──────────────────────────────────────────────────────
export async function POST() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();
  const {
    authByEmail, portalById,
    approvedStudents, schoolsNeedingPortal, authWithoutPortal, portalWithoutAuth,
  } = await runAudit(admin);

  const results = {
    students_fixed: [] as any[],
    schools_fixed: [] as any[],
    portal_rows_created: [] as string[],
    portal_rows_synced: [] as string[],
    errors: [] as string[],
  };

  // ── Gap 1: Approved students with no user_id ────────────────────────────
  for (const s of approvedStudents) {
    const loginEmail = (s as any).student_email || (s as any).parent_email;
    let authUserId: string | null = null;
    let password: string | null = null;

    // Check if already in auth (by email)
    const existingAuth = authByEmail.get(loginEmail);
    if (existingAuth) {
      // Already in auth — just need to upsert portal row + link student
      authUserId = existingAuth.id;
    } else {
      // Create new auth account
      password = makePassword();
      try {
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: (s as any).full_name, role: 'student' },
        });
        if (authErr) {
          results.errors.push(`student ${(s as any).full_name}: ${authErr.message}`);
          continue;
        }
        authUserId = authData?.user?.id ?? null;
      } catch (err: any) {
        results.errors.push(`student ${(s as any).full_name}: ${err.message}`);
        continue;
      }
    }

    if (!authUserId) continue;

    try {
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

      results.students_fixed.push({
        name: (s as any).full_name,
        email: loginEmail,
        password: password ?? '(existing account — no new password)',
        portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`student ${(s as any).full_name}: ${err.message}`);
    }
  }

  // ── Gap 2: Approved schools missing portal row ──────────────────────────
  for (const s of schoolsNeedingPortal) {
    const email = (s as any).email;
    let authUserId: string | null = null;
    let password: string | null = null;

    const existingAuth = authByEmail.get(email);
    if (existingAuth) {
      authUserId = existingAuth.id;
    } else {
      password = makePassword();
      try {
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: (s as any).contact_person || (s as any).name,
            role: 'school',
          },
        });
        if (authErr) {
          results.errors.push(`school ${(s as any).name}: ${authErr.message}`);
          continue;
        }
        authUserId = authData?.user?.id ?? null;
      } catch (err: any) {
        results.errors.push(`school ${(s as any).name}: ${err.message}`);
        continue;
      }
    }

    if (!authUserId) continue;

    try {
      await admin.from('portal_users').upsert({
        id: authUserId,
        email,
        full_name: (s as any).contact_person || (s as any).name,
        role: 'school',
        school_name: (s as any).name,
        school_id: (s as any).id,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      results.schools_fixed.push({
        name: (s as any).name,
        email,
        password: password ?? '(existing account — no new password)',
        portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`school ${(s as any).name}: ${err.message}`);
    }
  }

  // ── Gap 3: Auth users with no portal row ────────────────────────────────
  for (const u of authWithoutPortal) {
    if (portalById.has(u.id)) continue; // may have been created above
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

  // ── Gap 4: Portal users with no auth — fix email-matched ID mismatches ──
  for (const pu of portalWithoutAuth as any[]) {
    try {
      const matchingAuth = authByEmail.get(pu.email);
      if (matchingAuth && matchingAuth.id !== pu.id) {
        await admin.from('portal_users').upsert({
          ...pu,
          id: matchingAuth.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        await admin.auth.admin.updateUserById(matchingAuth.id, {
          user_metadata: { full_name: pu.full_name, role: pu.role },
        });
        results.portal_rows_synced.push(pu.email);
      }
    } catch (err: any) {
      results.errors.push(`portal ${pu.email}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      students_fixed: results.students_fixed.length,
      schools_fixed: results.schools_fixed.length,
      portal_rows_created: results.portal_rows_created.length,
      portal_rows_synced: results.portal_rows_synced.length,
      errors: results.errors.length,
    },
    credentials: [...results.students_fixed, ...results.schools_fixed],
    errors: results.errors,
  });
}
