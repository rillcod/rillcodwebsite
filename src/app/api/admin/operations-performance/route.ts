import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE_SIZE = 1_000;
const MAX_ROWS_PER_SOURCE = 10_000;

/** Metrics must never silently use the first database page as the full month. */
async function loadAllSince(db: any, table: string, select: string, since: string) {
  const rows: any[] = [];
  for (let offset = 0; offset < MAX_ROWS_PER_SOURCE; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .gte('created_at', since)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} could not be loaded: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
  throw new Error(`${table} exceeds ${MAX_ROWS_PER_SOURCE.toLocaleString()} rows in the current reporting window; narrow the window before calculating metrics.`);
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient() as any;
  const { data: profile, error: profileError } = await db
    .from('portal_users')
    .select('role,is_active,is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (profile?.role !== 'admin' || !profile.is_active || profile.is_deleted) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [caseRows, deliveryRows, feedbackRows, campaignRows, outcomeRows, incidentRows] = await Promise.all([
      loadAllSince(db, 'communication_cases', 'id,status,created_at,first_response_due_at,first_responded_at,resolved_at,satisfaction_score,sensitivity,assigned_to', since),
      loadAllSince(db, 'communication_delivery_log', 'channel,status,created_at', since),
      loadAllSince(db, 'feedback', 'status,rating,satisfaction_score,resolution_minutes,created_at', since),
      loadAllSince(db, 'marketing_campaigns', '*', since),
      loadAllSince(db, 'customer_value_outcomes', 'outcome_type,score,created_at', since),
      loadAllSince(db, 'safeguarding_incidents', 'status,risk_level,created_at', since),
    ]);

    const responded = caseRows.filter((row: any) => row.first_responded_at && row.first_response_due_at);
    const withinSla = responded.filter((row: any) => new Date(row.first_responded_at) <= new Date(row.first_response_due_at)).length;
    const resolved = caseRows.filter((row: any) => row.resolved_at);
    const avgResolutionHours = resolved.length
      ? resolved.reduce((sum: number, row: any) => sum + Math.max(0, new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()), 0) / resolved.length / 3_600_000
      : 0;
    // Until provider status webhooks are live, provider-accepted `sent` counts alongside delivered/read.
    const successful = deliveryRows.filter((row: any) => ['sent', 'delivered', 'read'].includes(row.status)).length;
    const failed = deliveryRows.filter((row: any) => row.status === 'failed').length;
    const scores = [
      ...caseRows.map((row: any) => row.satisfaction_score),
      ...feedbackRows.map((row: any) => row.satisfaction_score),
      ...outcomeRows.map((row: any) => row.score),
    ].filter((score) => Number(score) > 0).map(Number);
    const totals = campaignRows.reduce((acc: any, row: any) => ({
      sent: acc.sent + Number(row.sent_count || 0),
      viewed: acc.viewed + Number(row.viewed_count || 0),
      converted: acc.converted + Number(row.conversion_count || 0),
      suppressed: acc.suppressed + Number(row.suppressed_count || 0),
    }), { sent: 0, viewed: 0, converted: 0, suppressed: 0 });

    return NextResponse.json({
      periodDays: 30,
      complete: true,
      metrics: {
        casesOpened: caseRows.length,
        casesResolved: resolved.length,
        activeCases: caseRows.filter((row: any) => !['resolved', 'closed'].includes(row.status)).length,
        unassignedCases: caseRows.filter((row: any) => !row.assigned_to && !['resolved', 'closed'].includes(row.status)).length,
        slaPercent: responded.length ? Math.round(withinSla / responded.length * 100) : 100,
        averageResolutionHours: Math.round(avgResolutionHours * 10) / 10,
        deliverySuccessPercent: deliveryRows.length ? Math.round(successful / deliveryRows.length * 100) : 100,
        deliveryFailures: failed,
        satisfactionAverage: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
        satisfactionResponses: scores.length,
        helpfulOutcomes: outcomeRows.filter((row: any) => ['helpful', 'resolved', 'retained', 'converted'].includes(row.outcome_type)).length,
        restrictedOpen: incidentRows.filter((row: any) => !['resolved', 'closed'].includes(row.status)).length,
        marketing: totals,
      },
      channelBreakdown: Object.entries(deliveryRows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.channel] = (acc[row.channel] || 0) + 1;
        return acc;
      }, {})),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Operations performance could not be calculated', complete: false },
      { status: 503 },
    );
  }
}
