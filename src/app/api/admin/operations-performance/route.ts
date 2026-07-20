import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('portal_users').select('role,is_active,is_deleted').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin' || !profile.is_active || profile.is_deleted) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [cases, deliveries, feedback, campaigns, outcomes, incidents] = await Promise.all([
    db.from('communication_cases').select('id,status,created_at,first_response_due_at,first_responded_at,resolved_at,satisfaction_score,sensitivity,assigned_to').gte('created_at', since),
    db.from('communication_delivery_log').select('channel,status,created_at').gte('created_at', since),
    db.from('feedback').select('status,rating,satisfaction_score,resolution_minutes,created_at').gte('created_at', since),
    db.from('marketing_campaigns').select('*').gte('created_at', since),
    db.from('customer_value_outcomes').select('outcome_type,score,created_at').gte('created_at', since),
    db.from('safeguarding_incidents').select('status,risk_level,created_at').gte('created_at', since),
  ]);
  const error = cases.error || deliveries.error || feedback.error || campaigns.error || outcomes.error || incidents.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const caseRows = cases.data ?? [];
  const responded = caseRows.filter((row: any) => row.first_responded_at && row.first_response_due_at);
  const withinSla = responded.filter((row: any) => new Date(row.first_responded_at) <= new Date(row.first_response_due_at)).length;
  const resolved = caseRows.filter((row: any) => row.resolved_at);
  const avgResolutionHours = resolved.length ? resolved.reduce((sum: number, row: any) => sum + Math.max(0, new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()), 0) / resolved.length / 3600000 : 0;
  const deliveryRows = deliveries.data ?? [];
  const delivered = deliveryRows.filter((row: any) => ['delivered', 'read'].includes(row.status)).length;
  const failed = deliveryRows.filter((row: any) => row.status === 'failed').length;
  const scores = [...caseRows.map((row: any) => row.satisfaction_score), ...(feedback.data ?? []).map((row: any) => row.satisfaction_score), ...(outcomes.data ?? []).map((row: any) => row.score)].filter((score) => Number(score) > 0).map(Number);
  const campaignRows = campaigns.data ?? [];
  const totals = campaignRows.reduce((acc: any, row: any) => ({ sent: acc.sent + Number(row.sent_count || 0), viewed: acc.viewed + Number(row.viewed_count || 0), converted: acc.converted + Number(row.conversion_count || 0), suppressed: acc.suppressed + Number(row.suppressed_count || 0) }), { sent: 0, viewed: 0, converted: 0, suppressed: 0 });
  return NextResponse.json({
    periodDays: 30,
    metrics: {
      casesOpened: caseRows.length,
      casesResolved: resolved.length,
      activeCases: caseRows.filter((row: any) => !['resolved', 'closed'].includes(row.status)).length,
      unassignedCases: caseRows.filter((row: any) => !row.assigned_to && !['resolved', 'closed'].includes(row.status)).length,
      slaPercent: responded.length ? Math.round(withinSla / responded.length * 100) : 100,
      averageResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      deliverySuccessPercent: deliveryRows.length ? Math.round(delivered / deliveryRows.length * 100) : 100,
      deliveryFailures: failed,
      satisfactionAverage: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
      satisfactionResponses: scores.length,
      helpfulOutcomes: (outcomes.data ?? []).filter((row: any) => ['helpful', 'resolved', 'retained', 'converted'].includes(row.outcome_type)).length,
      restrictedOpen: (incidents.data ?? []).filter((row: any) => !['resolved', 'closed'].includes(row.status)).length,
      marketing: totals,
    },
    channelBreakdown: Object.entries(deliveryRows.reduce((acc: Record<string, number>, row: any) => { acc[row.channel] = (acc[row.channel] || 0) + 1; return acc; }, {})),
  });
}
