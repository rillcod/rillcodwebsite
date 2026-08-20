import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { scanPromotionDueForSchools } from '@/lib/classes/school-session-promotion';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

async function callerSchoolIds(admin: ReturnType<typeof adminClient>, caller: Caller): Promise<string[]> {
  if (caller.role === 'school' && caller.school_id) return [caller.school_id];
  const { data } = await admin.from('schools').select('id').eq('is_active', true);
  return (data ?? []).map((s: { id: string }) => s.id);
}

/** GET /api/classes/promotion-due — hide periodic tool until exit-grade learners exist. */
export async function GET() {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ show_menu: false, total_due: 0, schools: [] });

  const admin = adminClient();
  const schoolIds = await callerSchoolIds(admin, caller);
  if (!schoolIds.length) {
    return NextResponse.json({ show_menu: false, total_due: 0, schools: [] });
  }

  const snapshot = await scanPromotionDueForSchools(admin, schoolIds);
  return NextResponse.json(snapshot);
}
