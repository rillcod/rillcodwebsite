import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { syncExplicitParentStudentLink, resolveStudentRowId } from '@/lib/parents/links';
import { getAllowedSchoolIds } from '@/lib/auth/school-scope';
import { onboardLeadChildren } from '@/lib/consent/onboard-lead-children';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { generateTempPassword } from '@/lib/utils/password';
import { logAudit } from '@/lib/audit/log';
import { listLeadChildLinksForLeads, upsertLeadChildLink } from '@/lib/consent/lead-child-links';

export const dynamic = 'force-dynamic';

const MAX_LEADS = 50;

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
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

  let body: { leadIds?: unknown; silent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { leadIds } = body;
  // silent=true: create the accounts but do NOT send any WhatsApp/email now — staff hand out
  // logins later via the "Send login" button (accounts show "⚠ Not sent" until then).
  const silent = body.silent === true;
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
    .select('id, form_id, school_id, email, response_data, matched_student_id, matched_parent_id')
    .in('id', leadIds);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  // Map each form to the class it was created for, so bulk-onboarded students are
  // placed in the form's class (the bulk flow was previously class-blind).
  const formIds = Array.from(new Set((leads ?? []).map((l: any) => l.form_id).filter(Boolean)));
  const formClassById: Record<string, string | null> = {};
  if (formIds.length > 0) {
    const { data: forms } = await (sb as any).from('consent_forms').select('id, class_id').in('id', formIds);
    for (const f of forms ?? []) formClassById[f.id] = f.class_id ?? null;
  }

  const results = {
    created: 0,
    skipped: 0,
    students_onboarded: 0,
    no_email: 0,
    errors: [] as Array<{ leadId: string; error: string }>,
    total: (leads ?? []).length,
    log: [] as Array<{ leadId: string; email: string; name: string; channels: string[]; createdAt: string }>,
  };

  // Stop ~10s before the serverless cap so a large batch returns partial progress
  // (timed_out:true) instead of being killed — staff just re-run to continue.
  const DEADLINE = Date.now() + 50_000;
  let timedOut = false;

  // Resolve the staff member's allowed schools once (own school + teacher_schools).
  const allowedSchools = profile.role === 'admin' ? null : await getAllowedSchoolIds(user.id, profile);
  const childLinksByLead = await listLeadChildLinksForLeads(
    sb as any,
    (leads ?? []).map((lead: any) => lead.id),
  );

  const recordOnboardedChildren = async (
    leadId: string,
    kids: Array<{ name: string; studentPortalId: string; childIndex?: number }>,
  ) => {
    for (const kid of kids) {
      await upsertLeadChildLink(sb as any, {
        lead_id: leadId,
        child_index: kid.childIndex ?? 0,
        student_portal_user_id: kid.studentPortalId,
        student_name: kid.name || null,
        student_class: null,
        link_status: 'onboarded',
        source: 'bulk_portal',
        linked_by: user.id,
      });
    }
  };

  for (const lead of (leads ?? [])) {
    if (Date.now() > DEADLINE) { timedOut = true; break; }
    if (allowedSchools && !(lead.school_id && allowedSchools.has(lead.school_id))) {
      results.errors.push({ leadId: lead.id, error: 'Forbidden: lead belongs to a different school' });
      continue;
    }

    const rd = (lead.response_data ?? {}) as Record<string, unknown>;
    const str = (k: string) => ((rd[k] as string) ?? '').trim();
    const parentEmail = (str('parent_email') || (lead.email as string ?? '')).toLowerCase().trim();
    const parentName  = str('parent_name') || 'Parent/Guardian';
    const parentPhone = str('parent_whatsapp') || str('parent_phone');
    const childName   = str('child_name');
    const childGender = str('child_gender') || null;

    const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
    const childMatches = (childLinksByLead[lead.id] ?? [])
      .filter((link) => ['approved', 'onboarded'].includes(link.link_status))
      .map((link) => ({
        childIndex: link.child_index,
        studentId: link.student_portal_user_id,
        studentName: link.student_name,
        studentClass: link.student_class,
        confidence: link.link_status,
      }));

    if (!parentEmail || !parentEmail.includes('@')) {
      results.no_email++;
      continue;
    }

    try {
      // Matched (existing) students RETAIN their current class — only place those who
      // have none yet (fill a blank, never move a student from where they already are).
      const leadFormClassId = formClassById[lead.form_id] ?? null;
      if (leadFormClassId) {
        const matchedIds = [lead.matched_student_id, ...childMatches.map(m => m.studentId)].filter(Boolean) as string[];
        if (matchedIds.length) {
          const { data: cls } = await (sb as any).from('classes').select('name').eq('id', leadFormClassId).maybeSingle();
          const sectionLabel = (cls?.name as string | undefined)?.trim() || null;
          await (sb as any)
            .from('portal_users')
            .update({
              class_id: leadFormClassId,
              ...(sectionLabel ? { section_class: sectionLabel } : {}),
            })
            .in('id', matchedIds)
            .is('class_id', null);
        }
      }

      const { data: existing } = await (sb as any)
        .from('portal_users')
        .select('id, email')
        .eq('email', parentEmail)
        .maybeSingle();

      if (existing) {
        if (lead.matched_student_id && existing.id) {
          // matched_student_id is a portal_users.id; resolve the real students.id.
          const studentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
          if (studentRowId) {
            await syncExplicitParentStudentLink(sb as any, existing.id, studentRowId);
            await (sb as any).from('students').update({
              parent_email: parentEmail,
              parent_name:  parentName,
              parent_phone: parentPhone || null,
              ...(childGender ? { gender: childGender } : {}),
              updated_at:   new Date().toISOString(),
            }).eq('id', studentRowId);
          }
        }

        // Link other matched children (siblings) for existing parent in bulk
        if (childMatches && childMatches.length > 0 && existing.id) {
          for (const match of childMatches) {
            const childIdx = match.childIndex;
            const childData = childrenArr?.[childIdx];

            const siblingRowId = await resolveStudentRowId(sb as any, match.studentId);
            if (!siblingRowId) continue;
            await syncExplicitParentStudentLink(sb as any, existing.id, siblingRowId);

            const siblingOverride: Record<string, unknown> = {
              parent_email: parentEmail,
              parent_name:  parentName,
              parent_phone: parentPhone || null,
              updated_at:   new Date().toISOString(),
            };
            if (childData?.name)   siblingOverride.full_name     = childData.name;
            if (childData?.gender) siblingOverride.gender        = childData.gender;

            await (sb as any).from('students').update(siblingOverride).eq('id', siblingRowId);
          }
        }

        // Onboard any brand-new children into real student accounts + link them.
        const newStudents = await onboardLeadChildren(sb as any, {
          lead, parentId: existing.id, parentEmail, parentName, parentPhone: parentPhone || null, approvedBy: user.id,
          classId: formClassById[lead.form_id] ?? null,
        });
        results.students_onboarded += newStudents.length;
        await recordOnboardedChildren(lead.id, newStudents);
        if (!silent && newStudents.length > 0 && existing.email) {
          try {
            const block = newStudents.map(s => `<p style="margin:0 0 10px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">${s.name}</strong><br/>Email: <span style="font-family:monospace;">${s.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${s.password}</span></p>`).join('');
            const html = buildRillcodTransactionalEmailHtml({
              title: `New Student Login${newStudents.length > 1 ? 's' : ''} Ready`,
              bodyHtml: `<p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">Dear ${parentName}, your child now has their own student login on your Rillcod account.</p><div style="background:#1c1e22;border-left:4px solid #7c3aed;padding:16px 20px;border-radius:0 6px 6px 0;">${block}<p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;">Log in at ${portalUrl}/login.</p></div>`,
              footerNote: 'Rillcod Technologies · +234 811 660 0091',
            });
            await notificationsService.sendEmail('system', { to: existing.email, subject: `Your Child's Rillcod Student Login`, html });
          } catch { /* non-fatal */ }
        }

        await (sb as any).from('form_leads')
          .update({
            matched_parent_id: existing.id,
            ...(newStudents.length ? {
              match_status: 'approved',
            } : {}),
          })
          .eq('id', lead.id);
        await logAudit(sb as any, {
          action: 'consent_bulk_portal_reused',
          actorId: user.id,
          resourceType: 'form_lead',
          resourceId: lead.id,
          newValues: { parent_id: existing.id, students_onboarded: newStudents.length },
        });
        results.skipped++;
        continue;
      }

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
          results.errors.push({ leadId: lead.id, error: createErr.message ?? 'Failed to create auth user' });
          continue;
        }
      } else if (created?.user) {
        parentId = created.user.id;
      }

      if (!parentId) {
        results.errors.push({ leadId: lead.id, error: 'Failed to create or resolve auth user' });
        continue;
      }

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
        // matched_student_id is a portal_users.id; resolve the real students.id.
        const studentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
        if (studentRowId) {
          await syncExplicitParentStudentLink(sb as any, parentId, studentRowId);
          await (sb as any).from('students').update({
            parent_email: parentEmail,
            parent_name:  parentName,
            parent_phone: parentPhone || null,
            ...(childGender ? { gender: childGender } : {}),
            updated_at:   new Date().toISOString(),
          }).eq('id', studentRowId);
        }
      }

      // Link other matched children (siblings) for new parent in bulk
      if (childMatches && childMatches.length > 0) {
        for (const match of childMatches) {
          const childIdx = match.childIndex;
          const childData = childrenArr?.[childIdx];

          const siblingRowId = await resolveStudentRowId(sb as any, match.studentId);
          if (!siblingRowId) continue;
          await syncExplicitParentStudentLink(sb as any, parentId, siblingRowId);

          const siblingOverride: Record<string, unknown> = {
            parent_email: parentEmail,
            parent_name:  parentName,
            parent_phone: parentPhone || null,
            updated_at:   new Date().toISOString(),
          };
          if (childData?.name)   siblingOverride.full_name     = childData.name;
          if (childData?.gender) siblingOverride.gender        = childData.gender;

          await (sb as any).from('students').update(siblingOverride).eq('id', siblingRowId);
        }
      }

      // Onboard any brand-new children into real student accounts + link them.
      const newStudents = await onboardLeadChildren(sb as any, {
        lead, parentId, parentEmail, parentName, parentPhone: parentPhone || null, approvedBy: user.id,
        classId: formClassById[lead.form_id] ?? null,
      });
      results.students_onboarded += newStudents.length;
      await recordOnboardedChildren(lead.id, newStudents);
      const studentCredsBlock = newStudents.length > 0
        ? `<div style="background:#1c1e22;border-left:4px solid #7c3aed;padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;"><p style="margin:0 0 10px;font-size:10px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Student Portal Login${newStudents.length > 1 ? 's' : ''}</p>${newStudents.map(s => `<p style="margin:0 0 10px;font-size:14px;color:#d4d4d8;"><strong style="color:#fff;">${s.name}</strong><br/>Email: <span style="font-family:monospace;">${s.email}</span><br/>Password: <span style="font-family:monospace;color:#f59e0b;">${s.password}</span></p>`).join('')}</div>`
        : '';

      const loginUrl = `${portalUrl}/login`;
      const channelsSent: string[] = [];
      const createdAt = new Date().toISOString();

      // Send WhatsApp credentials (skipped in silent mode — sent later via "Send login")
      if (!silent && parentPhone) {
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

      // Send email credentials (skipped in silent mode)
      if (!silent) try {
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
          ${studentCredsBlock}
          <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">
            Please change your password${newStudents.length ? 's' : ''} after first login. Keep these details safe and do not share them.
          </p>
        `;
        const html = buildRillcodTransactionalEmailHtml({
          title:      'Your Rillcod Portal Account is Ready',
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
      const updatedRd = {
        ...rd,
        portal_created_at:       createdAt,
        portal_credentials_sent: channelsSent,
        portal_created_by:       staffName,
      };
      await (sb as any).from('form_leads').update({
        matched_parent_id: parentId,
        ...(newStudents.length ? {
          match_status: 'approved',
        } : {}),
        response_data: updatedRd,
      }).eq('id', lead.id);
      await logAudit(sb as any, {
        action: 'consent_bulk_portal_created',
        actorId: user.id,
        resourceType: 'form_lead',
        resourceId: lead.id,
        newValues: { parent_id: parentId, students_onboarded: newStudents.length, channels: channelsSent },
      });

      results.created++;
      results.log.push({ leadId: lead.id, email: parentEmail, name: parentName, channels: channelsSent, createdAt });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push({ leadId: lead.id, error: msg });
    }
  }

  return NextResponse.json({ ...results, timed_out: timedOut });
}
