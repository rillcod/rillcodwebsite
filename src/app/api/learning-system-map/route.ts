import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildLearningSystemMapResponse } from '@/lib/learning/qaSystemOrder';

/**
 * Read-only machine export of the learning / QA system map.
 * Data is defined in `src/lib/learning/qaSystemOrder.ts` (same as the System map page).
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = buildLearningSystemMapResponse();
  return NextResponse.json({ data });
}
