/**
 * POST /api/admin/manage-account   (admin only)
 *
 * Credential / account lifecycle operations that the DB can't safely cascade on
 * its own (financial + audit tables intentionally have no ON DELETE CASCADE).
 *
 * Body: { action, portalUserId, newEmail?, dryRun?, force? }
 *   action = 'safe-delete' → remove the account + cascade-safe rows, but PRESERVE
 *            financial/audit history (payments, receipts, invoices, certificates,
 *            audit logs) by unlinking them. Blocks if completed payments exist
 *            unless { force: true }.
 *   action = 'purge'       → delete the account AND all related rows incl. finance.
 *            Destroys history — intended for test data only.
 *            If parent, cascaded to child student records.
 *   action = 'change-email'→ change the login email and propagate it to every
 *            denormalised copy (students, registration_results, CRM).
 *
 * Deletes support { dryRun: true } to preview impact.
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

// Helper to delete engagement records for a user or student ID
async function safeDeleteRefDeletes(admin: any, portalUserId: string | null, studentId?: string | null) {
  if (portalUserId) {
    const portalRefs = [
      { table: 'lesson_progress', col: 'portal_user_id' },
      { table: 'leaderboards', col: 'portal_user_id' },
      { table: 'point_transactions', col: 'portal_user_id' },
      { table: 'user_badges', col: 'portal_user_id' },
      { table: 'user_points', col: 'portal_user_id' },
      { table: 'exam_attempts', col: 'portal_user_id' },
      { table: 'content_ratings', col: 'portal_user_id' },
      { table: 'notification_preferences', col: 'portal_user_id' },
      { table: 'subscriptions', col: 'portal_user_id' },
      { table: 'live_session_attendance', col: 'portal_user_id' },
      { table: 'live_session_breakout_participants', col: 'portal_user_id' },
      { table: 'live_session_poll_responses', col: 'portal_user_id' },
      { table: 'study_group_members', col: 'user_id' },
      { table: 'parent_teacher_threads', col: 'parent_id' },
      { table: 'parent_teacher_threads', col: 'teacher_id' },
      { table: 'student_teacher_threads', col: 'teacher_id' },
      { table: 'student_teacher_messages', col: 'sender_id' },
      { table: 'parent_teacher_messages', col: 'sender_id' },
      { table: 'teacher_schools', col: 'teacher_id' },
    ];

    for (const { table, col } of portalRefs) {
      try {
        await admin.from(table).delete().eq(col, portalUserId);
      } catch (err) {
        console.warn(`[safe-delete] Delete failed for ${table}.${col}:`, err);
      }
    }
  }

  // `student_id` is overloaded across the schema — some tables FK to students.id,
  // others to the portal_users id. Engagement tables (xp/streaks/badges/etc.) key
  // on the PORTAL-USER id, while academic tables key on students.id. So we attempt
  // each delete against BOTH ids; a non-matching id simply deletes nothing.
  const studentIdCandidates = Array.from(new Set([studentId, portalUserId].filter(Boolean))) as string[];
  if (studentIdCandidates.length) {
    const studentRefs = [
      { table: 'student_xp_summary', col: 'student_id' },
      { table: 'student_streaks', col: 'student_id' },
      { table: 'student_badges', col: 'student_id' },
      { table: 'flashcard_reviews', col: 'student_id' },
      { table: 'flashcard_study_sessions', col: 'student_id' },
      { table: 'project_engagement', col: 'student_id' },
      { table: 'student_assignment_engagement', col: 'student_id' },
      { table: 'student_xp_ledger', col: 'student_id' },
      { table: 'showcase_items', col: 'student_id' },
      { table: 'project_group_members', col: 'student_id' },
      { table: 'student_teacher_threads', col: 'student_id' },
      { table: 'parent_teacher_threads', col: 'student_id' },
    ];

    for (const { table, col } of studentRefs) {
      for (const id of studentIdCandidates) {
        try {
          await admin.from(table).delete().eq(col, id);
        } catch (err) {
          console.warn(`[safe-delete] Delete failed for ${table}.${col}:`, err);
        }
      }
    }
  }
}

// Helper to nullify referencing fields for safe-delete (to avoid deleting data and blockages)
async function nullifyRefs(admin: any, portalUserId: string) {
  const refs = [
    { table: 'payments', col: 'user_id' },
    { table: 'payment_transactions', col: 'portal_user_id' },
    { table: 'invoices', col: 'portal_user_id' },
    { table: 'receipts', col: 'student_id' },
    { table: 'certificates', col: 'portal_user_id' },
    { table: 'audit_logs', col: 'user_id' },
    { table: 'audit_logs', col: 'actor_id' },
    { table: 'activity_logs', col: 'user_id' },
    { table: 'parent_feedback', col: 'portal_user_id' },
    { table: 'portal_users', col: 'created_by' },
    { table: 'students', col: 'approved_by' },
    { table: 'students', col: 'created_by' },
    { table: 'teachers', col: 'created_by' },
    { table: 'timetables', col: 'created_by' },
    { table: 'classes', col: 'teacher_id' },
    { table: 'timetable_slots', col: 'teacher_id' },
    { table: 'announcements', col: 'author_id' },
    { table: 'assignment_submissions', col: 'graded_by' },
    { table: 'attendance', col: 'recorded_by' },
    { table: 'consent_forms', col: 'created_by' },
    { table: 'content_library', col: 'approved_by' },
    { table: 'content_library', col: 'created_by' },
    { table: 'course_curricula', col: 'created_by' },
    { table: 'discussion_replies', col: 'created_by' },
    { table: 'discussion_topics', col: 'created_by' },
    { table: 'exams', col: 'created_by' },
    { table: 'files', col: 'uploaded_by' },
    { table: 'flagged_content', col: 'moderator_id' },
    { table: 'flagged_content', col: 'reporter_id' },
    { table: 'flashcard_decks', col: 'created_by' },
    { table: 'generated_reports', col: 'generated_by' },
    { table: 'lesson_plans', col: 'created_by' },
    { table: 'project_groups', col: 'created_by' },
    { table: 'study_groups', col: 'created_by' },
    { table: 'whatsapp_conversations', col: 'portal_user_id' },
  ];

  for (const { table, col } of refs) {
    try {
      await admin.from(table).update({ [col]: null }).eq(col, portalUserId);
    } catch (err) {
      console.warn(`[safe-delete] Nullify failed for ${table}.${col}:`, err);
    }
  }
}

/**
 * Delete rows and REPORT whether it worked.
 *
 * Every call here used to be `try { await ...delete() } catch {}`. The Supabase
 * client does not throw on a query error — it resolves with { error } — so those
 * catches never fired and the error was never read. A delete blocked by a
 * foreign key or RLS failed silently, the purge reported success, and orphaned
 * rows survived pointing at an account that no longer exists.
 *
 * Failures are collected rather than thrown: a purge that stops halfway is worse
 * than one that finishes and tells you which tables refused.
 */
