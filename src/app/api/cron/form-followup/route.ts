import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { hasWhatsAppConsent } from '@/lib/whatsapp/consent';
import {
  buildFormFollowupWhatsAppWeek1,
  buildFormFollowupWhatsAppWeek3,
} from '@/lib/communication/parent-whatsapp-templates';
import { loadOfficeAutomationControls } from '@/lib/communication/automation-controls';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Monitored: reached only through onboarding-sweep's daily fan-out.
export async function GET(req: NextRequest) { return runMonitoredCron('form-followup', cronInterval('form-followup'), () => handle(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('form-followup', cronInterval('form-followup'), () => handle(req)); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminClient();
  try {
    const controls = await loadOfficeAutomationControls(sb as any);
    if (!controls.marketing_enabled || !controls.form_followup_enabled) {
      return NextResponse.json({ success: true, disabled: true, reason: !controls.marketing_enabled ? 'marketing_master_switch' : 'form_followup_switch' });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Controls unavailable' }, { status: 503 });
  }

  const results = { followup1: 0, followup2: 0 };
  const DEADLINE = Date.now() + 50_000;

  function progLabel(category: string | undefined): string {
    if (category === 'young_innovators') return 'Young Innovators';
    if (category === 'teen_developers') return 'Teen Developers';
    return category || 'coding programme';
  }

  async function hasInteraction(contactId: string, type: string): Promise<boolean> {
    try {
      const { data } = await (sb as any)
        .from('crm_interactions')
        .select('id')
        .eq('contact_id', contactId)
        .eq('type', type)
        .maybeSingle();
      return !!data;
    } catch {
      return false;
    }
  }

  async function logInteraction(contactId: string, contactName: string, type: string, content: string) {
    try {
      await (sb as any).from('crm_interactions').insert({
        contact_id: contactId,
        contact_name: contactName,
        contact_type: 'form_lead',
        type,
        direction: 'outbound',
        content,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
  }

  // Week 1 WhatsApp — emails handled by lead-nurture cron (paced, not daily).
  try {
    const { data: leads7d } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    for (const lead of (leads7d ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        if (await hasInteraction(lead.contact_id, 'whatsapp_followup_1')) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'there';
        const childName = rd.child_name || 'your child';
        const prog = progLabel(rd.program_category);
        const phone = rd.parent_whatsapp;
        if (!phone?.trim() || !hasWhatsAppConsent(rd)) continue;

        const msg = buildFormFollowupWhatsAppWeek1({ parentName, childName, programLabel: prog });
        const delivery = await enqueueWhatsApp(sb, { phone, messageBody: msg, sourceType: 'whatsapp_followup_1', sourceId: lead.id, idempotencyKey: `followup-1:${lead.id}` });
        if (!delivery.queued) continue;
        await logInteraction(lead.contact_id, parentName, 'whatsapp_followup_1', `WhatsApp week-1 for ${childName} (${prog}).`);
        results.followup1++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  // Week 3 WhatsApp — mentions Summer School and term programmes.
  try {
    const { data: leads21d } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString());

    for (const lead of (leads21d ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        if (await hasInteraction(lead.contact_id, 'whatsapp_followup_2')) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'there';
        const childName = rd.child_name || 'your child';
        const prog = progLabel(rd.program_category);
        const phone = rd.parent_whatsapp;
        if (!phone?.trim() || !hasWhatsAppConsent(rd)) continue;

        const msg = buildFormFollowupWhatsAppWeek3({ parentName, childName, programLabel: prog });
        const delivery = await enqueueWhatsApp(sb, { phone, messageBody: msg, sourceType: 'whatsapp_followup_2', sourceId: lead.id, idempotencyKey: `followup-2:${lead.id}` });
        if (!delivery.queued) continue;
        await logInteraction(lead.contact_id, parentName, 'whatsapp_followup_2', `WhatsApp week-3 for ${childName} (${prog}).`);
        results.followup2++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  let expiredClosed = 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: expired } = await (sb as any)
      .from('consent_forms')
      .select('id')
      .eq('is_public', true)
      .lte('due_date', today);
    for (const f of (expired ?? [])) {
      if (Date.now() > DEADLINE) break;
      await (sb as any).from('consent_forms').update({ is_public: false }).eq('id', f.id);
      expiredClosed++;
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ sent: results, expiredClosed });
}
