import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyticsService } from '@/services/analytics.service';
import { AppError } from '@/lib/errors';

// GET /api/analytics/at-risk?school_id=...&class_id=...
// Returns at-risk students with triggered_signals (Req 5)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('school_id') ?? profile.school_id;
  const classId = searchParams.get('class_id') ?? undefined;

  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

  try {
    const data = await analyticsService.getAtRiskStudents(schoolId, classId);
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
