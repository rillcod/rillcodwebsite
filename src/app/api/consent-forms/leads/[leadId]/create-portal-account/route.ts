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
export async function POST(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id, full_name').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const staffName = (profile as unknown as { full_name: string | null }).full_name ?? 'Staff';

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

  const rd = (lead.response_data ?? {}) as Record<string, unknown>;
  const str = (k: string) => ((rd[k] as string) ?? '').trim();
  const parentEmail  = (str('parent_email') || (lead.email as string ?? '')).trim().toLowerCase();
  const parentName   = str('parent_name') || 'Parent/Guardian';
  const parentPhone  = str('parent_whatsapp') || str('parent_phone');
  const childName    = str('child_name');
  const childClass   = str('child_class') || null;
  const childGender  = str('child_gender') || null;

  const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
  const childMatches = Array.isArray(rd.child_matches)
    ? (rd.child_matches as Array<{ childIndex: number; studentId: string; studentName: string; studentClass: string | null; confidence: string }>)
    : [];

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

      const studentOverride: Record<string, unknown> = {
        parent_email: parentEmail,
        parent_name:  parentName,
        parent_phone: parentPhone || null,
        updated_at:   new Date().toISOString(),
      };
      if (childName)   studentOverride.full_name     = childName;
      if (childClass)  studentOverride.section_class = childClass;
      if (childGender) studentOverride.gender        = childGender;

      await (sb as any).from('students').update(studentOverride).eq('id', lead.matched_student_id);

      // Keep portal_users in sync for name / class / gender
      const portalStudentOverride: Record<string, unknown> = {};
      if (childName)   portalStudentOverride.full_name     = childName;
      if (childClass)  portalStudentOverride.section_class = childClass;
      if (childGender) portalStudentOverride.gender        = childGender;
      if (Object.keys(portalStudentOverride).length > 0) {
        await (sb as any).from('portal_users').update(portalStudentOverride).eq('id', lead.matched_student_id);
        await sb.auth.admin.updateUserById(lead.matched_student_id as string, { user_metadata: portalStudentOverride });
      }
    }

    // Link other matched children (multi-child) for existing parent
    if (childMatches && childMatches.length > 0 && existing.id) {
      for (const match of childMatches) {
        const childIdx = match.childIndex;
        const childData = childrenArr?.[childIdx];

        await syncExplicitParentStudentLink(sb as any, existing.id, match.studentId);

        const siblingOverride: Record<string, unknown> = {
          parent_email: parentEmail,
          parent_name:  parentName,
          parent_phone: parentPhone || null,
          updated_at:   new Date().toISOString(),
        };
        if (childData?.name)   siblingOverride.full_name     = childData.name;
        if (childData?.class)  siblingOverride.section_class = childData.class;
        if (childData?.gender) siblingOverride.gender        = childData.gender;

        await (sb as any).from('students').update(siblingOverride).eq('id', match.studentId);

        const portalSiblingOverride: Record<string, unknown> = {};
        if (childData?.name)   portalSiblingOverride.full_name     = childData.name;
        if (childData?.class)  portalSiblingOverride.section_class = childData.class;
        if (childData?.gender) portalSiblingOverride.gender        = childData.gender;

        if (Object.keys(portalSiblingOverride).length > 0) {
          await (sb as any).from('portal_users').update(portalSiblingOverride).eq('id', match.studentId);
          await sb.auth.admin.updateUserById(match.studentId, { user_metadata: portalSiblingOverride });
        }
      }
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

  // Link student if matched + override student record with parent-provided data.
  if (lead.matched_student_id) {
    await syncExplicitParentStudentLink(sb as any, parentId, lead.matched_student_id);

    const studentOverride: Record<string, unknown> = {
      parent_email: parentEmail,
      parent_name:  parentName,
      parent_phone: parentPhone || null,
      updated_at:   new Date().toISOString(),
    };
    if (childName)   studentOverride.full_name     = childName;
    if (childClass)  studentOverride.section_class = childClass;
    if (childGender) studentOverride.gender        = childGender;

    await (sb as any).from('students').update(studentOverride).eq('id', lead.matched_student_id);

    // Keep portal_users in sync for name / class / gender
    const portalStudentOverride: Record<string, unknown> = {};
    if (childName)   portalStudentOverride.full_name     = childName;
    if (childClass)  portalStudentOverride.section_class = childClass;
    if (childGender) portalStudentOverride.gender        = childGender;
    if (Object.keys(portalStudentOverride).length > 0) {
      await (sb as any).from('portal_users').update(portalStudentOverride).eq('id', lead.matched_student_id);
      // Keep Supabase auth metadata in sync
      await sb.auth.admin.updateUserById(lead.matched_student_id as string, { user_metadata: portalStudentOverride });
    }
  }

  // Link other matched children (multi-child) for new parent
  if (childMatches && childMatches.length > 0) {
    for (const match of childMatches) {
      const childIdx = match.childIndex;
      const childData = childrenArr?.[childIdx];

      await syncExplicitParentStudentLink(sb as any, parentId, match.studentId);

      const siblingOverride: Record<string, unknown> = {
        parent_email: parentEmail,
        parent_name:  parentName,
        parent_phone: parentPhone || null,
        updated_at:   new Date().toISOString(),
      };
      if (childData?.name)   siblingOverride.full_name     = childData.name;
      if (childData?.class)  siblingOverride.section_class = childData.class;
      if (childData?.gender) siblingOverride.gender        = childData.gender;

      await (sb as any).from('students').update(siblingOverride).eq('id', match.studentId);

      const portalSiblingOverride: Record<string, unknown> = {};
      if (childData?.name)   portalSiblingOverride.full_name     = childData.name;
      if (childData?.class)  portalSiblingOverride.section_class = childData.class;
      if (childData?.gender) portalSiblingOverride.gender        = childData.gender;

      if (Object.keys(portalSiblingOverride).length > 0) {
        await (sb as any).from('portal_users').update(portalSiblingOverride).eq('id', match.studentId);
        await sb.auth.admin.updateUserById(match.studentId, { user_metadata: portalSiblingOverride });
      }
    }
  }

  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
  const loginUrl  = `${portalUrl}/login?type=parent&email=${encodeURIComponent(parentEmail)}&pw=${encodeURIComponent(tempPassword)}`;
  const channelsSent: string[] = [];

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
      channelsSent.push('whatsapp');
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
    channelsSent.push('email');
  } catch { /* non-fatal */ }

  // Update form_leads: set matched_parent_id + write portal creation log into response_data
  await (sb as any).from('form_leads').update({
    matched_parent_id: parentId,
    response_data: {
      ...rd,
      portal_created_at:       new Date().toISOString(),
      portal_credentials_sent: channelsSent,
      portal_created_by:       staffName,
    },
  }).eq('id', leadId);

  return NextResponse.json({ success: true, alreadyExisted: false, parentId, tempPassword, email: parentEmail });
}

