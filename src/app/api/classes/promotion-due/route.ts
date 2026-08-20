import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { scanPromotionDueForSchools } from '@/lib/classes/school-session-promotion';
import { schoolPromotionSettingsKey } from '@/lib/progression/promotion-settings';
import { logAudit } from '@/lib/audit/log';

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

  try {
    const snapshot = await scanPromotionDueForSchools(admin, schoolIds);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: 'Promotion policy is unavailable. No promotion preview was generated.' },
      { status: 503 },
    );
  }
}

/** Persist the Young → Teen exit point for one school. */
export async function PUT(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const schoolId =
    caller.role === 'school'
      ? caller.school_id
      : typeof body.school_id === 'string'
        ? body.school_id
        : null;
  const exitGrade = body.young_to_teen_exit_grade;

  if (!schoolId) return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
  if (exitGrade !== 'Basic 5' && exitGrade !== 'Basic 6') {
    return NextResponse.json(
      { error: 'Young-to-Teen exit grade must be Basic 5 or Basic 6.' },
      { status: 400 },
    );
  }

  const admin = adminClient();
  const allowed = await callerSchoolIds(admin, caller);
  if (!allowed.includes(schoolId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { error } = await admin.from('app_settings').upsert(
    {
      key: schoolPromotionSettingsKey(schoolId),
      value: JSON.stringify({ young_to_teen_exit_grade: exitGrade }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin, {
    actorId: caller.id,
    action: 'update_school_promotion_policy',
    resourceType: 'school',
    resourceId: schoolId,
    tableName: 'app_settings',
    newValues: { young_to_teen_exit_grade: exitGrade },
  });

  try {
    const snapshot = await scanPromotionDueForSchools(admin, [schoolId]);
    return NextResponse.json({ success: true, snapshot });
  } catch {
    return NextResponse.json({
      success: true,
      snapshot: null,
      warning: 'Policy saved, but the due-learner scan is temporarily unavailable.',
    });
  }
}
