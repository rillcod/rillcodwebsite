import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let random = '';
  for (let i = 0; i < 8; i++) random += chars[Math.floor(Math.random() * chars.length)];
  return `Rc@${random}`;
}

// POST /api/consent-forms/leads/[leadId]/create-portal-account
// Creates a parent portal account from a form lead, sends credentials via WhatsApp/email.
export async function POST(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();

  // Fetch lead
  const { data: lead, error: leadErr } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, email, response_data, matched_student_id, matched_parent_id')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rd = (lead.response_data ?? {}) as Record<string, string>;
  const parentEmail = (rd.parent_email || lead.email || '').trim().toLowerCase();
  const parentName  = (rd.parent_name || '').trim() || 'Parent/Guardian';
  const parentPhone = (rd.parent_whatsapp || rd.parent_phone || '').trim();
  const childName   = (rd.child_name || '').trim();

  if (!parentEmail || !parentEmail.includes('@')) {
    return NextResponse.json({ error: 'No valid email address on this lead' }, { status: 400 });
  }

  // Check if portal account already exists
  const { data: existing } = await (sb as any)
    .from('portal_users')
    .select('id, email, full_name')
    .eq('email', parentEmail)
    .maybeSingle();

  if (existing) {
    // Account exists — still link student if needed
    if (lead.matched_student_id && existing.id) {
      await syncExplicitParentStudentLink(sb as any, existing.id, lead.matched_student_id);
    }
    if (!lead.matched_parent_id) {
      await (sb as any).from('form_leads').update({ matched_parent_id: existing.id }).eq('id', leadId);
    }
    return NextResponse.json({ success: true, alreadyExisted: true, parentId: existing.id });
  }

  // Generate temp password and create auth user
  const tempPassword = generateTempPassword();

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: parentEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parentName, role: 'parent' },
  });

  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Failed to create auth user' }, { status: 500 });
  }

  const parentId = created.user.id;

  // Upsert portal_users row
  await (sb as any).from('portal_users').upsert({
    id:        parentId,
    email:     parentEmail,
    full_name: parentName,
    role:      'parent',
    school_id: lead.school_id,
    phone:     parentPhone || null,
    is_active: true,
  });

  // Link student if matched
  if (lead.matched_student_id) {
    await syncExplicitParentStudentLink(sb as any, parentId, lead.matched_student_id);
  }

  // Update form_leads
  await (sb as any).from('form_leads').update({ matched_parent_id: parentId }).eq('id', leadId);

  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
  const loginUrl  = `${portalUrl}/login?type=parent&email=${encodeURIComponent(parentEmail)}&pw=${encodeURIComponent(tempPassword)}`;

  // Send credentials via WhatsApp
  if (parentPhone) {
    try {
      const waMsg = [
        `Hello ${parentName}! 👋`,
        `Your Rillcod Parent Portal account has been created.`,
        ``,
        `📧 Email: ${parentEmail}`,
        `🔑 Temp Password: ${tempPassword}`,
        ``,
        `Tap to log in (email & password pre-filled):`,
        loginUrl,
        ``,
        `Please change your password after first login.`,
        `Questions? Call +234 811 660 0091`,
      ].join('\n');
      await sendWhatsApp(parentPhone, waMsg);
    } catch { /* non-fatal */ }
  }

  // Send credentials via email
  try {
    const bodyHtml = `
      <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">
        Dear <strong style="color:#fff;">${parentName}</strong>,
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;line-height:1.65;">
        Your Rillcod Parent Portal account has been created${childName ? ` for ${childName}` : ''}.
        Click the button below to log in — your email and password are already filled in for you.
      </p>
      <div style="background:#1c1e22;border-left:4px solid #10b981;padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 8px;font-size:10px;color:#10b981;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Your Login Details</p>
        <p style="margin:0 0 6px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">Email:</strong> ${parentEmail}</p>
        <p style="margin:0;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">Temporary Password:</strong> <span style="font-family:monospace;color:#f59e0b;font-size:15px;">${tempPassword}</span></p>
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
        Please change your password after your first login. Keep these details safe and do not share them.
      </p>
    `;
    const html = buildRillcodTransactionalEmailHtml({
      title:      'Your Rillcod Portal Account is Ready',
      bodyHtml,
      cta:        { href: loginUrl, label: 'Log In — Email & Password Pre-Filled', color: '#10b981' },
      footerNote: 'Rillcod Technologies · 26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City, Nigeria · +234 811 660 0091',
    });
    await notificationsService.sendEmail('system', {
      to:      parentEmail,
      subject: 'Your Rillcod Parent Portal Account Details',
      html,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, alreadyExisted: false, parentId, tempPassword, email: parentEmail });
}