// PATCH /api/consent-forms/leads/[leadId]/create-portal-account
// Manually links an existing student (by portal_users.id) to the lead's parent account.
export async function PATCH(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { student_portal_id, child_index } = await req.json();
  if (!student_portal_id) return NextResponse.json({ error: 'student_portal_id is required' }, { status: 400 });

  const sb = adminClient();

  const { data: lead } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, matched_parent_id, matched_student_id, response_data')
    .eq('id', leadId).single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.matched_parent_id) return NextResponse.json({ error: 'No portal account on this lead yet' }, { status: 400 });

  const leadRd      = (lead.response_data ?? {}) as Record<string, unknown>;
  const childrenArr = Array.isArray(leadRd.children) ? (leadRd.children as Array<Record<string, string>>) : null;
  const effectiveIdx = typeof child_index === 'number' ? child_index : 0;
  const leadGender  = (childrenArr?.[effectiveIdx]?.gender ?? (leadRd.child_gender as string)) || null;

  // Resolve student portal user → students table row
  const { data: studentRow } = await (sb as any)
    .from('students').select('id').eq('user_id', student_portal_id).maybeSingle();
  if (!studentRow) return NextResponse.json({ error: 'Student not found in students table' }, { status: 404 });

  // Get parent email/name for denormalisation
  const { data: parent } = await (sb as any)
    .from('portal_users').select('email, full_name, phone').eq('id', lead.matched_parent_id).single();

  // Create explicit link
  try {
    await syncExplicitParentStudentLink(sb as any, lead.matched_parent_id, studentRow.id);
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to create parent-student link: ${e.message}` }, { status: 500 });
  }

  // Update students row so parent shows in school-scoped lists
  if (parent) {
    const { error: stuErr } = await (sb as any).from('students').update({
      parent_email: parent.email,
      parent_name:  parent.full_name,
      parent_phone: parent.phone ?? null,
      ...(leadGender ? { gender: leadGender } : {}),
      updated_at:   new Date().toISOString(),
    }).eq('id', studentRow.id);
    if (stuErr) console.error('[link-child] students update error:', stuErr.message);
  }

  // Record the link on the lead — only overwrite matched_student_id for the primary child (index 0)
  if (effectiveIdx === 0 || !lead.matched_student_id) {
    const { error: leadErr } = await (sb as any).from('form_leads').update({ matched_student_id: studentRow.id }).eq('id', leadId);
    if (leadErr) return NextResponse.json({ error: `Linked student but failed to update lead record: ${leadErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, student_id: studentRow.id, student_portal_id, child_index: effectiveIdx });
}

