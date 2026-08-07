/**
 * POST /api/admin/academics/sync-plans
 *
 * Admin write-path: Scans all active classes that have an adopted curriculum release for
 * their school and course, and creates/updates a published lesson_plans row for any class
 * currently lacking one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { instantiatePlansFromAdoptions } from '@/lib/academic/plan-from-release';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.is_deleted || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only administrators can run the plan sync.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const classIds = Array.isArray(body.class_ids) ? body.class_ids : undefined;
  const courseId = typeof body.course_id === 'string' ? body.course_id : undefined;
  const offeringId = typeof body.offering_id === 'string' ? body.offering_id : undefined;
  const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined;
  const forceRefresh = body.force_refresh === true;

  try {
    const report = await instantiatePlansFromAdoptions(db, { classIds, courseId, offeringId, limit, forceRefresh });
    return NextResponse.json({
      success: true,
      report,
      message: `Scanned ${report.scanned} classes. Created/updated ${report.created} teaching plans from adopted curriculum releases (${report.skipped} skipped).`,
    });
  } catch (error: any) {

    return NextResponse.json({ error: error.message ?? 'Failed to sync plans from adoptions.' }, { status: 500 });
  }
}
