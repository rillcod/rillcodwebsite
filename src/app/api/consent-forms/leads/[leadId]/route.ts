import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { cascadeDeleteLead } from '@/lib/admin/cascade-delete';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const VALID_STATUSES = ['new', 'contacted', 'enrolled', 'lost'] as const;

// PATCH /api/consent-forms/leads/[leadId] — staff: update lead status
export async function PATCH(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  // Verify the lead belongs to this staff member's school (admin sees all)
  const { data: leadCheck } = await (supabase as any)
    .from('form_leads')
    .select('id, school_id')
    .eq('id', leadId)
    .single();

  if (!leadCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, leadCheck.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (supabase as any)
    .from('form_leads')
    .update({ status })
    .eq('id', leadId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Enrollment automation ─────────────────────────────────────────────────
  if (status === 'enrolled') {
    const now = new Date().toISOString();

    // Step 1 — Advance CRM pipeline to enrolled
    try {
      const sb = adminClient();
      const { data: lead } = await (sb as any)
        .from('form_leads')
        .select('contact_id, response_data, school_id, email')
        .eq('id', leadId)
        .single();

      if (lead) {
        const rd = (lead.response_data ?? {}) as Record<string, string>;
        const progLabel =
          rd.program_category === 'young_innovators' ? 'Young Innovators (PRY)' :
          rd.program_category === 'teen_developers'  ? 'Teen Developers (SEC)'  :
          rd.program_category || 'coding programme';

        if (lead.contact_id) {
          const { upsertCrmPipeline, insertCrmInteraction } = await import('@/lib/crm/pipeline');
          const parentName = rd.parent_name || 'Parent';
          await upsertCrmPipeline(sb as any, {
            contactId: lead.contact_id,
            contactName: parentName,
            contactType: 'form_lead',
            stage: 'won',
            promoteOnly: true,
          });
          await insertCrmInteraction(sb as any, {
            contactId: lead.contact_id,
            contactName: parentName,
            contactType: 'form_lead',
            type: 'enrolled',
            direction: 'internal',
            content: `Student enrolled: ${rd.child_name || 'Child'} — ${progLabel}. Marked enrolled by staff.`,
          });
        }

        // Step 2 — WhatsApp enrollment confirmation to parent
        try {
          const parentWhatsapp = rd.parent_whatsapp;
          if (parentWhatsapp?.trim()) {
            const progShort =
              rd.program_category === 'young_innovators' ? 'Young Innovators' :
              rd.program_category === 'teen_developers'  ? 'Teen Developers'  :
              rd.program_category || 'coding';
            const waMsg = `Congratulations ${rd.parent_name || 'there'}! 🎊 ${rd.child_name || 'Your child'} is now enrolled in the ${progShort} programme at Rillcod Technologies!\n\n📅 You'll receive class schedule and onboarding details shortly.\n📞 Questions: +234 811 660 0091\n\nWelcome to the Rillcod family! 🚀`;
            await sendWhatsApp(parentWhatsapp, waMsg);
          }
        } catch { /* non-fatal */ }

        // Step 3 — Enrollment confirmation email to parent
        try {
          const toEmail = (rd.parent_email || lead.email || '').trim();
          if (toEmail?.includes('@')) {
            const progShort =
              rd.program_category === 'young_innovators' ? 'Young Innovators' :
              rd.program_category === 'teen_developers'  ? 'Teen Developers'  :
              rd.program_category || 'coding';
            const childName  = rd.child_name  || 'your child';
            const parentName = rd.parent_name || 'Parent/Guardian';
            const bodyHtml = `
              <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">
                Dear <strong style="color:#fff;">${parentName}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
                We are thrilled to officially welcome <strong style="color:#fff;">${childName}</strong> to the Rillcod Technologies family! Your child is now enrolled in the <strong style="color:#f59e0b;">${progShort}</strong> programme.
              </p>
              <div style="background:#1c1e22;border-left:4px solid #10b981;padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;">
                <p style="margin:0 0 8px;font-size:10px;color:#10b981;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">What happens next</p>
                <ul style="margin:0;padding-left:18px;color:#d4d4d8;font-size:14px;line-height:1.9;">
                  <li>Our team will send you the class schedule and onboarding details via WhatsApp shortly</li>
                  <li>Payment details (if applicable) will be shared in your onboarding message</li>
                  <li>You'll receive a portal login to track ${childName}'s progress</li>
                </ul>
              </div>
              <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
                For any questions, please don't hesitate to reach us at <strong style="color:#fff;">+234 811 660 0091</strong> or reply to this email.
              </p>
              <p style="margin:0;font-size:14px;color:#71717a;">
                Warm regards,<br/>
                <strong style="color:#d4d4d8;">The Rillcod Technologies Team</strong>
              </p>
            `;
            const html = buildRillcodTransactionalEmailHtml({
              title:      `Welcome to Rillcod, ${childName}! 🎉`,
              bodyHtml,
              cta:        { href: 'https://rillcod.com', label: 'Visit Our Portal', color: '#10b981' },
              footerNote: 'Rillcod Technologies · 26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City, Nigeria · +234 811 660 0091',
            });
            await notificationsService.sendEmail('system', {
              to:      toEmail,
              subject: `Welcome to Rillcod, ${childName}! 🎉`,
              html,
            });
          }
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ data });
}

// DELETE /api/consent-forms/leads/[leadId] — staff: HARD CASCADE delete a junk /
// discarded / duplicate lead AND every account uniquely created from it (matched/
// child students + the parent), leaving genuinely shared records intact.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: leadCheck } = await (supabase as any)
    .from('form_leads')
    .select('id, school_id')
    .eq('id', leadId)
    .single();

  if (!leadCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, leadCheck.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Service-role client so the cascade isn't blocked by RLS.
  const result = await cascadeDeleteLead(adminClient() as any, leadId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true, deletedStudents: result.deletedStudents, parentDeleted: result.parentDeleted });
}
