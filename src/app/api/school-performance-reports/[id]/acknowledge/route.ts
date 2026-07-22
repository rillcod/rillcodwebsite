import { NextRequest, NextResponse } from 'next/server';
import { getSchoolReportActor } from '@/lib/school-reports/access';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'school'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only the partner school or an administrator can acknowledge this report.' }, { status: 403 });
  }
  const { id } = await context.params;
  const { data: report } = await actor.admin.from('school_performance_reports').select('id,school_id,status').eq('id', id).maybeSingle();
  if (!report || report.status !== 'published') return NextResponse.json({ error: 'Published report not found.' }, { status: 404 });
  if (actor.profile.role === 'school' && actor.profile.school_id !== report.school_id) {
    return NextResponse.json({ error: 'This report belongs to another school.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || actor.profile.full_name || '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'Enter the receiving officer name.' }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await actor.admin.from('school_performance_reports').update({
    acknowledged_at: now,
    acknowledged_by: actor.profile.id,
    acknowledgement_name: name,
    acknowledgement_note: String(body.note || '').trim().slice(0, 500) || null,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ acknowledgedAt: now, name });
}
