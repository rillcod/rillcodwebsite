import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import {
  isParentLinkConflict,
  getExistingParentLink,
  resolveOrCreateStudentRowId,
  resolveStudentRowId,
  syncExplicitParentStudentLink,
  unlinkExplicitParentStudentLink,
} from '@/lib/parents/links';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { onboardLeadChildren } from '@/lib/consent/onboard-lead-children';
import {
  clearLeadChildLinks,
  collectLeadStudentPortalIds,
  listLeadChildLinks,
  upsertLeadChildLink,
} from '@/lib/consent/lead-child-links';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { generateTempPassword } from '@/lib/utils/password';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/leads/[leadId]/create-portal-account
// Creates a parent portal account from a form lead, sends credentials via WhatsApp/email.
export async function POST(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  // Optional staff choices: place the new student(s) in a specific class (existing
  // id) or a class name to find-or-create for the school.
  const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const overrideClassId = (reqBody.classId as string) || null;
  const overrideClassName = (reqBody.className as string) || null;
  const targetChildIndex = typeof reqBody.child_index === 'number' ? reqBody.child_index : null;

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
    .select('id, form_id, school_id, matched_school_id, email, response_data, matched_student_id, matched_parent_id')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // The class the FORM was created for — used to place new students unless staff
  // explicitly chose a different class on this action.
  let formClassId: string | null = null;
  if (lead.form_id) {
    const { data: formRow } = await (sb as any).from('consent_forms').select('class_id').eq('id', lead.form_id).maybeSingle();
    formClassId = (formRow?.class_id as string) ?? null;
  }
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
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
  const childMatches = (await listLeadChildLinks(sb as any, leadId))
    .filter((link) => ['approved', 'onboarded'].includes(link.link_status))
    .map((link) => ({
      childIndex: link.child_index,
      studentId: link.student_portal_user_id,
      studentName: link.student_name,
      studentClass: link.student_class,
      confidence: link.link_status,
    }));

  if (!parentEmail || !parentEmail.includes('@')) {
    return NextResponse.json({ error: 'No valid email address on this lead' }, { status: 400 });
  }

  // School name for warm, school-branded "welcome home" messaging — these are
  // existing families from a partner school being brought onto the platform.
  let schoolLabel = 'Rillcod Technologies';
  if (lead.school_id) {
    const { data: sch } = await (sb as any).from('schools').select('name').eq('id', lead.school_id).maybeSingle();
    if (sch?.name) schoolLabel = sch.name;
  }

  // Onboard children with NO existing student match into real student accounts
  // (shared with the bulk flow) and link them to the parent.
  const onboardUnmatchedChildren = (parentId: string) =>
    onboardLeadChildren(sb as any, {
      lead, parentId, parentEmail, parentName, parentPhone: parentPhone || null,
      approvedBy: user.id,
      // staff override wins, else the class the form was created for.
      classId: overrideClassId || formClassId,
      className: overrideClassName,
      targetChildIndex,
    });

  // Canonical provenance: each onboarded child gets one relational slot.
  const linkChildrenToLead = async (kids: Array<{ name: string; studentPortalId: string; childIndex?: number }>) => {
    for (const kid of kids) {
      if (!kid.studentPortalId) continue;
      await upsertLeadChildLink(sb as any, {
        lead_id: leadId,
        child_index: kid.childIndex ?? 0,
        student_portal_user_id: kid.studentPortalId,
        student_name: kid.name || null,
        student_class: null,
        link_status: 'onboarded',
        source: 'onboarded',
        linked_by: user.id,
      });
    }
    if (kids.length > 0) {
      await (sb as any).from('form_leads').update({ match_status: 'approved' }).eq('id', leadId);
    }
  };

  // Check if portal account already exists
  const { data: existing } = await (sb as any)
    .from('portal_users')
    .select('id, email, full_name')
    .eq('email', parentEmail)
    .maybeSingle();

  // Preflight every already-matched child before creating or mutating a parent
  // account. This avoids partial account creation when a child belongs elsewhere.
  const matchedPortalIds = [...new Set([
    lead.matched_student_id,
    ...childMatches.map((match) => match.studentId),
  ].filter(Boolean))] as string[];
  for (const portalId of matchedPortalIds) {
    const rowId = await resolveStudentRowId(sb as any, portalId);
    if (!rowId) continue;
    const currentLink = await getExistingParentLink(sb as any, rowId);
    if (currentLink && currentLink.parentId !== existing?.id) {
      return NextResponse.json({
        error: 'This student is already linked to another parent. Unlink the current parent before creating or linking this portal.',
        code: 'STUDENT_ALREADY_LINKED',
      }, { status: 409 });
    }
  }

  if (existing) {
    // Account exists — still link student if needed
    if (lead.matched_student_id && existing.id) {
      // matched_student_id is a portal_users.id; resolve the real students.id.
      const studentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
      if (studentRowId) await syncExplicitParentStudentLink(sb as any, existing.id, studentRowId);

      const studentOverride: Record<string, unknown> = {
        parent_email: parentEmail,
        parent_name:  parentName,
        parent_phone: parentPhone || null,
        updated_at:   new Date().toISOString(),
      };
      if (childName)   studentOverride.full_name     = childName;
      if (childGender) studentOverride.gender        = childGender;

      if (studentRowId) await (sb as any).from('students').update(studentOverride).eq('id', studentRowId);

      // Keep portal_users in sync for name / class / gender
      const portalStudentOverride: Record<string, unknown> = {};
      if (childName)   portalStudentOverride.full_name     = childName;
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

        const siblingRowId = await resolveStudentRowId(sb as any, match.studentId);
        if (siblingRowId) await syncExplicitParentStudentLink(sb as any, existing.id, siblingRowId);

        const siblingOverride: Record<string, unknown> = {
          parent_email: parentEmail,
          parent_name:  parentName,
          parent_phone: parentPhone || null,
          updated_at:   new Date().toISOString(),
        };
        if (childData?.name)   siblingOverride.full_name     = childData.name;
        if (childData?.gender) siblingOverride.gender        = childData.gender;

        if (siblingRowId) await (sb as any).from('students').update(siblingOverride).eq('id', siblingRowId);

        const portalSiblingOverride: Record<string, unknown> = {};
        if (childData?.name)   portalSiblingOverride.full_name     = childData.name;
        if (childData?.gender) portalSiblingOverride.gender        = childData.gender;

        if (Object.keys(portalSiblingOverride).length > 0) {
          await (sb as any).from('portal_users').update(portalSiblingOverride).eq('id', match.studentId);
          await sb.auth.admin.updateUserById(match.studentId, { user_metadata: portalSiblingOverride });
        }
      }
    }

    // Matched (existing) students RETAIN their current class — only place those who
    // have none yet (fill a blank, never move a student from where they already are).
    if (formClassId) {
      const matchedIds = [lead.matched_student_id, ...childMatches.map(m => m.studentId)].filter(Boolean) as string[];
      if (matchedIds.length) await (sb as any).from('portal_users').update({ class_id: formClassId }).in('id', matchedIds).is('class_id', null);
    }

    if (!lead.matched_parent_id) {
      await (sb as any).from('form_leads').update({ matched_parent_id: existing.id }).eq('id', leadId);
    }

    // Onboard any brand-new children into real student accounts + link to this parent.
    let newStudents;
    try {
      newStudents = await onboardUnmatchedChildren(existing.id);
    } catch (error) {
      if (isParentLinkConflict(error)) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
      }
      throw error;
    }

    // Email the new student login(s) to the (already-registered) parent so the
    // credentials are actually delivered, not just created.
    if (newStudents.length > 0 && existing.email) {
      try {
        const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
        const block = newStudents.map(s =>
          `<p style="margin:0 0 10px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">${s.name}</strong><br/>Email: <span style="font-family:monospace;">${s.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${s.password}</span></p>`
        ).join('');
        const html = buildRillcodTransactionalEmailHtml({
          title: `New Student Login${newStudents.length > 1 ? 's' : ''} Ready`,
          bodyHtml: `<p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">Dear ${parentName}, ${newStudents.length > 1 ? 'your children now have their own student logins' : 'your child now has their own student login'} on your Rillcod parent account.</p>
            <div style="background:#1c1e22;border-left:4px solid #7c3aed;padding:16px 20px;margin:0 0 18px;border-radius:0 6px 6px 0;">${block}<p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;">Log in at ${portalUrl}/login. Please change the password${newStudents.length > 1 ? 's' : ''} after first login.</p></div>`,
          footerNote: 'Rillcod Technologies · +234 811 660 0091',
        });
        await notificationsService.sendEmail('system', { to: existing.email, subject: `Your Child's Rillcod Student Login`, html });
      } catch { /* non-fatal */ }
    }

    await linkChildrenToLead(newStudents);

    return NextResponse.json({
      success: true, alreadyExisted: true, parentId: existing.id,
      email: existing.email,
      // Staff-only: return plaintext temp passwords so the dashboard can display/copy them.
      newStudents: newStudents.map(s => ({ name: s.name, email: s.email, password: s.password })),
      studentsOnboarded: newStudents.length,
    });
  }

  // Generate temp password and create auth user
  const tempPassword = generateTempPassword();
  let parentId: string | null = null;

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: parentEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parentName, role: 'parent' },
  });

  if (createErr) {
    if (createErr.message.includes('already') || createErr.message.includes('exists')) {
      const { data: listData } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const existingAuth = listData?.users?.find(
        u => u.email?.trim().toLowerCase() === parentEmail
      );
      if (existingAuth) {
        parentId = existingAuth.id;
        await sb.auth.admin.updateUserById(parentId, {
          password: tempPassword,
          user_metadata: { full_name: parentName, role: 'parent' },
        });
      }
    }
    if (!parentId) {
      return NextResponse.json({ error: createErr.message ?? 'Failed to create auth user' }, { status: 500 });
    }
  } else if (created?.user) {
    parentId = created.user.id;
  }

  if (!parentId) {
    return NextResponse.json({ error: 'Failed to create or resolve auth user' }, { status: 500 });
  }

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
    // matched_student_id is a portal_users.id; resolve the real students.id.
    const studentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
    if (studentRowId) await syncExplicitParentStudentLink(sb as any, parentId, studentRowId);

    const studentOverride: Record<string, unknown> = {
      parent_email: parentEmail,
      parent_name:  parentName,
      parent_phone: parentPhone || null,
      updated_at:   new Date().toISOString(),
    };
    if (childName)   studentOverride.full_name     = childName;
    if (childGender) studentOverride.gender        = childGender;

    if (studentRowId) await (sb as any).from('students').update(studentOverride).eq('id', studentRowId);

    // Keep portal_users in sync for name / class / gender
    const portalStudentOverride: Record<string, unknown> = {};
    if (childName)   portalStudentOverride.full_name     = childName;
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

      const siblingRowId = await resolveStudentRowId(sb as any, match.studentId);
      if (siblingRowId) await syncExplicitParentStudentLink(sb as any, parentId, siblingRowId);

      const siblingOverride: Record<string, unknown> = {
        parent_email: parentEmail,
        parent_name:  parentName,
        parent_phone: parentPhone || null,
        updated_at:   new Date().toISOString(),
      };
      if (childData?.name)   siblingOverride.full_name     = childData.name;
      if (childData?.gender) siblingOverride.gender        = childData.gender;

      if (siblingRowId) await (sb as any).from('students').update(siblingOverride).eq('id', siblingRowId);

      const portalSiblingOverride: Record<string, unknown> = {};
      if (childData?.name)   portalSiblingOverride.full_name     = childData.name;
      if (childData?.gender) portalSiblingOverride.gender        = childData.gender;

      if (Object.keys(portalSiblingOverride).length > 0) {
        await (sb as any).from('portal_users').update(portalSiblingOverride).eq('id', match.studentId);
        await sb.auth.admin.updateUserById(match.studentId, { user_metadata: portalSiblingOverride });
      }
    }
  }

  // Matched (existing) students RETAIN their current class — only place those who
  // have none yet (fill a blank, never move a student from where they already are).
  if (formClassId) {
    const matchedIds = [lead.matched_student_id, ...childMatches.map(m => m.studentId)].filter(Boolean) as string[];
    if (matchedIds.length) await (sb as any).from('portal_users').update({ class_id: formClassId }).in('id', matchedIds).is('class_id', null);
  }

  // Onboard any brand-new children (no existing match) into real student accounts
  // and link them to this parent — so they appear on the parent dashboard.
  let newStudents;
  try {
    newStudents = await onboardUnmatchedChildren(parentId);
  } catch (error) {
    if (isParentLinkConflict(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    throw error;
  }

  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
  // Credentials are delivered in the message body; never place passwords in a
  // URL where browser history, referrers, proxies, or analytics can retain them.
  const loginUrl  = `${portalUrl}/login`;
  const channelsSent: string[] = [];

  const studentCredsBlock = newStudents.length > 0
    ? `<div style="background:#1c1e22;border-left:4px solid #7c3aed;padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;">
         <p style="margin:0 0 10px;font-size:10px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Student Portal Login${newStudents.length > 1 ? 's' : ''}</p>
         ${newStudents.map(s => `<p style="margin:0 0 10px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">${s.name}</strong><br/>Email: <span style="font-family:monospace;">${s.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${s.password}</span></p>`).join('')}
         <p style="margin:0;font-size:12px;color:#a1a1aa;">Your child logs in at ${portalUrl}/login for lessons & activities.</p>
       </div>`
    : '';

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
        `Open the secure login page:`,
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
        Welcome to <strong style="color:#fff;">${schoolLabel}</strong> on Rillcod! 🎉 We're delighted to have
        ${childName ? `<strong style="color:#fff;">${childName}</strong>` : 'your family'} with us. Your accounts are set up and ready —
        ${newStudents.length ? 'a <strong style="color:#fff;">Parent</strong> account for you and a <strong style="color:#fff;">Student</strong> account for your child.' : 'your Parent account is ready.'}
      </p>
      <div style="background:#1c1e22;border-left:4px solid #10b981;padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 8px;font-size:10px;color:#10b981;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Parent Portal — track progress, reports & payments</p>
        <p style="margin:0 0 6px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">Email:</strong> ${parentEmail}</p>
        <p style="margin:0;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">Temporary Password:</strong> <span style="font-family:monospace;color:#f59e0b;font-size:15px;">${tempPassword}</span></p>
      </div>
      ${studentCredsBlock}
      <p style="margin:0 0 8px;font-size:13px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Getting started</p>
      <p style="margin:0 0 16px;font-size:14px;color:#d4d4d8;line-height:1.7;">
        1. Log in with the button below.<br/>
        2. ${newStudents.length ? "Help your child sign in to explore their lessons, projects and playground." : 'Explore your dashboard.'}<br/>
        3. Change the temporary password${newStudents.length ? 's' : ''} in profile settings.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
        Questions or need a hand getting set up? Just reply to this email — we're here to help you feel right at home.
      </p>
    `;
    const html = buildRillcodTransactionalEmailHtml({
      eyebrow:    'Welcome home 🏠',
      title:      `Welcome to ${schoolLabel} on Rillcod`,
      bodyHtml,
      cta:        { href: loginUrl, label: 'Open Secure Login', color: '#10b981' },
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

  await linkChildrenToLead(newStudents);
  await logAudit(sb as any, {
    action: 'consent_portal_created',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValues: { parent_id: parentId, students_onboarded: newStudents.length },
  });

  return NextResponse.json({
    success: true, alreadyExisted: false, parentId, tempPassword, email: parentEmail,
    // Staff-only: return plaintext temp passwords so the dashboard can display/copy them.
    newStudents: newStudents.map(s => ({ name: s.name, email: s.email, password: s.password })),
    studentsOnboarded: newStudents.length,
  });
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
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead.matched_parent_id) return NextResponse.json({ error: 'No portal account on this lead yet' }, { status: 400 });

  const leadRd      = (lead.response_data ?? {}) as Record<string, unknown>;
  const childrenArr = Array.isArray(leadRd.children) ? (leadRd.children as Array<Record<string, string>>) : null;
  const effectiveIdx = typeof child_index === 'number' ? child_index : 0;
  const leadGender  = (childrenArr?.[effectiveIdx]?.gender ?? (leadRd.child_gender as string)) || null;

  // Resolve student portal user → students table row. Auto-provision a minimal
  // students row when none exists (portal-only students, e.g. summer/online),
  // so manual linking never silently fails.
  const studentRowId = await resolveOrCreateStudentRowId(sb as any, student_portal_id);
  if (!studentRowId) return NextResponse.json({ error: 'Could not resolve or create a student record for this account' }, { status: 404 });
  const studentRow = { id: studentRowId };

  // Get parent email/name for denormalisation
  const { data: parent } = await (sb as any)
    .from('portal_users').select('email, full_name, phone').eq('id', lead.matched_parent_id).single();

  // Create explicit link
  try {
    await syncExplicitParentStudentLink(sb as any, lead.matched_parent_id, studentRow.id);
  } catch (e: any) {
    if (isParentLinkConflict(e)) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
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

  const childData = childrenArr?.[effectiveIdx];
  try {
    await upsertLeadChildLink(sb as any, {
      lead_id: leadId,
      child_index: effectiveIdx,
      student_portal_user_id: student_portal_id,
      student_name: childData?.name ?? null,
      student_class: childData?.class ?? null,
      link_status: 'approved',
      source: 'staff_link',
      linked_by: user.id,
    });
  } catch (leadErr: any) {
    return NextResponse.json({ error: `Linked student but failed to update lead record: ${leadErr.message}` }, { status: 500 });
  }

  await logAudit(sb as any, {
    action: 'consent_child_linked',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValues: { parent_id: lead.matched_parent_id, student_portal_id, child_index: effectiveIdx },
  });

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
    .select('id, school_id, matched_parent_id, matched_student_id, response_data')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead.matched_parent_id) {
    return NextResponse.json({ error: 'No portal account linked to this lead' }, { status: 400 });
  }

  const parentId = lead.matched_parent_id;
  const leadResponse = (lead.response_data ?? {}) as Record<string, any>;
  const parentCreatedByThisLead = Boolean(leadResponse.portal_created_at);

  if (!parentCreatedByThisLead) {
    // This lead reused a pre-existing parent account. Removing the lead's portal
    // association must never delete that account or links belonging to siblings.
    const childPortalIds = await collectLeadStudentPortalIds(sb as any, leadId);
    const childRowIds: string[] = [];
    for (const portalId of childPortalIds) {
      const rowId = await resolveStudentRowId(sb as any, portalId);
      if (rowId) childRowIds.push(rowId);
    }
    if (childRowIds.length > 0) {
      for (const rowId of childRowIds) {
        await unlinkExplicitParentStudentLink(sb as any, parentId, rowId);
      }
    }
    await clearLeadChildLinks(sb as any, leadId);
    await (sb as any).from('form_leads').update({
      matched_parent_id: null,
      match_status: 'new_prospect',
    }).eq('id', leadId);
    await logAudit(sb as any, {
      action: 'consent_portal_unlinked',
      actorId: user.id,
      resourceType: 'form_lead',
      resourceId: leadId,
      oldValues: { parent_id: parentId },
    });
    return NextResponse.json({ success: true, parentDeleted: false });
  }

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
    const primaryStudentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
    if (primaryStudentRowId) studentIdsToClear.push(primaryStudentRowId);
  }

  // Remove explicit parent-child links through the shared lifecycle helper.
  for (const studentId of [...new Set(studentIdsToClear)] as string[]) {
    await unlinkExplicitParentStudentLink(sb as any, parentId, studentId);
  }

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
  await clearLeadChildLinks(sb as any, leadId);
  await (sb as any).from('form_leads').update({
    matched_parent_id: null,
    match_status: 'new_prospect',
  }).eq('id', leadId);

  await logAudit(sb as any, {
    action: 'consent_portal_removed',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    oldValues: { parent_id: parentId },
  });

  return NextResponse.json({ success: true });
}

// PUT /api/consent-forms/leads/[leadId]/create-portal-account
// Resend login credentials: regenerates the parent's (and each linked student's) password
// and delivers them by WhatsApp + email. Used by the "Resend credentials" button so staff
// can hand out logins on demand after silent account creation.
export async function PUT(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();
  const { data: lead } = await (sb as any)
    .from('form_leads').select('id, matched_parent_id, matched_student_id, response_data').eq('id', leadId).maybeSingle();
  if (!lead?.matched_parent_id) return NextResponse.json({ error: 'No portal account on this lead yet.' }, { status: 400 });

  const { data: parent } = await (sb as any)
    .from('portal_users').select('email, full_name, phone').eq('id', lead.matched_parent_id).single();
  if (!parent?.email) return NextResponse.json({ error: 'Parent account has no email on file.' }, { status: 400 });

  const parentPw = generateTempPassword();
  await sb.auth.admin.updateUserById(lead.matched_parent_id as string, { password: parentPw });

  const studentIds = await collectLeadStudentPortalIds(sb as any, leadId);
  const students: Array<{ name: string; email: string; password: string }> = [];
  for (const sid of studentIds) {
    const { data: s } = await (sb as any).from('portal_users').select('email, full_name').eq('id', sid).eq('role', 'student').maybeSingle();
    if (!s?.email) continue;
    const pw = generateTempPassword();
    await sb.auth.admin.updateUserById(sid, { password: pw });
    students.push({ name: s.full_name || 'Student', email: s.email, password: pw });
  }

  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
  const loginUrl = `${portalUrl}/login`;
  const channelsSent: string[] = [];
  const studentBlock = students.length
    ? students.map(s => `<p style="margin:0 0 10px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">${s.name}</strong><br/>Email: <span style="font-family:monospace;">${s.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${s.password}</span></p>`).join('')
    : '';

  if (parent.phone) {
    try {
      const waMsg = [
        `Hello ${parent.full_name || 'Parent'}! 👋`,
        `Here are your Rillcod Parent Portal login details.`,
        ``,
        `📧 Email: ${parent.email}`,
        `🔑 Password: ${parentPw}`,
        ``,
        `Open the secure login page:`,
        loginUrl,
        ``,
        `Please change your password after login. Questions? +234 811 660 0091`,
      ].join('\n');
      await sendWhatsApp(parent.phone, waMsg);
      channelsSent.push('whatsapp');
    } catch { /* non-fatal */ }
  }
  try {
    const html = buildRillcodTransactionalEmailHtml({
      title: 'Your Rillcod Login Details',
      bodyHtml: `<p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">Dear <strong style="color:#fff;">${parent.full_name || 'Parent'}</strong>, here are your login details.</p>
        <div style="background:#1c1e22;border-left:4px solid #7c3aed;padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;"><p style="margin:0;font-size:14px;color:#d4d4d8;">Email: <span style="font-family:monospace;">${parent.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${parentPw}</span></p></div>
        ${studentBlock ? `<p style="margin:0 0 8px;font-size:10px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Student Login${students.length > 1 ? 's' : ''}</p>${studentBlock}` : ''}`,
      cta: { href: loginUrl, label: 'Log In' },
      footerNote: 'Rillcod Technologies · +234 811 660 0091',
    });
    await notificationsService.sendEmail('system', { to: parent.email, subject: 'Your Rillcod Login Details', html });
    channelsSent.push('email');
  } catch { /* non-fatal */ }

  await logAudit(sb as any, {
    action: 'consent_credentials_resent',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValues: { channels: channelsSent, students_sent: students.length },
  });
  return NextResponse.json({
    success: true,
    channels: channelsSent,
    studentsSent: students.length,
    email: parent.email,
    tempPassword: parentPw,
    parentName: parent.full_name || 'Parent',
    students,
  });
}
