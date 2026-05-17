import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['new', 'contacted', 'enrolled', 'lost'] as const;

// PATCH /api/consent-forms/leads/[leadId] — staff: update lead status
export async function PATCH(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
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

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  // Verify the lead belongs to this staff member's school (admin sees all)
  const { data: lead } = await (supabase as any)
    .from('form_leads')
    .select('id, school_id')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (supabase as any)
    .from('form_leads')
    .update({ status })
    .eq('id', leadId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
