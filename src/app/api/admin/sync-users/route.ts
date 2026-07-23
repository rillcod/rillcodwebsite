/**
 * POST /api/admin/sync-users
 * GET  /api/admin/sync-users
 *
 * Admin-only. Full reconciliation across all four user pools:
 *  1. auth.users        — who can log in
 *  2. portal_users      — who the app sees (role, profile data)
 *  3. students table    — approved registrations with no portal account
 *  4. schools table     — any school with an email but no portal account
 *
 * GET  → dry-run report (counts only, no changes)
 * POST → performs sync and returns what was fixed
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { findAuthUserIdByEmail, listAllAuthUsers, type ListedAuthUser } from '@/lib/auth/list-all-users';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';

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
  return generateTempPassword();
}

async function runAudit(admin: ReturnType<typeof adminClient>) {
  // Must paginate — first page alone false-flags real accounts (e.g. ADMINISTRATION) as portal-only.
  const authUsers = await listAllAuthUsers<ListedAuthUser>(admin);
  const authById = new Map(authUsers.map(u => [u.id, u]));
  const authByEmail = new Map(authUsers.map(u => [u.email?.trim().toLowerCase() ?? '', u]));

  const portalResult = await fetchAllSupabaseRows<{
    id: string;
    email: string | null;
    role: string;
    full_name: string | null;
    school_id: string | null;
    school_name: string | null;
    date_of_birth: string | null;
    is_active: boolean | null;
  }>((from, to) =>
    admin
      .from('portal_users')
      .select('id, email, role, full_name, school_id, school_name, date_of_birth, is_active')
      .range(from, to),
  );
  if (portalResult.error) throw new Error(portalResult.error.message);
  const portalUsers = portalResult.data;
  const portalById = new Map(portalUsers.map(u => [u.id, u]));
  const portalByEmail = new Map(portalUsers.map(u => [u.email?.trim().toLowerCase() ?? '', u]));

  // --- Gap A: Approved students with no user_id ---
  const approvedStudentsResult = await fetchAllSupabaseRows<{
    id: string;
    full_name: string;
    student_email: string | null;
    parent_email: string | null;
    school_name: string | null;
    school_id: string | null;
    date_of_birth: string | null;
    user_id: string | null;
  }>((from, to) =>
    admin
      .from('students')
      .select('id, full_name, student_email, parent_email, school_name, school_id, date_of_birth, user_id')
      .eq('status', 'approved')
      .is('user_id', null)
      .range(from, to),
  );
  if (approvedStudentsResult.error) throw new Error(approvedStudentsResult.error.message);

  const studentsNeedingAccounts = approvedStudentsResult.data.filter(
    s => (s.student_email || s.parent_email)
  );

  // --- Gap B: Schools with an email but no portal_users row (any status) ---
  const schoolsResult = await fetchAllSupabaseRows<{
    id: string;
    name: string;
    email: string | null;
    contact_person: string | null;
    status: string | null;
  }>((from, to) =>
    admin
      .from('schools')
      .select('id, name, email, contact_person, status')
      .not('status', 'eq', 'rejected')
      .not('email', 'is', null)
      .range(from, to),
  );
  if (schoolsResult.error) throw new Error(schoolsResult.error.message);

  const schoolsNeedingPortal = schoolsResult.data.filter(s => {
    if (!s.email) return false;
    const email = s.email.trim().toLowerCase();

    // Check portal by email first
    const existingRow = portalByEmail.get(email);
    if (existingRow) {
      // If portal row exists but doesn't have school_id or wrong role, it needs fixing
      if (existingRow.role !== 'school' || existingRow.school_id !== s.id) return true;
      return false;
    }

    // Check auth by email
    const authUser = authByEmail.get(email);
    if (!authUser) return true;           // not in auth at all
    if (!portalById.has(authUser.id)) return true;  // in auth but no portal row
    return false;
  });

  // --- Gap C: Auth users with no portal row ---
  const authWithoutPortal = authUsers.filter(u => !portalById.has(u.id));

  // --- Gap D: Portal users with no auth row ---
  const portalWithoutAuth = portalUsers.filter(u => !authById.has(u.id));

  // Split: those with an email match in auth (ID mismatch) vs truly missing auth
  const portalIdMismatches = portalWithoutAuth.filter(
    u => u.email && authByEmail.has(u.email.trim().toLowerCase()) &&
      authByEmail.get(u.email.trim().toLowerCase())!.id !== u.id
  );
  // Portal rows with no auth at all — need a NEW auth account created
  const portalNeedingAuth = portalWithoutAuth.filter(
    u => u.email && !authByEmail.has(u.email.trim().toLowerCase())
  );
  // Portal rows with no email — truly garbage
  const portalNoEmail = portalWithoutAuth.filter(u => !u.email);

  // --- Gap E: Students with mismatched school_id or name in portal_users ---
  const allApprovedStudentsResult = await fetchAllSupabaseRows<{
    id: string;
    full_name: string;
    school_id: string | null;
    user_id: string | null;
    school_name: string | null;
  }>((from, to) =>
    admin
      .from('students')
      .select('id, full_name, school_id, user_id, school_name')
      .eq('status', 'approved')
      .not('user_id', 'is', null)
      .range(from, to),
  );
  if (allApprovedStudentsResult.error) throw new Error(allApprovedStudentsResult.error.message);

  const studentsNeedingDataFix = allApprovedStudentsResult.data.filter(s => {
    const portal = portalById.get(s.user_id ?? '');
    if (!portal) return false;
    // Check if school_id, name, or school_name mismatch
    return portal.school_id !== s.school_id ||
      portal.full_name !== s.full_name ||
      portal.school_name !== s.school_name;
  });

  return {
    authById, authByEmail,
    portalById, portalByEmail,
    studentsNeedingAccounts,
    schoolsNeedingPortal,
    authWithoutPortal,
    portalIdMismatches,
    portalNeedingAuth,
    portalNoEmail,
    studentsNeedingDataFix,
  };
}

// ── GET — dry run ────────────────────────────────────────────────────────────
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();
  const {
    studentsNeedingAccounts, schoolsNeedingPortal,
    authWithoutPortal, portalIdMismatches, portalNeedingAuth, portalNoEmail,
    studentsNeedingDataFix,
  } = await runAudit(admin);

  return NextResponse.json({
    gaps: {
      students_needing_accounts: studentsNeedingAccounts.length,
      schools_needing_portal: schoolsNeedingPortal.length,
      auth_without_portal: authWithoutPortal.length,
      portal_id_mismatches: portalIdMismatches.length,
      portal_needing_auth: portalNeedingAuth.length,
      students_needing_data_fix: studentsNeedingDataFix.length,
    },
    unfixable: {
      portal_rows_no_email: portalNoEmail.length,
    },
    details: {
      students_needing_accounts: studentsNeedingAccounts.map(s => ({
        id: s.id, name: s.full_name, email: s.student_email || s.parent_email,
      })),
      schools_needing_portal: schoolsNeedingPortal.map(s => ({
        id: s.id, name: s.name, email: s.email, status: s.status,
      })),
      portal_needing_auth: portalNeedingAuth.map(u => ({
        id: u.id, email: u.email, role: u.role, name: u.full_name
      })),
      students_needing_data_fix: studentsNeedingDataFix.map(s => ({
        id: s.id, user_id: s.user_id, name: s.full_name, school_id: s.school_id
      })),
      id_mismatches: portalIdMismatches.map(u => ({
        id: u.id, email: u.email, name: u.full_name
      })),
      auth_without_portal: authWithoutPortal.map(u => ({
        id: u.id, email: u.email
      }))
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
    studentsNeedingAccounts, schoolsNeedingPortal,
    authWithoutPortal, portalIdMismatches, portalNeedingAuth,
    studentsNeedingDataFix,
  } = await runAudit(admin);

  interface SyncCredential {
    name: string;
    email: string;
    password: string;
    portal_user_id?: string;
    role?: string;
  }

  const results = {
    students_fixed: [] as SyncCredential[],
    schools_fixed: [] as SyncCredential[],
    portal_rows_created: [] as string[],
    portal_auth_created: [] as SyncCredential[],
    id_mismatches_fixed: [] as string[],
    data_fixes: [] as string[],
    errors: [] as string[],
  };

  // ── Gap A: Approved students with no user_id ────────────────────────────
  for (const s of studentsNeedingAccounts) {
    const loginEmail = s.student_email || s.parent_email;
    let authUserId: string | null = null;
    let password: string | null = null;

    const existingAuth = authByEmail.get(loginEmail!.trim().toLowerCase());
    if (existingAuth) {
      authUserId = existingAuth.id;
    } else {
      password = makePassword();
      try {
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
          email: loginEmail!, password, email_confirm: true,
          user_metadata: { full_name: s.full_name, role: 'student' },
        });

        if (authErr) {
          // Rescue: if already registered, search all auth pages by email
          if (authErr.message.toLowerCase().includes('already registered')) {
            const foundId = await findAuthUserIdByEmail(admin, loginEmail!);
            if (foundId) {
              authUserId = foundId;
            } else {
              results.errors.push(`student ${s.full_name}: ${authErr.message} (Deep search failed)`);
              continue;
            }
          } else {
            results.errors.push(`student ${s.full_name}: ${authErr.message}`);
            continue;
          }
        } else {
          authUserId = authData?.user?.id ?? null;
        }
      } catch (err: any) {
        results.errors.push(`student ${s.full_name}: ${err.message}`); continue;
      }
    }
    if (!authUserId) continue;
    try {
      await admin.from('portal_users').upsert({
        id: authUserId, email: loginEmail!,
        full_name: s.full_name, role: 'student',
        school_name: s.school_name || null,
        school_id: s.school_id || null,
        date_of_birth: s.date_of_birth || null,
        is_active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      await admin.from('students').update({ user_id: authUserId }).eq('id', s.id);
      results.students_fixed.push({
        name: s.full_name, email: loginEmail!,
        password: password ?? '(existing — no new password)', portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`student ${s.full_name}: ${err.message}`);
    }
  }

  // ── Gap B: Schools with email but no portal row ─────────────────────────
  for (const s of schoolsNeedingPortal) {
    const email = s.email!;
    let authUserId: string | null = null;
    let password: string | null = null;

    const existingAuth = authByEmail.get(email.trim().toLowerCase());
    if (existingAuth) {
      authUserId = existingAuth.id;
    } else {
      password = makePassword();
      try {
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: {
            full_name: s.contact_person || s.name, role: 'school',
          },
        });

        if (authErr) {
          // Rescue: if already registered, search all auth pages by email
          if (authErr.message.toLowerCase().includes('already registered')) {
            const foundId = await findAuthUserIdByEmail(admin, email);
            if (foundId) {
              authUserId = foundId;
            } else {
              results.errors.push(`school ${s.name}: ${authErr.message} (Deep search failed)`);
              continue;
            }
          } else {
            results.errors.push(`school ${s.name}: ${authErr.message}`);
            continue;
          }
        } else {
          authUserId = authData?.user?.id ?? null;
        }
      } catch (err: any) {
        results.errors.push(`school ${s.name}: ${err.message}`); continue;
      }
    }
    if (!authUserId) continue;
    try {
      await admin.from('portal_users').upsert({
        id: authUserId, email,
        full_name: s.contact_person || s.name,
        role: 'school', school_name: s.name, school_id: s.id,
        is_active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      results.schools_fixed.push({
        name: s.name, email,
        password: password ?? '(existing — no new password)', portal_user_id: authUserId,
      });
    } catch (err: any) {
      results.errors.push(`school ${s.name}: ${err.message}`);
    }
  }

  // ── Gap C: Auth users with no portal row ────────────────────────────────
  for (const u of authWithoutPortal) {
    if (portalById.has(u.id)) continue;
    try {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      await admin.from('portal_users').upsert({
        id: u.id, email: u.email ?? '',
        full_name: (typeof meta.full_name === 'string' ? meta.full_name : null) ?? u.email?.split('@')[0] ?? '',
        role: (typeof meta.role === 'string' ? meta.role : null) ?? 'student',
        is_active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      results.portal_rows_created.push(u.email ?? u.id);
    } catch (err: any) {
      results.errors.push(`auth ${u.email}: ${err.message}`);
    }
  }

  // ── Gap D1: Portal rows with wrong ID (email exists in auth with diff ID) ─
  for (const pu of portalIdMismatches) {
    const email = pu.email?.trim().toLowerCase();
    if (!email) continue;
    try {
      const matchingAuth = authByEmail.get(email);
      if (!matchingAuth || matchingAuth.id === pu.id) continue;
      await admin.from('portal_users').upsert({
        ...pu, id: matchingAuth.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      await admin.auth.admin.updateUserById(matchingAuth.id, {
        user_metadata: { full_name: pu.full_name, role: pu.role },
      });
      // Remove the stale wrong-ID row (clean up study group refs first)
      await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', pu.id);
      await admin.from('study_group_members').delete().eq('user_id', pu.id);
      await admin.from('study_groups').update({ created_by: null }).eq('created_by', pu.id);
      await admin.from('portal_users').delete().eq('id', pu.id);
      results.id_mismatches_fixed.push(email);
    } catch (err: any) {
      results.errors.push(`mismatch ${email}: ${err.message}`);
    }
  }

  // ── Gap D2: Portal rows with email but NO auth account — create auth ─────
  // (Injected users — they have a portal row but were never given an auth login)
  for (const pu of portalNeedingAuth) {
    const email = pu.email?.trim();
    if (!email) continue;
    const password = makePassword();
    try {
      let newAuthId: string | null = null;
      let usedExisting = false;

      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: pu.full_name, role: pu.role },
      });

      if (authErr) {
        // "database error" / "already registered" means user exists in auth
        // but wasn't caught by our email map (whitespace/case mismatch / past page 1).
        const foundId = await findAuthUserIdByEmail(admin, email);
        if (foundId) {
          newAuthId = foundId;
          usedExisting = true;
        } else if (pu.role === 'admin') {
          // Never force-delete admin profiles — false orphans used to hit ADMINISTRATION.
          results.errors.push(`portal ${email}: ${authErr.message} — admin row left untouched (manual review required).`);
          continue;
        } else {
          // Force delete the orphaned portal row if it can't be linked
          await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', pu.id);
          await admin.from('study_group_members').delete().eq('user_id', pu.id);
          await admin.from('study_groups').update({ created_by: null }).eq('created_by', pu.id);
          await admin.from('portal_users').delete().eq('id', pu.id);
          results.errors.push(`portal ${email}: ${authErr.message} — Orphaned portal row has been force deleted.`);
          continue;
        }
      } else {
        newAuthId = authData?.user?.id ?? null;
      }

      if (!newAuthId) continue;

      if (newAuthId !== pu.id) {
        // Auth ID differs from portal row ID — update portal row to match
        await admin.from('portal_users').upsert({
          ...pu, id: newAuthId, updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', pu.id);
        await admin.from('study_group_members').delete().eq('user_id', pu.id);
        await admin.from('study_groups').update({ created_by: null }).eq('created_by', pu.id);
        await admin.from('portal_users').delete().eq('id', pu.id);
      }

      results.portal_auth_created.push({
        name: pu.full_name?.trim() || email,
        email,
        role: pu.role,
        password: usedExisting ? '(existing account — no new password)' : password,
      });
    } catch (err: any) {
      results.errors.push(`portal ${email}: ${err.message}`);
    }
  }

  // ── Gap E: Students with mismatched school_id or name ──────────────────
  for (const s of studentsNeedingDataFix) {
    try {
      await admin.from('portal_users').update({
        full_name: s.full_name,
        school_id: s.school_id,
        school_name: s.school_name,
        updated_at: new Date().toISOString(),
      }).eq('id', s.user_id);
      results.data_fixes.push(s.full_name);
    } catch (err: any) {
      results.errors.push(`data-fix ${s.full_name}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      students_fixed: results.students_fixed.length,
      schools_fixed: results.schools_fixed.length,
      portal_rows_created: results.portal_rows_created.length,
      portal_auth_created: results.portal_auth_created.length,
      id_mismatches_fixed: results.id_mismatches_fixed.length,
      data_fixes: results.data_fixes.length,
      errors: results.errors.length,
    },
    credentials: [
      ...results.students_fixed,
      ...results.schools_fixed,
      ...results.portal_auth_created,
    ],
    errors: results.errors,
  });
}

// ── DELETE — hard-remove all portal rows that have no matching auth account ──
// Use this when sync leaves orphaned rows that can't be fixed automatically.
export async function DELETE() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const admin = adminClient();

  // Fresh fetch — must paginate or real auth users look like orphans.
  const authUsers = await listAllAuthUsers<ListedAuthUser>(admin);
  const authIds = new Set(authUsers.map(u => u.id));

  const portalResult = await fetchAllSupabaseRows<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
  }>((from, to) =>
    admin.from('portal_users').select('id, email, full_name, role').range(from, to),
  );
  if (portalResult.error) {
    return NextResponse.json({ error: portalResult.error.message }, { status: 500 });
  }

  const orphans = portalResult.data.filter(u => !authIds.has(u.id));

  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const pu of orphans) {
    if (pu.role === 'admin') {
      skipped.push(`${pu.email ?? pu.id} (admin — refuse delete)`);
      continue;
    }
    await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', pu.id);
    await admin.from('study_group_members').delete().eq('user_id', pu.id);
    await admin.from('study_groups').update({ created_by: null }).eq('created_by', pu.id);
    const { error } = await admin.from('portal_users').delete().eq('id', pu.id);
    if (error) {
      skipped.push(`${pu.email ?? pu.id} (${error.message})`);
    } else {
      deleted.push(pu.email ?? pu.id);
    }
  }

  return NextResponse.json({
    success: true,
    deleted: deleted.length,
    skipped: skipped.length,
    deleted_list: deleted,
    skipped_list: skipped,
  });
}
