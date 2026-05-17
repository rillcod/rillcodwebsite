import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { buildFormLeadConfirmationEmail } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/public/consent-forms/[id] — fetch a public form (no auth required)
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error } = await sb
    .from('consent_forms')
    .select('id, title, body, form_type, due_date, school_id, schools(name)')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (error || !form) return NextResponse.json({ error: 'Form not found or not public' }, { status: 404 });
  return NextResponse.json({ data: form });
}

// POST /api/public/consent-forms/[id] — submit a public lead (no auth required)
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  // Verify form is still public
  const { data: form, error: formErr } = await sb
    .from('consent_forms')
    .select('id, title, school_id, form_type, is_public')
    .eq('id', id)
    .single();

  if (formErr || !form || !form.is_public) {
    return NextResponse.json({ error: 'Form not found or no longer accepting submissions' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { response_data = {}, child_current_school, email } = body;

  if (!response_data.child_name?.trim()) {
    return NextResponse.json({ error: 'Child name is required' }, { status: 400 });
  }

  // ── Fuzzy-match child_current_school against schools table ────────────────
  let matched_school_id: string | null = null;
  if (child_current_school?.trim()) {
    const { data: schoolMatch } = await sb
      .from('schools')
      .select('id, name')
      .ilike('name', `%${child_current_school.trim()}%`)
      .limit(1)
      .maybeSingle();
    matched_school_id = schoolMatch?.id ?? null;
  }

  // ── Insert lead ───────────────────────────────────────────────────────────
  const { data: lead, error: insertErr } = await sb
    .from('form_leads')
    .insert({
      form_id: id,
      school_id: form.school_id ?? null,
      matched_school_id,
      child_current_school: child_current_school?.trim() || null,
      email: email?.trim() || null,
      response_data,
    })
    .select()
    .single();

  if (insertErr) {
    // Duplicate email for same form — still return success so UX doesn't break
    if (insertErr.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // ── Send confirmation email to the submitter ──────────────────────────────
  const toEmail = email?.trim();
  if (toEmail && toEmail.includes('@')) {
    try {
      const schoolName = (form as any).schools?.name ?? 'Rillcod Technologies';
      const html = buildFormLeadConfirmationEmail({
        parentName:      response_data.parent_name || 'Parent/Guardian',
        childName:       response_data.child_name,
        programCategory: response_data.program_category,
        formTitle:       form.title,
        schoolName,
        formType:        form.form_type ?? 'general',
        appUrl:          process.env.NEXT_PUBLIC_APP_URL,
      });

      await notificationsService.sendEmail('system', {
        to: toEmail,
        subject: `✅ Registration Received — Rillcod Technologies`,
        html,
        fromName: 'Rillcod Technologies',
        replyTo: 'support@rillcod.com',
      });
    } catch {
      // Non-fatal — lead is saved even if email fails
    }
  }

  return NextResponse.json({ success: true, id: lead?.id });
}
