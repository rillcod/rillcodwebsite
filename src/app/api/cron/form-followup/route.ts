import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { hasWhatsAppConsent } from '@/lib/whatsapp/consent';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminClient();
  const results = { followup1: 0, followup2: 0, drip2: 0, drip3: 0 };
  // Stop ~10s before the 60s serverless cap. Each stage de-dupes via logged
  // interactions, so the next scheduled run resumes the leads this run didn't reach.
  const DEADLINE = Date.now() + 50_000;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function progLabel(category: string | undefined): string {
    if (category === 'young_innovators') return 'Young Innovators';
    if (category === 'teen_developers')  return 'Teen Developers';
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
        contact_id:   contactId,
        contact_name: contactName,
        contact_type: 'form_lead',
        type,
        direction:    'outbound',
        content,
        created_at:   new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
  }

  // ── Check A — 24h WhatsApp follow-up ──────────────────────────────────────
  try {
    const { data: leads24h } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    for (const lead of (leads24h ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        const alreadySent = await hasInteraction(lead.contact_id, 'whatsapp_followup_1');
        if (alreadySent) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'there';
        const childName  = rd.child_name  || 'your child';
        const prog       = progLabel(rd.program_category);
        const phone      = rd.parent_whatsapp;
        if (!phone?.trim() || !hasWhatsAppConsent(rd)) continue;

        const msg = `Hi ${parentName}! 👋 Just checking in — have you had a chance to review Rillcod's coding programmes for ${childName}? We'd love to welcome them to the ${prog} class! Reply here or call +234 811 660 0091`;
        const delivery = await enqueueWhatsApp(sb, { phone, messageBody: msg, sourceType: 'whatsapp_followup_1', sourceId: lead.id, idempotencyKey: `followup-1:${lead.id}` });
        if (!delivery.queued) continue;
        await logInteraction(lead.contact_id, parentName, 'whatsapp_followup_1', `WhatsApp follow-up 1 queued for ${parentName} for ${childName} (${prog}).`);
        results.followup1++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  // ── Check B — 72h staff reminder WhatsApp ─────────────────────────────────
  try {
    const { data: leads72h } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

    for (const lead of (leads72h ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        const alreadySent = await hasInteraction(lead.contact_id, 'whatsapp_followup_2');
        if (alreadySent) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'there';
        const childName  = rd.child_name  || 'your child';
        const prog       = progLabel(rd.program_category);
        const phone      = rd.parent_whatsapp;
        if (!phone?.trim() || !hasWhatsAppConsent(rd)) continue;

        const msg = `Hi ${parentName}! 🚀 ${childName}'s spot in our ${prog} programme is still available. Spaces are limited — secure their place today! Call: +234 811 660 0091 or reply here.`;
        const delivery = await enqueueWhatsApp(sb, { phone, messageBody: msg, sourceType: 'whatsapp_followup_2', sourceId: lead.id, idempotencyKey: `followup-2:${lead.id}` });
        if (!delivery.queued) continue;
        await logInteraction(lead.contact_id, parentName, 'whatsapp_followup_2', `WhatsApp follow-up 2 queued for ${parentName} for ${childName} (${prog}).`);
        results.followup2++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  // ── Check C — Day 3 email drip ────────────────────────────────────────────
  try {
    const { data: leads3d } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, email, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      .not('email', 'is', null);

    for (const lead of (leads3d ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        const alreadySent = await hasInteraction(lead.contact_id, 'email_drip_2');
        if (alreadySent) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'Parent/Guardian';
        const childName  = rd.child_name  || 'your child';
        const prog       = progLabel(rd.program_category);
        const toEmail    = (rd.parent_email || lead.email || '').trim();
        if (!toEmail?.includes('@')) continue;

        const isYoung = rd.program_category === 'young_innovators';
        const programmeDetails = isYoung
          ? `<strong>Young Innovators (Ages 5–10)</strong> covers Scratch, block coding, and fun creative projects — designed to spark curiosity and build foundational computational thinking.`
          : `<strong>Teen Developers (Ages 11–19)</strong> covers Python, web development (HTML/CSS/JS), and real-world projects — building skills for today's tech economy.`;

        const bodyHtml = `
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">
            Dear <strong style="color:#fff;">${parentName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
            We wanted to share a little more about what <strong style="color:#fff;">${childName}</strong> can expect from the <strong style="color:#fff;">${prog}</strong> programme at Rillcod Technologies.
          </p>
          <div style="background:#1c1e22;border-left:3px solid #f59e0b;padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 8px;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Programme Overview</p>
            <p style="margin:0;font-size:14px;color:#d4d4d8;line-height:1.65;">${programmeDetails}</p>
          </div>
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Class Format</p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#d4d4d8;font-size:14px;line-height:1.8;">
            <li>Small groups for personalised attention</li>
            <li>Hands-on, project-based learning every session</li>
            <li>Weekly progress updates for parents</li>
            <li>Certificates awarded on completion</li>
          </ul>
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
            We'd love to confirm <strong style="color:#fff;">${childName}</strong>'s spot — reply to this email or call <strong style="color:#fff;">+234 811 660 0091</strong> and we'll get them started!
          </p>
        `;

        const html = buildRillcodTransactionalEmailHtml({
          title:    `${childName}'s place at Rillcod — What to expect`,
          bodyHtml,
          cta:      { href: 'https://rillcod.com', label: 'Learn More', color: '#f59e0b' },
          footerNote: 'Reply to this email or call +234 811 660 0091 to confirm your child\'s placement.',
        });

        await notificationsService.sendEmail('system', {
          to: toEmail,
          subject: `${childName}'s place at Rillcod — What to expect`,
          html,
        });

        await logInteraction(lead.contact_id, parentName, 'email_drip_2', `Day-3 programme details email sent to ${parentName} for ${childName} (${prog}).`);
        results.drip2++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  // ── Check D — Day 7 "last chance" email ───────────────────────────────────
  try {
    const { data: leads7d } = await (sb as any)
      .from('form_leads')
      .select('id, contact_id, email, response_data')
      .eq('status', 'new')
      .lt('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('email', 'is', null);

    for (const lead of (leads7d ?? [])) {
      if (Date.now() > DEADLINE) break;
      try {
        if (!lead.contact_id) continue;
        const alreadySent = await hasInteraction(lead.contact_id, 'email_drip_3');
        if (alreadySent) continue;

        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const parentName = rd.parent_name || 'Parent/Guardian';
        const childName  = rd.child_name  || 'your child';
        const prog       = progLabel(rd.program_category);
        const toEmail    = (rd.parent_email || lead.email || '').trim();
        if (!toEmail?.includes('@')) continue;

        const bodyHtml = `
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">
            Dear <strong style="color:#fff;">${parentName}</strong>,
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
            A week ago, you registered <strong style="color:#fff;">${childName}</strong> for the <strong style="color:#fff;">${prog}</strong> programme at Rillcod Technologies. We haven't been able to reach you yet, so we wanted to send one final note.
          </p>
          <div style="background:#1c1e22;border:1px solid #ef4444;border-left:4px solid #ef4444;padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 6px;font-size:10px;color:#ef4444;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">⚠️ Limited Spots Remaining</p>
            <p style="margin:0;font-size:14px;color:#d4d4d8;line-height:1.65;">Our new term is starting soon and spaces in the <strong style="color:#fff;">${prog}</strong> class are filling up fast. We'd hate for ${childName} to miss out.</p>
          </div>
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
            If you're still interested, please reach out today — simply reply to this email or call <strong style="color:#fff;">+234 811 660 0091</strong>. Our team will personally guide you through the next steps.
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
            If your plans have changed, no worries at all — we'll keep your details on file for future terms.
          </p>
          <p style="margin:0;font-size:14px;color:#71717a;">
            Warm regards,<br/>
            <strong style="color:#d4d4d8;">The Rillcod Technologies Team</strong>
          </p>
        `;

        const html = buildRillcodTransactionalEmailHtml({
          title:    `Last chance: ${childName}'s registration at Rillcod`,
          bodyHtml,
          cta:      { href: 'tel:+2348116600091', label: 'Call Us Now', color: '#ef4444' },
          footerNote: 'This is our final follow-up. Reply to this email or call +234 811 660 0091.',
        });

        await notificationsService.sendEmail('system', {
          to: toEmail,
          subject: `Last chance: ${childName}'s registration at Rillcod`,
          html,
        });

        await logInteraction(lead.contact_id, parentName, 'email_drip_3', `Day-7 last-chance email sent to ${parentName} for ${childName} (${prog}).`);
        results.drip3++;
      } catch { /* continue */ }
    }
  } catch { /* non-fatal */ }

  // ── Close expired forms ───────────────────────────────────────────────────
  let expiredClosed = 0;
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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
