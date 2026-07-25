import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { getAllowedSchoolIds } from '@/lib/auth/school-scope';
import { onboardLeadChildren } from '@/lib/consent/onboard-lead-children';
import {
  applyConsentSpellingToLinkedStudents,
  prepareLeadForStudentOnboard,
} from '@/lib/consent/resolve-consent-lead-match';
import { linkAndHarmonizeConsentLeadChildren } from '@/lib/consent/sync-lead-linked-identity';
import {
  deliverConsentNewStudentCredentials,
  deliverConsentPortalCreationCredentials,
} from '@/lib/credentials/consent-portal-credentials';
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

  const { data: leads, error: leadsErr } = await (sb as any)
    .from('form_leads')
    .select('id, form_id, school_id, matched_school_id, email, response_data, matched_student_id, matched_parent_id, match_status, match_candidate_id')
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
    errors: [] as Array<{ leadId: string; error: string; code?: string }>,
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

    const parentSchoolId = (lead.school_id ?? lead.matched_school_id) as string | null;
    if (!parentSchoolId) {
      results.errors.push({
        leadId: lead.id,
        error: 'Lead has no school — assign the form/lead to a school before creating the parent portal',
      });
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
      const leadFormClassId = formClassById[lead.form_id] ?? null;

      const { data: existing } = await (sb as any)
        .from('portal_users')
        .select('id, email, role')
        .eq('email', parentEmail)
        .maybeSingle();

      if (existing && existing.role !== 'parent') {
        results.errors.push({
          leadId: lead.id,
          error: `Email already registered as ${existing.role} — use a different parent email`,
          code: 'EMAIL_ROLE_CONFLICT',
        });
        continue;
      }

      if (existing) {
        await (sb as any).from('portal_users').update({
          school_id: parentSchoolId,
          role: 'parent',
          is_active: true,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);

        await linkAndHarmonizeConsentLeadChildren(sb as any, {
          leadId: lead.id,
          parentId: existing.id,
          parentEmail,
          parentName,
          parentPhone: parentPhone || null,
          matchedStudentId: lead.matched_student_id,
          childMatches: childMatches.map((m) => ({ childIndex: m.childIndex, studentId: m.studentId })),
          formClassId: leadFormClassId,
        });

        // Onboard any brand-new children into real student accounts + link them.
        const prepared = await prepareLeadForStudentOnboard(sb as any, lead.id, user.id);
        if (!prepared.ok) {
          results.errors.push({ leadId: lead.id, error: prepared.message, code: prepared.code });
          continue;
        }
        const workingLead = prepared.lead;
        const newStudents = await onboardLeadChildren(sb as any, {
          lead: workingLead, parentId: existing.id, parentEmail, parentName, parentPhone: parentPhone || null, approvedBy: user.id,
          classId: formClassById[lead.form_id] ?? null,
        });
        await applyConsentSpellingToLinkedStudents(sb as any, lead.id);
        results.students_onboarded += newStudents.length;
        await recordOnboardedChildren(lead.id, newStudents);
        if (newStudents.length > 0 && existing.email) {
          try {
            await deliverConsentNewStudentCredentials(sb as any, {
              parentId: existing.id,
              parentEmail: existing.email,
              parentName,
              parentPhone: parentPhone || null,
              newStudents,
              schoolId: lead.school_id ?? null,
              schoolName: null,
              silent,
            });
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
      const parentMeta = { full_name: parentName, role: 'parent', school_id: parentSchoolId };
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: parentEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: parentMeta,
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
              user_metadata: parentMeta,
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
        school_id: parentSchoolId,
        phone:     parentPhone || null,
        is_active: true,
      });

      await linkAndHarmonizeConsentLeadChildren(sb as any, {
        leadId: lead.id,
        parentId,
        parentEmail,
        parentName,
        parentPhone: parentPhone || null,
        matchedStudentId: lead.matched_student_id,
        childMatches: childMatches.map((m) => ({ childIndex: m.childIndex, studentId: m.studentId })),
        formClassId: leadFormClassId,
      });

      // Onboard any brand-new children into real student accounts + link them.
      const prepared = await prepareLeadForStudentOnboard(sb as any, lead.id, user.id);
      if (!prepared.ok) {
        results.errors.push({ leadId: lead.id, error: prepared.message, code: prepared.code });
        continue;
      }
      const workingLead = prepared.lead;
      const newStudents = await onboardLeadChildren(sb as any, {
        lead: workingLead, parentId, parentEmail, parentName, parentPhone: parentPhone || null, approvedBy: user.id,
        classId: formClassById[lead.form_id] ?? null,
      });
      await applyConsentSpellingToLinkedStudents(sb as any, lead.id);
      results.students_onboarded += newStudents.length;
      await recordOnboardedChildren(lead.id, newStudents);
      const createdAt = new Date().toISOString();
      const creationDelivery = await deliverConsentPortalCreationCredentials(sb as any, {
        parentId,
        parentEmail,
        parentName,
        parentPhone: parentPhone || null,
        parentPassword: tempPassword,
        newStudents,
        schoolId: lead.school_id ?? null,
        schoolName: null,
        silent,
        bodyIntro: `Dear ${parentName}, your Rillcod Parent Portal account has been created${childName ? ` for ${childName}` : ''}.`,
      });
      const channelsSent = creationDelivery.channels;

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
