import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { listLeadChildLinksForLeads, syncLeadChildrenFromParentOwnership } from '@/lib/consent/lead-child-links';

import { resolveConsentGateway } from '@/lib/consent/pathway-gateway';
import { logAudit } from '@/lib/audit/log';
import {
  ISSUED_RECORD_RETENTION_MESSAGE,
  loadCleanupPolicy,
  mayHardDeleteIssuedOperationalRecord,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';
export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/consent-forms/[id] — staff: signed responses + public leads
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Use service-role for form_leads so RLS on that table never blocks staff reads.
  // Auth is already verified above (role check + school scope on the form itself).
  const admin = adminClient();

  // Non-admin: verify the form belongs to one of their schools
  if (profile?.role !== 'admin') {
    const { data: formCheck } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
    if (!formCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const allowedSchoolIds: string[] = [];
    if (profile?.school_id) allowedSchoolIds.push(profile.school_id);
    if (profile?.role === 'teacher') {
      const { data: ts } = await (admin as any).from('teacher_schools').select('school_id').eq('teacher_id', user.id);
      for (const row of ts ?? []) { if (row.school_id && !allowedSchoolIds.includes(row.school_id)) allowedSchoolIds.push(row.school_id); }
    }
    // Deny unless the form's school is one the caller is assigned to. A caller with NO school
    // assignment (empty set) is denied too — never fall through to an unscoped read.
    if (!allowedSchoolIds.includes(formCheck.school_id ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [formRes, { data: responses }, leadsResult] = await Promise.all([
    supabase.from('consent_forms').select('id, access_code, title, body, form_type, due_date, is_public, school_id, class_id, enrollment_type, academic_offering_id, schools(name)').eq('id', id).single(),
    supabase
      .from('consent_responses')
      // consent_responses is keyed by (form_id, parent_id) and has no id column. Selecting one
      // failed the read, so this route returned no responses at all — an administrator opening a
      // consent form saw an empty list however many parents had signed it.
      .select('parent_id, signed_at, response_data, portal_users!consent_responses_parent_id_fkey(full_name, email, phone)')
      .eq('form_id', id)
      .order('signed_at', { ascending: false }),
    (admin as any)
      .from('form_leads')
      .select('id, submitted_at, email, child_current_school, response_data, status, match_status, match_confidence, match_notes, match_candidate_id, matched_student_id, matched_parent_id, contact_id, prospect_id, schools!matched_school_id(name), match_candidate:portal_users!form_leads_match_candidate_id_fkey(id, full_name, section_class, email)')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  // If full query fails (FK join not available), fall back retaining all non-join columns.
  let leads = leadsResult.data;
  if (leadsResult.error) {
    const fallback = await (admin as any)
      .from('form_leads')
      .select('id, submitted_at, email, child_current_school, response_data, status, match_status, match_confidence, match_notes, match_candidate_id, matched_student_id, matched_parent_id, contact_id, prospect_id, school_id')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false });
    leads = fallback.data ?? [];
  }
  // Heal display gaps: if the parent already owns matching children in
  // parent_student_links, promote them into canonical consent child links.
  for (const lead of leads ?? []) {
    if (!lead?.matched_parent_id) continue;
    try {
      await syncLeadChildrenFromParentOwnership(admin as any, lead);
    } catch {
      // Non-fatal — staff can still link manually.
    }
  }

  const childLinksByLead = await listLeadChildLinksForLeads(
    admin as any,
    (leads ?? []).map((lead: any) => lead.id),
  );
  leads = (leads ?? []).map((lead: any) => {
    const child_links = childLinksByLead[lead.id] ?? [];
    const primary = child_links.find((link: any) =>
      link.child_index === 0 && ['approved', 'onboarded'].includes(link.link_status),
    );
    return {
      ...lead,
      child_links,
      // Keep scalar cache visible even if the DB trigger has not refreshed yet.
      matched_student_id: lead.matched_student_id ?? primary?.student_portal_user_id ?? null,
    };
  });

  // Find parent links to support multi-child persistence on frontend reload
  const parentIds = (leads ?? []).map((l: any) => l.matched_parent_id).filter(Boolean);
  let parentLinks: any[] = [];
  if (parentIds.length > 0) {
    const { data: links } = await (admin as any)
      .from('parent_student_links')
      .select('parent_id, student_id')
      .in('parent_id', parentIds);
    if (links && links.length > 0) {
      const studentIds = links.map((l: any) => l.student_id).filter(Boolean);
      if (studentIds.length > 0) {
        const { data: stus } = await (admin as any)
          .from('students')
          .select('id, full_name, user_id')
          .in('id', studentIds);
        if (stus) {
          const stuMap = new Map<string, { id: string; full_name: string; user_id: string | null }>(
            stus.map((s: any) => [s.id, s])
          );
          parentLinks = links.map((l: any) => {
            const match = stuMap.get(l.student_id);
            return {
              parent_id: l.parent_id,
              student_id: l.student_id,
              studentName: match?.full_name || 'Student',
              studentPortalId: match?.user_id || l.student_id,
            };
          });
        }
      }
    }
  }

  return NextResponse.json({
    form: formRes.data ?? null,
    data: responses ?? [],
    leads: leads ?? [],
    parentLinks,
  });
}

// PATCH /api/consent-forms/[id] — staff: toggle is_public / form_type
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['is_public', 'form_type', 'title', 'body', 'due_date', 'class_id', 'enrollment_type', 'academic_offering_id'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: form } = await (supabase as any).from('consent_forms').select('school_id, class_id, enrollment_type, academic_offering_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, form.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if ('class_id' in updates || 'enrollment_type' in updates || 'academic_offering_id' in updates) {
    try {
      const resolved = await resolveConsentGateway(adminClient() as any, {
        schoolId: form.school_id,
        enrollmentType: (updates.enrollment_type as string | null | undefined) ?? form.enrollment_type,
        academicOfferingId: 'academic_offering_id' in updates
          ? updates.academic_offering_id as string | null
          : form.academic_offering_id,
        classId: 'class_id' in updates ? updates.class_id as string | null : form.class_id,
        actorId: user.id,
      });
      updates.enrollment_type = resolved.enrollmentType;
      updates.academic_offering_id = resolved.academicOfferingId;
      updates.class_id = resolved.classId;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid enrollment pathway.' },
        { status: 400 },
      );
    }
  }


  const { data, error } = await supabase.from('consent_forms').update(updates as { is_public?: boolean; form_type?: string }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/consent-forms/[id] — staff only
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: form } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, form.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  const [responsesResult, leadsResult, cleanupPolicy] = await Promise.all([
    admin.from('consent_responses').select('id', { count: 'exact', head: true }).eq('form_id', id),
    admin.from('form_leads').select('id', { count: 'exact', head: true }).eq('form_id', id),
    loadCleanupPolicy(admin as any),
  ]);
  const preflightError = responsesResult.error || leadsResult.error;
  if (preflightError) {
    console.error('[consent-form.delete] record preflight failed', { formId: id, code: preflightError.code });
    return NextResponse.json({ error: 'Consent records could not be verified. Nothing was deleted; please retry.' }, { status: 503 });
  }
  const responseCount = responsesResult.count ?? 0;
  const leadCount = leadsResult.count ?? 0;
  const issuedRecordCount = responseCount + leadCount;
  if (issuedRecordCount > 0 && !mayHardDeleteIssuedOperationalRecord(cleanupPolicy)) {
    return NextResponse.json({
      error: ISSUED_RECORD_RETENTION_MESSAGE,
      code: 'ISSUED_RECORD_RETENTION',
      response_count: responseCount,
      lead_count: leadCount,
    }, { status: 409 });
  }
  if (issuedRecordCount === 0 && !mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
  }

  const { data: deleted, error } = await admin.from('consent_forms').delete().eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('[consent-form.delete] delete failed', { formId: id, code: error.code });
    return NextResponse.json({
      error: error.code === '23503'
        ? 'This form is still linked to an onboarding record. Move or archive that record before deleting the form.'
        : 'The consent form could not be deleted safely. Nothing was changed; please retry.',
    }, { status: error.code === '23503' ? 409 : 500 });
  }
  if (!deleted) return NextResponse.json({ error: 'Consent form was not deleted. Please refresh and retry.' }, { status: 409 });
  await logAudit(admin as any, {
    action: 'delete_consent_form',
    actorId: user.id,
    resourceType: 'consent_form',
    resourceId: id,
    oldValues: { response_count: responseCount, lead_count: leadCount, cleanup_policy: cleanupPolicy },
    newValue: 'Deleted consent form through the configured cleanup policy',
  });
  return NextResponse.json({ success: true, removed_responses: responseCount, removed_leads: leadCount });
}
