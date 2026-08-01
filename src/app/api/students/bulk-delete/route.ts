import { NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { permanentWipePortalUsers } from '@/lib/students/permanent-wipe';

// Tables with portal_user references that do NOT cascade on portal_users delete.
// We must remove these manually before deleting portal_users rows.
export async function POST(request: Request) {
  try {
    const supabaseAdmin = createEngagementAdminClient();
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

    const { deleted, failed } = await permanentWipePortalUsers(supabaseAdmin, verified ?? []);
    const deletionErrors = failed.map((f) => `wipe(${f.id}): ${f.error}`);
    const authResults: Array<{ id: string; status: 'deleted' | 'failed'; error?: string }> = [
      ...deleted.map((id) => ({ id, status: 'deleted' as const })),
      ...failed.map((f) => ({ id: f.id, status: 'failed' as const, error: f.error })),
    ];

    // Audit trail — record WHO bulk-deleted WHICH students (non-throwing).
    await logAudit(supabaseAdmin as any, {
      action: 'students.bulk_delete',
      actorId: user.id,
      resourceType: 'students',
      resourceId: null,
      oldValues: {
        deleted: (verified ?? []).map((u) => ({ id: u.id, full_name: u.full_name, email: u.email })),
        requested: userIds.length,
        skipped: skippedIds,
      },
    });

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
