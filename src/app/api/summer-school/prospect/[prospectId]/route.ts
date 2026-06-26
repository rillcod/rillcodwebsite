import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { cascadeDeleteProspect } from '@/lib/admin/cascade-delete';

export const dynamic = 'force-dynamic';
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// DELETE /api/summer-school/prospect/[prospectId]
// Staff: HARD CASCADE delete a summer applicant — the prospect row, and (when it was
// already onboarded) the student account it produced plus an orphaned parent account.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await context.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const result = await cascadeDeleteProspect(admin() as any, prospectId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, deletedStudent: result.deletedStudent, parentDeleted: result.parentDeleted });
}
