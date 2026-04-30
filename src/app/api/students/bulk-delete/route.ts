import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Tables with portal_user references that do NOT cascade on portal_users delete.
// We must remove these manually before deleting portal_users rows.
const NON_CASCADE_TABLES: Array<{ table: string; col: string }> = [
  { table: 'lesson_progress',               col: 'portal_user_id' },
  { table: 'live_session_attendance',        col: 'portal_user_id' },
  { table: 'content_ratings',               col: 'portal_user_id' },
  { table: 'notification_preferences',      col: 'portal_user_id' },
  { table: 'subscriptions',                 col: 'portal_user_id' },
  { table: 'payment_transactions',          col: 'portal_user_id' },
  { table: 'leaderboards',                  col: 'portal_user_id' },
  { table: 'point_transactions',            col: 'portal_user_id' },
  { table: 'user_points',                   col: 'portal_user_id' },
  { table: 'user_badges',                   col: 'portal_user_id' },
  { table: 'certificates',                  col: 'portal_user_id' },
  // assignment_submissions has a portal_user_id column (student FK) separate from user_id (cascade)
  { table: 'assignment_submissions',        col: 'portal_user_id' },
];

export async function POST(request: Request) {
  try {
    // Only admins can bulk-delete
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (caller?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can bulk-delete students' }, { status: 403 });
    }

    const body = await request.json();
    const userIds: string[] = body.userIds;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 });
    }

    if (userIds.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 students per batch' }, { status: 400 });
    }

    // ── Step 1: Verify all IDs belong to students (safety check) ─────────
    const { data: verified } = await supabaseAdmin
      .from('portal_users')
      .select('id, email, full_name, role')
      .in('id', userIds)
      .eq('role', 'student');

    const safeIds   = (verified ?? []).map((u) => u.id);
    const skippedIds = userIds.filter((id) => !safeIds.includes(id));

    if (safeIds.length === 0) {
      return NextResponse.json({
        error: 'None of the provided IDs belong to student accounts.',
        skipped: skippedIds,
      }, { status: 400 });
    }

    const deletionErrors: string[] = [];

    // ── Step 2: Delete from non-cascade tables in batch ──────────────────
    for (const { table, col } of NON_CASCADE_TABLES) {
      const { error } = await supabaseAdmin
        .from(table as any)
        .delete()
        .in(col, safeIds);
      // Ignore "does not exist" errors — table may not have rows for these users
      if (error && !error.message.includes('does not exist')) {
        deletionErrors.push(`${table}: ${error.message}`);
      }
    }

    // Nullify files.uploaded_by before portal_users delete (FK constraint, files are kept)
    await supabaseAdmin.from('files').update({ uploaded_by: null }).in('uploaded_by', safeIds);

    // Study groups cleanup
    await supabaseAdmin.from('study_group_messages').update({ sender_id: null }).in('sender_id', safeIds);
    await supabaseAdmin.from('study_group_members').delete().in('user_id', safeIds);
    await supabaseAdmin.from('study_groups').update({ created_by: null }).in('created_by', safeIds);

    // Delete students registration rows — prevents orphaned records and re-registration duplicates
    await supabaseAdmin.from('students').delete().in('user_id', safeIds);

    // ── Step 3: Delete portal_users rows (triggers 14 CASCADE deletes) ───
    const { error: profileDeleteErr } = await supabaseAdmin
      .from('portal_users')
      .delete()
      .in('id', safeIds);

    if (profileDeleteErr) {
      return NextResponse.json({
        error: `Failed to delete portal_users: ${profileDeleteErr.message}`,
        partial_errors: deletionErrors,
      }, { status: 500 });
    }

    // ── Step 4: Delete Supabase Auth users one by one ────────────────────
    const authResults: Array<{ id: string; status: 'deleted' | 'failed'; error?: string }> = [];

    for (const uid of safeIds) {
      const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (authDeleteErr) {
        authResults.push({ id: uid, status: 'failed', error: authDeleteErr.message });
        deletionErrors.push(`auth(${uid}): ${authDeleteErr.message}`);
      } else {
        authResults.push({ id: uid, status: 'deleted' });
      }
    }

    return NextResponse.json({
      deleted: authResults.filter((r) => r.status === 'deleted').length,
      failed:  authResults.filter((r) => r.status === 'failed').length,
      skipped: skippedIds.length,
      errors:  deletionErrors,
      details: verified?.map((u) => ({
        id:        u.id,
        full_name: u.full_name,
        email:     u.email,
        auth:      authResults.find((a) => a.id === u.id)?.status ?? 'unknown',
      })),
    });

  } catch (err: any) {
    console.error('Bulk delete error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
