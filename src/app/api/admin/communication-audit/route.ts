/**
 * GET /api/admin/communication-audit
 *
 * Live snapshot of marketing gates, automation switches, and lead consent coverage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadOfficeAutomationControls } from '@/lib/communication/automation-controls';
import { hasLeadEmailMarketingConsent } from '@/lib/marketing/consent';
import { hasWhatsAppConsent } from '@/lib/whatsapp/consent';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_active || profile.is_deleted || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const controls = await loadOfficeAutomationControls(admin);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: recentLeads },
    { count: enrolledNoPortal },
    { count: paidPendingNoPortal },
    { count: credFailed },
    { count: credStuckCreated },
  ] = await Promise.all([
    admin.from('form_leads')
      .select('id, status, response_data, matched_parent_id, submitted_at')
      .gte('submitted_at', since30d)
      .order('submitted_at', { ascending: false })
      .limit(500),
    admin.from('form_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'enrolled')
      .is('matched_parent_id', null),
    admin.from('students')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('user_id', null)
      .not('registration_payment_at', 'is', null),
    admin.from('registration_results')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),
    admin.from('registration_results')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'created'),
  ]);

  let emailOptIn = 0;
  let waOptIn = 0;
  let noOptIn = 0;
  for (const lead of recentLeads ?? []) {
    const rd = (lead.response_data ?? {}) as Record<string, unknown>;
    const hasEmail = hasLeadEmailMarketingConsent(rd);
    const hasWa = hasWhatsAppConsent(rd);
    if (hasEmail) emailOptIn++;
    if (hasWa) waOptIn++;
    if (!hasEmail && !hasWa) noOptIn++;
  }

  const marketingBlocked = !controls.marketing_enabled
    || !controls.form_followup_enabled
    || !controls.lead_nurture_enabled;

  const recommendations: string[] = [];
  if (!controls.marketing_enabled) {
    recommendations.push('Turn ON marketing_enabled in Office → Automation Controls.');
  }
  if (noOptIn > (recentLeads?.length ?? 0) * 0.8) {
    recommendations.push('Most recent leads lack marketing opt-in — ensure consent form shows optional email/WhatsApp checkboxes.');
  }
  if ((enrolledNoPortal ?? 0) > 0) {
    recommendations.push(`${enrolledNoPortal} enrolled leads have no parent portal — staff must Create Portal Account.`);
  }
  if ((paidPendingNoPortal ?? 0) > 0) {
    recommendations.push(`${paidPendingNoPortal} paid students still pending onboarding — onboarding-sweep heals these each run.`);
  }
  if ((credFailed ?? 0) > 0 || (credStuckCreated ?? 0) > 0) {
    recommendations.push(`${credFailed ?? 0} failed + ${credStuckCreated ?? 0} stuck credential vault rows — check onboarding-sweep and Office desk.`);
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    automationControls: controls,
    marketingAutomationsActive: controls.marketing_enabled && controls.form_followup_enabled && controls.lead_nurture_enabled,
    recentLeads30d: {
      total: recentLeads?.length ?? 0,
      emailMarketingOptIn: emailOptIn,
      whatsappOptIn: waOptIn,
      neitherOptIn: noOptIn,
      optInRatePct: recentLeads?.length
        ? Math.round((emailOptIn / recentLeads.length) * 100)
        : 0,
    },
    gaps: {
      enrolledLeadsWithoutPortal: enrolledNoPortal ?? 0,
      paidStudentsNotOnboarded: paidPendingNoPortal ?? 0,
      credentialVaultFailed: credFailed ?? 0,
      credentialVaultPending: credStuckCreated ?? 0,
    },
    marketingBlocked,
    recommendations,
  });
}
