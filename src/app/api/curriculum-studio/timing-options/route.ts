import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'School timing is managed by the Academic Office.' }, { status: 403 });
  }
  const db: any = createAdminClient();
  const [{ data: assignments }, { data: classes }, { data: schedules }] = await Promise.all([
    db.from('academic_curriculum_adoptions')
      .select('id, school_id, course_id, release_id, academic_session, schools(name), courses(title, program_id), release:academic_curriculum_releases(title, audience_label)')
      .eq('status', 'active')
      .order('adopted_at', { ascending: false }),
    db.from('classes').select('id, name, school_id, program_id, status').eq('status', 'active').order('name'),
    db.from('academic_curriculum_delivery_schedules')
      .select('*, schools(name), classes(name), courses(title), release:academic_curriculum_releases(title, audience_label)')
      .eq('status', 'active')
      .order('updated_at', { ascending: false }),
  ]);
  return NextResponse.json({ data: { assignments: assignments ?? [], classes: classes ?? [], schedules: schedules ?? [] } });
}

