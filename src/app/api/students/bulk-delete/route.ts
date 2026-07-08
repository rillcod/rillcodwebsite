import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Tables with portal_user references that do NOT cascade on portal_users delete.
// We must remove these manually before deleting portal_users rows.
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

    // ── Full wipe each account via the DB function ───────────────────────
    // hard_delete_portal_user clears every FK child (owned rows deleted, creator/actor
    // refs nulled), the students + portal_users rows and auth.users — one complete,
    // orphan-free delete per account, no hand-maintained table list to drift.
    const authResults: Array<{ id: string; status: 'deleted' | 'failed'; error?: string }> = [];
    for (const uid of safeIds) {
      const { error } = await (supabaseAdmin as any).rpc('hard_delete_portal_user', { p_id: uid });
      if (error) {
        deletionErrors.push(`wipe(${uid}): ${error.message}`);
        authResults.push({ id: uid, status: 'failed', error: error.message });
        continue;
      }
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
      authResults.push(authErr ? { id: uid, status: 'deleted' } : { id: uid, status: 'deleted' });
    }

    // ── Harmonise the bulk-register archive: a deleted student must also leave
    // the registration_results history (keyed by email), and any batch left empty
    // is pruned, so the archive always reflects live students only. ──
    const deletedEmails = (verified ?? []).map((u) => u.email).filter(Boolean) as string[];
    if (deletedEmails.length > 0) {
      const { data: archRows } = await supabaseAdmin
        .from('registration_results').select('batch_id').in('email', deletedEmails);
      const affectedBatchIds = [...new Set((archRows ?? []).map((r: any) => r.batch_id).filter(Boolean))];
      await supabaseAdmin.from('registration_results').delete().in('email', deletedEmails);
      for (const bId of affectedBatchIds) {
        const { count } = await supabaseAdmin
          .from('registration_results').select('id', { count: 'exact', head: true }).eq('batch_id', bId);
        if ((count ?? 0) === 0) await supabaseAdmin.from('registration_batches').delete().eq('id', bId);
        else await supabaseAdmin.from('registration_batches').update({ student_count: count }).eq('id', bId);
      }
    }

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
