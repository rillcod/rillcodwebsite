import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const VALID_STATUSES = ['new', 'contacted', 'enrolled', 'lost'] as const;

// PATCH /api/consent-forms/leads/bulk-status
// Body: { leadIds: string[], status: 'new'|'contacted'|'enrolled'|'lost' }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { leadIds, status } = body as { leadIds?: string[]; status?: string };

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: 'leadIds must be a non-empty array' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (leadIds.length > 200) {
    return NextResponse.json({ error: 'Cannot update more than 200 leads at once' }, { status: 400 });
  }

  const sb = adminClient();

  // Scope check — non-admins can only touch their school's leads
  if (profile.role !== 'admin') {
    const { data: leads } = await (sb as any)
      .from('form_leads').select('id, school_id').in('id', leadIds);
    const forbidden = (leads ?? []).some((l: any) => l.school_id !== profile.school_id);
    if (forbidden) return NextResponse.json({ error: 'Forbidden: one or more leads belong to another school' }, { status: 403 });
  }

  const { error } = await (sb as any)
    .from('form_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', leadIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated: leadIds.length });
}
