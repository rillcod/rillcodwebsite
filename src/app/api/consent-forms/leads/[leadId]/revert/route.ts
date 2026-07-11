import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { revertLeadAccounts } from '@/lib/admin/cascade-delete';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/leads/[leadId]/revert
// Undo the account creation for a lead: hard-delete the parent + student accounts it
// created (orphan-aware), but KEEP the submitted response and reset the lead to
// "just submitted" so it can be processed again. Reversible-by-reprocessing.
export async function POST(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: leadCheck } = await (supabase as any)
    .from('form_leads')
    .select('id, school_id')
    .eq('id', leadId)
    .single();
  if (!leadCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, leadCheck.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  const result = await revertLeadAccounts(admin as any, leadId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  await logAudit(admin as any, {
    action: 'consent_lead_reverted',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    oldValues: { school_id: leadCheck.school_id },
    newValues: { deleted_students: result.deletedStudents, parent_deleted: result.parentDeleted },
  });

  return NextResponse.json({ ok: true, deletedStudents: result.deletedStudents, parentDeleted: result.parentDeleted });
}
