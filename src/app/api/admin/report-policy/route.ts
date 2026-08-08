import { NextResponse } from 'next/server';
import { getSchoolReportActor } from '@/lib/school-reports/access';
import { loadSchoolReportPolicy, normalizeSchoolReportPolicy, SCHOOL_REPORT_POLICY_KEY } from '@/lib/school-reports/report-policy';
import { logAudit } from '@/lib/audit/log';

export async function GET() {
  const actor = await getSchoolReportActor();
  if (!actor || actor.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ policy: await loadSchoolReportPolicy(actor.admin) });
}

export async function PUT(request: Request) {
  const actor = await getSchoolReportActor();
  if (!actor || actor.profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const policy = normalizeSchoolReportPolicy((await request.json()).policy);
  const { error } = await actor.admin.from('system_settings').upsert({
    setting_key: SCHOOL_REPORT_POLICY_KEY,
    setting_value: JSON.stringify(policy),
    description: 'Central policy for school report calculations, display, finance, learning phases and official signatory.',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'setting_key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(actor.admin, {
    action: 'update_school_report_policy',
    actorId: actor.user.id,
    resourceType: 'system_setting',
    resourceId: SCHOOL_REPORT_POLICY_KEY,
    tableName: 'system_settings',
    newValue: 'Updated the central school report policy',
    newValues: { policy },
  });
  return NextResponse.json({ policy });
}
