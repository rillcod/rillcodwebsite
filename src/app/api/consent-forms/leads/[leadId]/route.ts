import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { notifyEnrolledConsentLeads } from '@/lib/consent/lead-notifications';
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
          const { promoteBookLeadToPortalIfLinked } = await import('@/lib/crm/contact-book');
          const parentName = rd.parent_name || 'Parent';
          const promo = await promoteBookLeadToPortalIfLinked(sb as any, {
            bookId: lead.contact_id,
            email: rd.parent_email || lead.email,
            phone: rd.parent_whatsapp,
          });
          const crmContactId = promo.portalId || lead.contact_id;
          const contactType = promo.portalId ? 'parent' : 'form_lead';
          await upsertCrmPipeline(sb as any, {
            contactId: crmContactId,
            contactName: parentName,
            contactType,
            stage: 'won',
            promoteOnly: true,
          });
          await insertCrmInteraction(sb as any, {
            contactId: crmContactId,
            contactName: parentName,
            contactType,
            type: 'enrolled',
            direction: 'internal',
            content: `Student enrolled: ${rd.child_name || 'Child'} — ${progLabel}. Marked enrolled by staff.`,
          });
        }

        // Step 2 — Parent enrolled notification (email + WhatsApp, non-credential)
        await notifyEnrolledConsentLeads(sb as any, [leadId]);
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
