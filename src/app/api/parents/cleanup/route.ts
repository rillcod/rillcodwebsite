import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  prepareRoleSpecificWipe,
  wipePortalUserCascade,
  pruneRegistrationArchiveByEmails,
} from '@/lib/students/permanent-wipe';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/parents/cleanup
// Admin-only: scans the database for orphaned parent data and purges it.
// Handles:
//   1. Soft-deleted parents (is_deleted=true) — hard-delete auth+db+links
//   2. students.parent_email pointing to non-existent portal accounts — cleared
//   3. parent_student_links with no valid parent_id — deleted
//   4. form_leads.matched_parent_id pointing to non-existent accounts — cleared
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = adminClient();

  // Confirm caller is admin
  const { data: profile } = await (sb as any)
    .from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const stats = {
    soft_deleted_parents_purged: 0,
    orphaned_student_parent_emails_cleared: 0,
    orphaned_links_deleted: 0,
    stale_lead_parent_refs_cleared: 0,
  };

  // ── 1. Hard-delete soft-deleted parent accounts ─────────────────────────
  const { data: softDeleted } = await (sb as any)
    .from('portal_users')
    .select('id, email')
    .eq('role', 'parent')
    .eq('is_deleted', true);

  if (softDeleted && softDeleted.length > 0) {
    const emails: string[] = [];
    for (const parent of softDeleted) {
      await prepareRoleSpecificWipe(sb as any, {
        id: parent.id,
        role: 'parent',
        email: parent.email,
      });
      const wiped = await wipePortalUserCascade(sb as any, parent.id);
      if (!wiped.ok) {
        console.error('[parents/cleanup] wipe failed:', parent.id, wiped.error);
        continue;
      }
      if (parent.email) emails.push(parent.email);
      stats.soft_deleted_parents_purged += 1;
    }
    if (emails.length) {
      await pruneRegistrationArchiveByEmails(sb as any, emails);
    }
  }

  // ── 2. Find students with parent_email pointing to no active portal account ──
  const { data: studentsWithParent } = await (sb as any)
    .from('students')
    .select('id, parent_email')
    .not('parent_email', 'is', null);

  if (studentsWithParent && studentsWithParent.length > 0) {
    const uniqueEmails = [...new Set<string>(studentsWithParent.map((s: any) => s.parent_email as string))];

    // Fetch which of those emails have a live (non-deleted) parent account
    const { data: liveParents } = await (sb as any)
      .from('portal_users')
      .select('email')
      .eq('role', 'parent')
      .neq('is_deleted', true)
      .in('email', uniqueEmails);

    const liveEmails = new Set<string>((liveParents ?? []).map((p: any) => p.email as string));
    const orphanEmails = uniqueEmails.filter(e => !liveEmails.has(e));

    if (orphanEmails.length > 0) {
      await (sb as any).from('students').update({
        parent_email: null, parent_name: null, parent_phone: null,
        updated_at: new Date().toISOString(),
      }).in('parent_email', orphanEmails);
      stats.orphaned_student_parent_emails_cleared = orphanEmails.length;
    }
  }

  // ── 3. Remove parent_student_links with no valid parent in portal_users ──
  try {
    const { data: allLinks, error: linksErr } = await (sb as any)
      .from('parent_student_links')
      .select('id, parent_id');

    if (linksErr) throw linksErr;

    if (allLinks && allLinks.length > 0) {
      const linkParentIds = [...new Set<string>(allLinks.map((l: any) => l.parent_id as string))];

      const { data: existingParents } = await (sb as any)
        .from('portal_users')
        .select('id')
        .in('id', linkParentIds);

      const existingIds = new Set<string>((existingParents ?? []).map((p: any) => p.id as string));
      const orphanParentIds = linkParentIds.filter(id => !existingIds.has(id));

      if (orphanParentIds.length > 0) {
        const { data: deleted } = await (sb as any)
          .from('parent_student_links').delete().in('parent_id', orphanParentIds).select('id');
        stats.orphaned_links_deleted = deleted?.length ?? 0;
      }
    }
  } catch (err: any) {
    // If the table doesn't exist yet (pre-migration), skip this step gracefully
    if (!err?.message?.includes('relation') && err?.code !== '42P01') throw err;
  }

  // ── 4. Clear form_leads.matched_parent_id where parent no longer exists ──
  const { data: leadsWithParent } = await (sb as any)
    .from('form_leads')
    .select('id, matched_parent_id')
    .not('matched_parent_id', 'is', null);

  if (leadsWithParent && leadsWithParent.length > 0) {
    const leadParentIds = [...new Set<string>(leadsWithParent.map((l: any) => l.matched_parent_id as string))];

    const { data: existingParents } = await (sb as any)
      .from('portal_users').select('id').in('id', leadParentIds);
    const existingIds = new Set<string>((existingParents ?? []).map((p: any) => p.id as string));

    const staleIds = leadParentIds.filter(id => !existingIds.has(id));
    if (staleIds.length > 0) {
      const { data: updated } = await (sb as any)
        .from('form_leads').update({ matched_parent_id: null }).in('matched_parent_id', staleIds).select('id');
      stats.stale_lead_parent_refs_cleared = updated?.length ?? 0;
    }
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  return NextResponse.json({ success: true, total_cleaned: total, stats });
}
