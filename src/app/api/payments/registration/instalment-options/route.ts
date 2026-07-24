import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** GET /api/payments/registration/instalment-options?program_id=uuid */
export async function GET(req: Request) {
  const programIdParam = new URL(req.url).searchParams.get('program_id')?.trim() || null;
  const supabase = adminClient();

  let resolvedProgramId = programIdParam;
  if (!resolvedProgramId) {
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'default_registration_program_id')
      .maybeSingle();
    const raw = setting?.value;
    resolvedProgramId =
      typeof raw === 'string' && raw.trim()
        ? raw.trim()
        : raw && typeof raw === 'object' && 'id' in (raw as object)
          ? String((raw as { id?: string }).id || '').trim() || null
          : null;
  }

  if (!resolvedProgramId) {
    return NextResponse.json({
      resolvedProgramId: null,
      instalmentsEnabled: false,
      reason: 'no_program',
    });
  }

  const { data: program, error } = await supabase
    .from('programs')
    .select('id, instalments_enabled, price')
    .eq('id', resolvedProgramId)
    .maybeSingle();

  if (error || !program) {
    return NextResponse.json({
      resolvedProgramId,
      instalmentsEnabled: false,
      reason: 'program_not_found',
    });
  }

  return NextResponse.json({
    resolvedProgramId: program.id,
    instalmentsEnabled: Boolean(program.instalments_enabled),
    programPrice: program.price ?? null,
  });
}
