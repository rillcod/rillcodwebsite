import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { healUnassignedStudents } from '@/lib/classes/heal-unassigned';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminDb = createAdminClient();
    const result = await healUnassignedStudents(adminDb);

    await logAudit(adminDb as any, {
      action: 'heal_unassigned_student_classes',
      actorId: user.id,
      resourceType: 'class_placement',
      newValue: `Auto-placed ${result.healedCount} unassigned student(s)`,
      newValues: result as unknown as Record<string, unknown>,
    });

    return NextResponse.json({
      success: true,
      message: `Class Healer completed. Auto-placed ${result.healedCount} unassigned student(s).`,
      result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Class Healer failed' }, { status: 500 });
  }
}