async function purgeDelete(
  admin: any,
  failures: string[],
  table: string,
  column: string,
  value: string,
): Promise<void> {
  try {
    const { error } = await admin.from(table).delete().eq(column, value);
    if (error) failures.push(`${table}.${column}: ${error.message}`);
  } catch (thrown) {
    failures.push(`${table}.${column}: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
  }
}

// Helper to wipe all records for a user (portal user ID + student ID).
// Returns the tables that refused to purge, so callers can surface a partial wipe.
async function purgeSingleUser(admin: any, portalUserId: string | null, studentId?: string | null): Promise<string[]> {
  const failures: string[] = [];
  if (portalUserId) {
    // 1. Delete all audit, logs, and activity records
    const auditTables = [
      { table: 'audit_logs', col: 'user_id' },
      { table: 'audit_logs', col: 'actor_id' },
      { table: 'activity_logs', col: 'user_id' },
    ];
    for (const { table, col } of auditTables) {
      await purgeDelete(admin, failures, table, col, portalUserId);
    }

    // 2. Delete all financial records linked to portal user
    await purgeDelete(admin, failures, 'payments', 'user_id', portalUserId);
    await purgeDelete(admin, failures, 'payment_transactions', 'portal_user_id', portalUserId);
    await purgeDelete(admin, failures, 'invoices', 'portal_user_id', portalUserId);
    await purgeDelete(admin, failures, 'receipts', 'student_id', portalUserId);
    await purgeDelete(admin, failures, 'certificates', 'portal_user_id', portalUserId);
    await purgeDelete(admin, failures, 'parent_feedback', 'portal_user_id', portalUserId);
    // Kernel teardown, not a raw delete: the children usually SURVIVE this purge,
    // so the denormalised parent_name/parent_email/parent_phone on their student
    // rows must be cleared too. A raw link delete left them showing a contact for
    // an account that no longer exists.
    try {
      const { detachAllChildren } = await import('@/lib/parents/links');
      await detachAllChildren(admin, portalUserId, { source: 'manage-account.purgeSingleUser' });
    } catch (detachErr) {
      console.warn('[purgeSingleUser] detach children failed:', detachErr);
    }
  }

  if (studentId) {
    // Financial records linked to student
    await purgeDelete(admin, failures, 'payments', 'student_id', studentId);
    await purgeDelete(admin, failures, 'receipts', 'student_id', studentId);

    // Academic / enrollment records
    const academicTables = [
      { table: 'assignment_submissions', col: 'student_id' },
      { table: 'attendance', col: 'student_id' },
      { table: 'grade_reports', col: 'student_id' },
      { table: 'student_enrollments', col: 'student_id' },
      { table: 'student_progress', col: 'student_id' },
      { table: 'parent_student_links', col: 'student_id' },
    ];
    for (const { table, col } of academicTables) {
      await purgeDelete(admin, failures, table, col, studentId);
    }
  }

  // 4. Delete all engagement records
  await safeDeleteRefDeletes(admin, portalUserId, studentId);

  // 6. Delete student profile row
  if (studentId) {
    await purgeDelete(admin, failures, 'students', 'id', studentId);
  }
  if (portalUserId) {
    await purgeDelete(admin, failures, 'students', 'user_id', portalUserId);
  }

  if (portalUserId) {
    // 7. Nullify other NO ACTION fields
    const nullRefs = [
      { table: 'portal_users', col: 'created_by' },
      { table: 'students', col: 'approved_by' },
      { table: 'students', col: 'created_by' },
      { table: 'teachers', col: 'created_by' },
      { table: 'timetables', col: 'created_by' },
      { table: 'classes', col: 'teacher_id' },
      { table: 'timetable_slots', col: 'teacher_id' },
      { table: 'announcements', col: 'author_id' },
      { table: 'assignment_submissions', col: 'graded_by' },
      { table: 'attendance', col: 'recorded_by' },
      { table: 'consent_forms', col: 'created_by' },
      { table: 'content_library', col: 'approved_by' },
      { table: 'content_library', col: 'created_by' },
      { table: 'course_curricula', col: 'created_by' },
      { table: 'discussion_replies', col: 'created_by' },
      { table: 'discussion_topics', col: 'created_by' },
      { table: 'exams', col: 'created_by' },
      { table: 'files', col: 'uploaded_by' },
      { table: 'flagged_content', col: 'moderator_id' },
      { table: 'flagged_content', col: 'reporter_id' },
      { table: 'flashcard_decks', col: 'created_by' },
      { table: 'lesson_plans', col: 'created_by' },
      { table: 'project_groups', col: 'created_by' },
      { table: 'study_groups', col: 'created_by' },
    ];
    for (const { table, col } of nullRefs) {
      try {
        const { error } = await admin.from(table).update({ [col]: null }).eq(col, portalUserId);
        // A reference left pointing at a deleted account is what makes the final
        // portal_users delete fail, so these are worth naming individually.
        if (error) failures.push(`${table}.${col} (nullify): ${error.message}`);
      } catch (thrown) {
        failures.push(`${table}.${col} (nullify): ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      }
    }

    // 8. Delete portal user row
    await purgeDelete(admin, failures, 'portal_users', 'id', portalUserId);

    // 9. Delete Auth user
    try {
      await admin.auth.admin.deleteUser(portalUserId);
    } catch (e) {
      failures.push(`auth.user: ${e instanceof Error ? e.message : String(e)}`);
      console.error('[purge] Auth delete failed:', e);
    }
  }

  if (failures.length) {
    console.error('[purgeSingleUser] incomplete purge:', { portalUserId, studentId, failures });
  }
  return failures;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { action, portalUserId, newEmail, dryRun = false, force = false } = await req.json();
    if (!portalUserId) return NextResponse.json({ error: 'portalUserId is required' }, { status: 400 });

    const { data: account } = await admin.from('portal_users').select('id, email, full_name, role, student_id').eq('id', portalUserId).maybeSingle();
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    // Authoritative student-record id: the students row is linked via students.user_id,
    // not portal_users.student_id (which is legacy and usually null). Resolve it so the
    // student-keyed cleanup actually targets the right rows.
    let resolvedStudentId: string | null = (account as any).student_id ?? null;
    {
      const { data: stuRow } = await admin.from('students').select('id').eq('user_id', portalUserId).maybeSingle();
      if (stuRow?.id) resolvedStudentId = stuRow.id;
    }

    // Don't allow an admin to delete themselves.
    if ((action === 'safe-delete' || action === 'purge') && portalUserId === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    // ── change-email ──
    if (action === 'change-email') {
      const next = (newEmail || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return NextResponse.json({ error: 'A valid newEmail is required' }, { status: 400 });
      const old = (account.email || '').trim().toLowerCase();
      if (next === old) return NextResponse.json({ error: 'New email is the same as the current one' }, { status: 400 });

      const { data: taken } = await admin.from('portal_users').select('id').eq('email', next).maybeSingle();
      if (taken && taken.id !== portalUserId) return NextResponse.json({ error: `Email ${next} is already used by another account` }, { status: 409 });

      const { error: authUpdErr } = await admin.auth.admin.updateUserById(portalUserId, { email: next, email_confirm: true });
      if (authUpdErr) return NextResponse.json({ error: `Auth email update failed: ${authUpdErr.message}` }, { status: 500 });

      // The canonical copy — and this write was itself still unchecked, the exact
      // silent failure the propagation below was fixed for. If it fails the account
      // signs in as `next` while every lookup by portal_users.email still resolves
      // `old`, so this is a core failure of the change, not a propagation shortfall.
      const { error: portalUpdErr } = await admin
        .from('portal_users')
        .update({ email: next, updated_at: new Date().toISOString() })
        .eq('id', portalUserId);
      if (portalUpdErr) {
        console.error('[manage-account] portal_users email update failed:', {
          portalUserId, old, next, error: portalUpdErr.message,
        });
        return NextResponse.json({
          error: `Auth email changed to ${next}, but the portal_users record did not follow: ${portalUpdErr.message}. The account now signs in with ${next} while the portal record still reads ${old} — re-run this action.`,
          emailChanged: true,
          authEmail: next,
          portalUsersEmail: old,
        }, { status: 500 });
      }

      // Propagate to denormalised copies.
      //
      // Every one of these used to be `try { await update(); flag = 'ok' } catch {}`,
      // which reported success unconditionally. The Supabase client does NOT throw
      // on a query error — it resolves with { error } — so the catch never fired,
      // the error was never read, and the flag was set even when the write failed.
      // An admin changing an email saw every table marked 'ok' while stale copies
      // silently survived, which is precisely how a parent ends up unreachable at
      // an address the system believes it updated.
      const propagated: Record<string, string> = {};
      const failures: string[] = [];

      const propagate = async (
        key: string,
        run: () => PromiseLike<{ error: { message: string } | null }>,
      ) => {
        try {
          const { error } = await run();
          if (error) {
            propagated[key] = `failed: ${error.message}`;
            failures.push(key);
            return;
          }
          propagated[key] = 'ok';
        } catch (thrown) {
          const message = thrown instanceof Error ? thrown.message : String(thrown);
          propagated[key] = `failed: ${message}`;
          failures.push(key);
        }
      };

      await propagate('students_by_user', () =>
        admin.from('students').update({ student_email: next, email: next }).eq('user_id', portalUserId));

      if (old) {
        if (account.role === 'parent') {
          await propagate('students_parent_email', () =>
            admin.from('students').update({ parent_email: next }).eq('parent_email', old));
          await propagate('prospective_students_parent_email', () =>
            admin.from('prospective_students').update({ parent_email: next }).eq('parent_email', old));
        } else if (account.role === 'student') {
          await propagate('students_by_email', () =>
            admin.from('students').update({ student_email: next, email: next }).eq('email', old));
          await propagate('prospective_students_email', () =>
            admin.from('prospective_students').update({ email: next }).eq('email', old));
        } else if (account.role === 'teacher') {
          await propagate('teachers_email', () =>
            admin.from('teachers').update({ email: next }).eq('email', old));
        } else if (account.role === 'school') {
          await propagate('schools_email', () =>
            admin.from('schools').update({ email: next }).eq('email', old));
        }

        await propagate('registration_results', () =>
          admin.from('registration_results').update({ email: next }).eq('email', old));
        await propagate('contact_book', () =>
          admin.from('customer_contact_book').update({ email: next }).eq('email', old));
        await propagate('feedback', () =>
          admin.from('feedback').update({ user_email: next }).eq('user_email', old));
        await propagate('form_leads', () =>
          admin.from('form_leads').update({ email: next }).eq('email', old));
      }

      if (failures.length) {
        console.error('[manage-account] email propagation incomplete:', { portalUserId, old, next, failures });
      }

      return NextResponse.json({
        // `success` stays strict: it means the login email changed AND every
        // denormalised copy followed. But a partial run must not read as "nothing
        // happened" — the login email genuinely did change, and an admin who sees
        // only success:false will re-run or panic over a change that did land.
        // `emailChanged` states that plainly, independent of propagation.
        success: failures.length === 0,
        partial: failures.length > 0,
        emailChanged: true,
        message: failures.length
          ? `Login email changed to ${next}. ${failures.length} denormalised ${failures.length === 1 ? 'copy' : 'copies'} did not follow (${failures.join(', ')}). Sign-in uses the new address; re-run this action to retry the stale copies.`
          : `Login email changed to ${next}; all ${Object.keys(propagated).length} denormalised copies followed.`,
        action,
        oldEmail: old,
        newEmail: next,
        propagated,
        ...(failures.length ? { failedTargets: failures } : {}),
      });
    }

    // ── delete (safe-delete | purge) ──
    if (action === 'safe-delete' || action === 'purge') {
      // Count completed payments for context / blocking.
      const { count: paidCount } = await admin
        .from('payment_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('portal_user_id', portalUserId)
        .in('payment_status', ['completed', 'success']);

      // Also sum payments in payments table
      const { count: directPaymentsCount } = await admin
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', portalUserId)
        .eq('payment_status', 'completed');

      const totalPaymentsCount = (paidCount ?? 0) + (directPaymentsCount ?? 0);

      if (dryRun) {
        // For a parent purge, surface how many CHILD accounts will also be destroyed.
        let childrenToDestroy = 0;
        if (action === 'purge' && account.role === 'parent') {
          const ids = new Set<string>();
          if (account.email) {
            const { data: stds } = await admin.from('students').select('id').eq('parent_email', account.email);
            (stds ?? []).forEach((s: any) => ids.add(s.id));
          }
          const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', portalUserId);
          (links ?? []).forEach((l: any) => ids.add(l.student_id));
          childrenToDestroy = ids.size;
        }
        return NextResponse.json({
          success: true, dryRun: true, action,
          account: { id: account.id, email: account.email, role: account.role },
          completedPayments: totalPaymentsCount,
          childrenToDestroy,
          note: action === 'safe-delete'
            ? 'Will delete the account + engagement rows; financial/audit history is preserved (unlinked).'
            : `Will PERMANENTLY delete the account AND all related rows incl. payments/receipts/certificates${childrenToDestroy ? ` — plus ${childrenToDestroy} linked child account(s).` : '.'}`,
        });
      }

      if (action === 'safe-delete') {
        if (totalPaymentsCount > 0 && !force) {
          return NextResponse.json({
            error: `This account has ${totalPaymentsCount} completed payment(s). Re-send with { "force": true } to detach and delete (history is preserved), or use purge.`,
            completedPayments: totalPaymentsCount,
          }, { status: 409 });
        }

        // Nullify all FKs referencing this user
        await nullifyRefs(admin, portalUserId);

        // Delete all engagement records
        await safeDeleteRefDeletes(admin, portalUserId, resolvedStudentId);

        // Remove the portal_users row
        const { error: delErr } = await admin.from('portal_users').delete().eq('id', portalUserId);
        if (delErr) {
          return NextResponse.json({ error: `Delete blocked: ${delErr.message}. Some related rows still reference this account.` }, { status: 409 });
        }

        // Soft-delete the student record so it doesn't reappear as an "un-activated"
        // student (the login FK was set null) while its history is preserved.
        if (resolvedStudentId) {
          try {
            await admin.from('students')
              .update({ is_active: false, is_deleted: true, updated_at: new Date().toISOString() })
              .eq('id', resolvedStudentId);
          } catch { /* non-fatal */ }
        }

        // Remove the auth user
        try { await admin.auth.admin.deleteUser(portalUserId); } catch (e) {
          console.error('[manage-account] auth delete failed:', e);
        }

        return NextResponse.json({ success: true, action, deleted: { id: portalUserId, email: account.email }, preservedFinance: true });
      }

      if (action === 'purge') {
        // Find linked child student records + portal user records if parent
        const childrenToPurge: Array<{ studentId: string, portalUserId: string | null }> = [];
        if (account.role === 'parent') {
          const childStudentIds: string[] = [];
          if (account.email) {
            const { data: stds } = await admin.from('students').select('id').eq('parent_email', account.email);
            if (stds) {
              childStudentIds.push(...stds.map((s: any) => s.id));
            }
          }
          const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', portalUserId);
          if (links) {
            for (const l of links) {
              if (!childStudentIds.includes(l.student_id)) {
                childStudentIds.push(l.student_id);
              }
            }
          }

          // For each student, find their login account via the authoritative
          // students.user_id link (portal_users.student_id is legacy/usually null).
          for (const sId of childStudentIds) {
            const { data: stuRow } = await admin.from('students').select('user_id').eq('id', sId).maybeSingle();
            childrenToPurge.push({ studentId: sId, portalUserId: (stuRow as any)?.user_id ?? null });
          }
        }

        // Purge child students first
        const purgeFailures: string[] = [];
        for (const child of childrenToPurge) {
          purgeFailures.push(...await purgeSingleUser(admin, child.portalUserId, child.studentId));
        }

        // Purge primary user
        purgeFailures.push(...await purgeSingleUser(admin, portalUserId, resolvedStudentId));

        // A partially purged account is the dangerous outcome: the admin believes
        // the record is gone while orphaned rows still reference it. Say so.
        return NextResponse.json({
          success: purgeFailures.length === 0,
          partial: purgeFailures.length > 0,
          action,
          deleted: { id: portalUserId, email: account.email, purgedChildrenCount: childrenToPurge.length },
          ...(purgeFailures.length ? { failedTargets: purgeFailures } : {}),
        });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[manage-account]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
