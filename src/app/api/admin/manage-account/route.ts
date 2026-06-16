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

  if (studentId) {
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
      try {
        await admin.from(table).delete().eq(col, studentId);
      } catch (err) {
        console.warn(`[safe-delete] Delete failed for ${table}.${col}:`, err);
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

// Helper to wipe all records for a user (portal user ID + student ID)
async function purgeSingleUser(admin: any, portalUserId: string | null, studentId?: string | null) {
  if (portalUserId) {
    // 1. Delete all audit, logs, and activity records
    const auditTables = [
      { table: 'audit_logs', col: 'user_id' },
      { table: 'audit_logs', col: 'actor_id' },
      { table: 'activity_logs', col: 'user_id' },
    ];
    for (const { table, col } of auditTables) {
      try { await admin.from(table).delete().eq(col, portalUserId); } catch {}
    }

    // 2. Delete all financial records linked to portal user
    try { await admin.from('payments').delete().eq('user_id', portalUserId); } catch {}
    try { await admin.from('payment_transactions').delete().eq('portal_user_id', portalUserId); } catch {}
    try { await admin.from('invoices').delete().eq('portal_user_id', portalUserId); } catch {}
    try { await admin.from('receipts').delete().eq('student_id', portalUserId); } catch {}
    try { await admin.from('certificates').delete().eq('portal_user_id', portalUserId); } catch {}
    try { await admin.from('parent_feedback').delete().eq('portal_user_id', portalUserId); } catch {}
    try { await admin.from('parent_student_links').delete().eq('parent_id', portalUserId); } catch {}
  }

  if (studentId) {
    // Financial records linked to student
    try { await admin.from('payments').delete().eq('student_id', studentId); } catch {}
    try { await admin.from('receipts').delete().eq('student_id', studentId); } catch {}

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
      try { await admin.from(table).delete().eq(col, studentId); } catch {}
    }
  }

  // 4. Delete all engagement records
  await safeDeleteRefDeletes(admin, portalUserId, studentId);

  // 6. Delete student profile row
  if (studentId) {
    try { await admin.from('students').delete().eq('id', studentId); } catch {}
  }
  if (portalUserId) {
    try { await admin.from('students').delete().eq('user_id', portalUserId); } catch {}
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
      { table: 'generated_reports', col: 'generated_by' },
      { table: 'lesson_plans', col: 'created_by' },
      { table: 'project_groups', col: 'created_by' },
      { table: 'study_groups', col: 'created_by' },
    ];
    for (const { table, col } of nullRefs) {
      try { await admin.from(table).update({ [col]: null }).eq(col, portalUserId); } catch {}
    }

    // 8. Delete portal user row
    try { await admin.from('portal_users').delete().eq('id', portalUserId); } catch {}

    // 9. Delete Auth user
    try { await admin.auth.admin.deleteUser(portalUserId); } catch (e) {
      console.error('[purge] Auth delete failed:', e);
    }
  }
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

      await admin.from('portal_users').update({ email: next, updated_at: new Date().toISOString() }).eq('id', portalUserId);

      // Propagate to denormalised copies.
      const propagated: Record<string, string> = {};

      try {
        await admin.from('students').update({ student_email: next, email: next }).eq('user_id', portalUserId);
        propagated.students_by_user = 'ok';
      } catch {}

      if (old) {
        if (account.role === 'parent') {
          try { await admin.from('students').update({ parent_email: next }).eq('parent_email', old); propagated.students_parent_email = 'ok'; } catch {}
          try { await admin.from('prospective_students').update({ parent_email: next }).eq('parent_email', old); propagated.prospective_students_parent_email = 'ok'; } catch {}
        } else if (account.role === 'student') {
          try { await admin.from('students').update({ student_email: next, email: next }).eq('email', old); propagated.students_by_email = 'ok'; } catch {}
          try { await admin.from('prospective_students').update({ email: next }).eq('email', old); propagated.prospective_students_email = 'ok'; } catch {}
        } else if (account.role === 'teacher') {
          try { await admin.from('teachers').update({ email: next }).eq('email', old); propagated.teachers_email = 'ok'; } catch {}
        } else if (account.role === 'school') {
          try { await admin.from('schools').update({ email: next }).eq('email', old); propagated.schools_email = 'ok'; } catch {}
        }

        try { await admin.from('registration_results').update({ email: next }).eq('email', old); propagated.registration_results = 'ok'; } catch {}
        try { await admin.from('customer_contact_book').update({ email: next }).eq('email', old); propagated.contact_book = 'ok'; } catch {}
        try { await admin.from('feedback').update({ user_email: next }).eq('user_email', old); propagated.feedback = 'ok'; } catch {}
        try { await admin.from('form_leads').update({ email: next }).eq('email', old); propagated.form_leads = 'ok'; } catch {}
      }

      return NextResponse.json({ success: true, action, oldEmail: old, newEmail: next, propagated });
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
        return NextResponse.json({
          success: true, dryRun: true, action,
          account: { id: account.id, email: account.email, role: account.role },
          completedPayments: totalPaymentsCount,
          note: action === 'safe-delete'
            ? 'Will delete the account + engagement rows; financial/audit history is preserved (unlinked).'
            : 'Will PERMANENTLY delete the account AND all related rows incl. payments/receipts/certificates.',
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
        await safeDeleteRefDeletes(admin, portalUserId, account.student_id);

        // Remove the portal_users row
        const { error: delErr } = await admin.from('portal_users').delete().eq('id', portalUserId);
        if (delErr) {
          return NextResponse.json({ error: `Delete blocked: ${delErr.message}. Some related rows still reference this account.` }, { status: 409 });
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

          // For each student, find their portal user
          for (const sId of childStudentIds) {
            const { data: childPu } = await admin.from('portal_users').select('id').eq('student_id', sId).maybeSingle();
            childrenToPurge.push({ studentId: sId, portalUserId: childPu?.id ?? null });
          }
        }

        // Purge child students first
        for (const child of childrenToPurge) {
          await purgeSingleUser(admin, child.portalUserId, child.studentId);
        }

        // Purge primary user
        await purgeSingleUser(admin, portalUserId, account.student_id);

        return NextResponse.json({ success: true, action, deleted: { id: portalUserId, email: account.email, purgedChildrenCount: childrenToPurge.length } });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[manage-account]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
