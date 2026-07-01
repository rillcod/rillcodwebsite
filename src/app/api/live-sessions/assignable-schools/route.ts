import { NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds, requireLiveSessionUser } from '@/lib/live-sessions/authz';

// GET /api/live-sessions/assignable-schools
// The schools the caller may scope a new live session to:
//   - admin  → every school (an admin may also broadcast globally; that option is
//              added client-side since it's role-based, not data-based)
//   - teacher / other staff → only their assigned schools (teacher_schools)
//   - school → none (their session is auto-scoped to their own school server-side)
export async function GET() {
  const caller = await requireLiveSessionUser();
  if (!caller) return NextResponse.json({ schools: [] }, { status: 401 });
  if (['student', 'parent'].includes(caller.role ?? '')) {
    return NextResponse.json({ schools: [] }, { status: 403 });
  }

  const admin = createEngagementAdminClient();

  if (caller.role === 'admin') {
    const { data } = await admin.from('schools').select('id, name').order('name');
    return NextResponse.json({ schools: data ?? [] });
  }

  if (caller.role === 'school') {
    return NextResponse.json({ schools: [] });
  }

  // teacher / other staff — scoped strictly to the schools they're assigned to.
  const schoolIds = await getTeacherSchoolIds(admin as any, caller.id, caller.school_id);
  if (schoolIds.length === 0) return NextResponse.json({ schools: [] });
  const { data } = await admin
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)
    .order('name');
  return NextResponse.json({ schools: data ?? [] });
}
