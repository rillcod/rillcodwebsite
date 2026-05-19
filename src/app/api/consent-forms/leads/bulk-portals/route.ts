import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

const MAX_LEADS = 50;

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

// POST /api/consent-forms/leads/bulk-portals
// Body: { leadIds: string[] } — max 50
// Creates parent portal accounts in bulk for the given leads.
// Skips leads that already have matched_parent_id or have no email.
// Sends credentials via WhatsApp + email and logs creation in response_data.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id, full_name').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const staffName = (profile as unknown as { full_name: string | null }).full_name ?? 'Staff';

  let body: { leadIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { leadIds } = body;
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: 'leadIds must be a non-empty array' }, { status: 400 });
  }
  if (leadIds.length > MAX_LEADS) {
    return NextResponse.json({ error: `Maximum ${MAX_LEADS} leads per request` }, { status: 400 });
  }

  const sb = adminClient();
  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');

  const { data: leads, error: leadsErr } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, email, response_data, matched_student_id, matched_parent_id')
    .in('id', leadIds);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  const results = {
    created: 0,
    skipped: 0,
    no_email: 0,
    errors: [] as Array<{ leadId: string; error: string }>,
    total: (leads ?? []).length,
    log: [] as Array<{ leadId: string; email: string; name: string; channels: string[]; createdAt: string }>,
  };

  for (const lead of (leads ?? [])) {
    if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
      results.errors.push({ leadId: lead.id, error: 'Forbidden: lead belongs to a different school' });
      continue;
    }

    if (lead.matched_parent_id) {
      results.skipped++;
      continue;
    }

    const rd = (lead.response_data ?? {}) as Record<string, unknown>;
    const str = (k: string) => ((rd[k] as string) ?? '').trim();
    const parentEmail = (str('parent_email') || (lead.email as string ?? '')).toLowerCase().trim();
    const parentName  = str('parent_name') || 'Parent/Guardian';
    const parentPhone = str('parent_whatsapp') || str('parent_phone');
    const childName   = str('child_name');
    const childGender = str('child_gender') || null;

    if (!parentEmail || !parentEmail.includes('@')) {
      results.no_email++;
      continue;
    }

    try {
      const { data: existing } = await (sb as any)
        .from('portal_users')
        .select('id, email')
        .eq('email', parentEmail)
        .maybeSingle();

      if (existing) {
        if (lead.matched_student_id && existing.id) {
          await syncExplicitParentStudentLink(sb as any, existing.id, lead.matched_student_id);
        }
        await (sb as any).from('form_leads')
          .update({ matched_parent_id: existing.id })
          .eq('id', lead.id);
        results.skipped++;
        continue;
      }

      const tempPassword = generateTempPassword();
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: parentEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: parentName, role: 'parent' },
      });

      if (createErr || !created?.user) {
        results.errors.push({ leadId: lead.id, error: createErr?.message ?? 'Failed to create auth user' });
        continue;
      }

      const parentId = created.user.id;

      await (sb as any).from('portal_users').upsert({
        id:        parentId,
        email:     parentEmail,
        full_name: parentName,
        role:      'parent',
        school_id: lead.school_id,
        phone:     parentPhone || null,
        is_active: true,
      });

      if (lead.matched_student_id) {
        await syncExplicitParentStudentLink(sb as any, parentId, lead.matched_student_id);
        await (sb as any).from('students').update({
          parent_email: parentEmail,
          parent_name:  parentName,
          parent_phone: parentPhone || null,
          ...(childGender ? { gender: childGender } : {}),
          updated_at:   new Date().toISOString(),
        }).eq('id', lead.matched_student_id);
      }

      const loginUrl = `${portalUrl}/login?type=parent&email=${encodeURIComponent(parentEmail)}&pw=${encodeURIComponent(tempPassword)}`;
      const channelsSent: string[] = [];
      const createdAt = new Date().toISOString();

      // Send WhatsApp credentials
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
          channelsSent.push('whatsapp');
        } catch { /* non-fatal */ }
      }

      // Send email credentials
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
        channelsSent.push('email');
      } catch { /* non-fatal */ }

      // Update form_leads: set matched_parent_id + write portal creation log into response_data
      const updatedRd = {
        ...rd,
        portal_created_at:       createdAt,
        portal_credentials_sent: channelsSent,
        portal_created_by:       staffName,
      };
      await (sb as any).from('form_leads').update({
        matched_parent_id: parentId,
        response_data:     updatedRd,
      }).eq('id', lead.id);

      results.created++;
      results.log.push({ leadId: lead.id, email: parentEmail, name: parentName, channels: channelsSent, createdAt });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push({ leadId: lead.id, error: msg });
    }
  }

  return NextResponse.json(results);
}