// DELETE /api/consent-forms/leads/[leadId]/create-portal-account
// Hard-deletes the portal account created from this lead (auth user + portal_users + links).
export async function DELETE(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
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

  const { data: lead } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, matched_parent_id, matched_student_id')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead.matched_parent_id) {
    return NextResponse.json({ error: 'No portal account linked to this lead' }, { status: 400 });
  }

  const parentId = lead.matched_parent_id;

  // Fetch parent email before deletion so we can wipe student denorm fields
  const { data: parentRow } = await (sb as any)
    .from('portal_users').select('email').eq('id', parentId).maybeSingle();

  // Fetch all parent-student links to safely clean up parent denormalized metadata in students table
  const { data: linkedStudents } = await (sb as any)
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parentId);
  const studentIdsToClear = (linkedStudents ?? []).map((row: any) => row.student_id).filter(Boolean);
  if (lead.matched_student_id) {
    studentIdsToClear.push(lead.matched_student_id);
  }

  // Remove explicit parent-child link rows
  await (sb as any).from('parent_student_links').delete().eq('parent_id', parentId);

  // Clear parent fields from ALL explicitly linked students
  const uniqueStudentIds = [...new Set(studentIdsToClear)];
  if (uniqueStudentIds.length > 0) {
    await (sb as any).from('students').update({
      parent_email: null, parent_name: null, parent_phone: null,
      updated_at: new Date().toISOString(),
    }).in('id', uniqueStudentIds);
  }

  // Also clear parent fields by email as safety fallback
  if (parentRow?.email) {
    await (sb as any).from('students').update({
      parent_email: null, parent_name: null, parent_phone: null,
      updated_at: new Date().toISOString(),
    }).eq('parent_email', parentRow.email);
  }

  // Delete portal_users row
  await (sb as any).from('portal_users').delete().eq('id', parentId);

  // Hard-delete the Supabase auth user
  await sb.auth.admin.deleteUser(parentId);

  // Clear lead references so it no longer shows as linked
  await (sb as any).from('form_leads').update({
    matched_parent_id: null,
    matched_student_id: null,
  }).eq('id', leadId);

  return NextResponse.json({ success: true });
}
