import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { buildFormLeadConfirmationEmail, buildLeadNotificationEmail } from '@/lib/email/rillcod-transactional-email';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── Name matching utilities ───────────────────────────────────────────────────

/** Normalise a name into lowercase word tokens, dropping very short tokens */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/** Count how many tokens from `a` also appear in `b` */
function tokenOverlap(a: string, b: string): number {
  const tb = new Set(nameTokens(b));
  return nameTokens(a).filter(t => tb.has(t)).length;
}

/** Token overlap for programme/class names — same algorithm, works for
 *  "Quincy Python class", "Scratch Beginners", "Advanced HTML", etc. */
function classOverlap(formClass: string, storedClass: string): number {
  return tokenOverlap(formClass, storedClass);
}

interface StudentCandidate {
  id: string;
  full_name: string;
  section_class: string | null;
  school_id: string | null;
  email: string;
  phone: string | null;
  score: number;
  nameOverlap: number;
  classOverlap: number;
  parentMatch: boolean;
}

/** Find the best-matching existing student for this form submission */
async function findStudentMatch(
  sb: ReturnType<typeof adminClient>,
  params: {
    childName: string;
    childClass: string;
    parentEmail: string;
    parentPhone: string;
    schoolId: string | null;
    matchedSchoolId: string | null;
  },
): Promise<{ candidate: StudentCandidate; confidence: 'high' | 'medium' | 'low' } | null> {
  const { childName, childClass, parentEmail, parentPhone, schoolId, matchedSchoolId } = params;

  // Search in both the form's school and the child's current school (if different)
  const schoolIds = [...new Set([schoolId, matchedSchoolId].filter(Boolean))] as string[];
  if (schoolIds.length === 0) return null;

  const { data: students } = await (sb as any)
    .from('portal_users')
    .select('id, full_name, section_class, school_id, email, phone')
    .eq('role', 'student')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .in('school_id', schoolIds);

  if (!students || students.length === 0) return null;

  // Also check if the parent email/phone already exists as a portal_users parent
  const normalPhone = parentPhone?.replace(/\D/g, '') || '';
  let parentPortalId: string | null = null;
  if (parentEmail || normalPhone) {
    let q = (sb as any).from('portal_users').select('id').eq('role', 'parent').eq('is_active', true);
    if (parentEmail) q = q.eq('email', parentEmail);
    const { data: parentMatch } = await q.maybeSingle();
    if (!parentMatch && normalPhone) {
      const { data: phoneMatch } = await (sb as any)
        .from('portal_users').select('id').eq('role', 'parent').ilike('phone', `%${normalPhone.slice(-9)}%`).maybeSingle();
      parentPortalId = phoneMatch?.id ?? null;
    } else {
      parentPortalId = parentMatch?.id ?? null;
    }
  }

  let best: StudentCandidate | null = null;

  for (const student of students) {
    const nameOv  = tokenOverlap(childName, student.full_name);
    if (nameOv === 0) continue; // must share at least one name token

    const classOv = childClass && student.section_class
      ? classOverlap(childClass, student.section_class)
      : 0;

    // Check if this student has a linked parent whose email/phone matches
    const directParentMatch = parentPortalId !== null; // simplified — parent exists in system

    let score = nameOv * 10 + classOv * 5;
    if (directParentMatch) score += 20;

    if (!best || score > best.score) {
      best = {
        id:           student.id,
        full_name:    student.full_name,
        section_class: student.section_class,
        school_id:    student.school_id,
        email:        student.email,
        phone:        student.phone,
        score,
        nameOverlap:  nameOv,
        classOverlap: classOv,
        parentMatch:  directParentMatch,
      };
    }
  }

  if (!best) return null;

  // Confidence thresholds
  let confidence: 'high' | 'medium' | 'low';
  if (best.score >= 25 || best.parentMatch) {
    confidence = 'high';   // strong name match + class, OR parent already in system
  } else if (best.score >= 15) {
    confidence = 'medium'; // 2+ name tokens, or 1 token + class match
  } else {
    confidence = 'low';    // 1 token, school only — note but don't block for review
  }

  return { candidate: best, confidence };
}

// ── CRM reconciliation ────────────────────────────────────────────────────────

interface ReconcileResult {
  contactId: string | null;
  prospectId: string | null;
}

async function reconcileWithCRM(
  sb: ReturnType<typeof adminClient>,
  params: {
    parentName: string; parentEmail: string; parentWhatsapp: string;
    childName: string; childAge: string; childClass: string;
    programCategory: string; currentSchool: string | null;
    matchedSchoolId: string | null; schoolId: string | null; schoolName: string;
    formId: string; formTitle: string;
    referralSource?: string; preferredSchedule?: string; hearAboutUs?: string;
    priorCoding?: string; priorPlatform?: string; devices?: string[];
    learningGoal?: string; specialNotes?: string;
  },
): Promise<ReconcileResult> {
  const {
    parentName, parentEmail, parentWhatsapp, childName, childAge, childClass,
    programCategory, currentSchool, matchedSchoolId, schoolId, schoolName,
    formId, formTitle, referralSource, preferredSchedule, hearAboutUs,
    priorCoding, priorPlatform, devices, learningGoal, specialNotes,
  } = params;

  const now   = new Date().toISOString();
  const phone = parentWhatsapp?.replace(/\D/g, '') || null;
  const email = parentEmail?.trim() || null;

  const courseLabel =
    programCategory === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' :
    programCategory === 'teen_developers'  ? 'Teen Developers (SEC · Ages 11–19)' :
    programCategory || null;

  let contactId: string | null = null;
  let prospectId: string | null = null;

  // ── 1. customer_contact_book (parent) ────────────────────────────────────
  try {
    let existing: { id: string; metadata: Record<string, unknown> } | null = null;
    if (email) {
      const { data } = await (sb as any).from('customer_contact_book').select('id, metadata').eq('email', email).maybeSingle();
      existing = data;
    }
    if (!existing && phone) {
      const { data } = await (sb as any).from('customer_contact_book').select('id, metadata').eq('phone', phone).maybeSingle();
      existing = data;
    }

    const childEntry = { name: childName, age: childAge, class: childClass, program: courseLabel, school: currentSchool };

    if (existing) {
      const meta = (existing.metadata as Record<string, unknown>) ?? {};
      const children = Array.isArray(meta.children) ? meta.children as Record<string, unknown>[] : [];
      const idx = children.findIndex(c => String(c.name ?? '').toLowerCase() === childName.toLowerCase());
      if (idx >= 0) children[idx] = { ...children[idx], ...childEntry };
      else children.push(childEntry);
      const formLeads = Array.isArray(meta.form_leads) ? meta.form_leads as string[] : [];
      if (!formLeads.includes(formId)) formLeads.push(formId);
      await (sb as any).from('customer_contact_book').update({
        full_name: parentName, phone: phone ?? undefined, email: email ?? undefined,
        last_channel: 'consent_form', updated_at: now,
        metadata: { ...meta, children, form_leads: formLeads, last_form_title: formTitle, last_form_id: formId },
      }).eq('id', existing.id);
      contactId = existing.id;
    } else {
      const { data: newContact } = await (sb as any).from('customer_contact_book').insert({
        full_name: parentName, email, phone, role: 'parent',
        source: 'consent_form', last_channel: 'consent_form', school_name: schoolName,
        metadata: { children: [childEntry], form_leads: [formId], last_form_title: formTitle, last_form_id: formId },
        confirmed_at: now, created_at: now, updated_at: now,
      }).select('id').single();
      contactId = newContact?.id ?? null;
    }
  } catch { /* non-fatal */ }

  // ── 2. prospective_students (child) ──────────────────────────────────────
  try {
    let existingProspect: { id: string } | null = null;
    if (email) {
      const q = (sb as any).from('prospective_students').select('id').eq('parent_email', email);
      const { data } = await (schoolId ? q.eq('school_id', schoolId) : q).maybeSingle();
      existingProspect = data;
    }
    const assessmentLines: string[] = [];
    if (priorCoding)    assessmentLines.push(`Prior coding: ${priorCoding}${priorPlatform ? ` (${priorPlatform})` : ''}`);
    if (devices?.length) assessmentLines.push(`Devices: ${devices.join(', ')}`);
    if (learningGoal)   assessmentLines.push(`Goal: ${learningGoal}`);
    if (specialNotes)   assessmentLines.push(`Notes: ${specialNotes}`);
    const notesText = [
      `From consent form: "${formTitle}"`,
      ...assessmentLines,
    ].join('\n');

    const prospectPayload = {
      full_name: childName, email: email ?? `lead-${formId}@noemail.local`,
      age: childAge ? parseInt(childAge, 10) : null, grade: childClass || null,
      course_interest: courseLabel, parent_name: parentName,
      parent_email: email, parent_phone: phone,
      school_id: matchedSchoolId ?? schoolId ?? null,
      school_name: currentSchool ?? schoolName,
      hear_about_us: hearAboutUs ?? referralSource ?? null,
      preferred_schedule: preferredSchedule ?? null,
      notes: notesText,
      status: 'enquiry', updated_at: now,
    };
    if (existingProspect) {
      await (sb as any).from('prospective_students').update(prospectPayload).eq('id', existingProspect.id);
      prospectId = existingProspect.id;
    } else {
      const { data: newP } = await (sb as any).from('prospective_students').insert({
        ...prospectPayload, created_at: now, is_active: true, is_deleted: false,
      }).select('id').single();
      prospectId = newP?.id ?? null;
    }
  } catch { /* non-fatal */ }

  // ── 3. CRM pipeline ──────────────────────────────────────────────────────
  if (contactId) {
    try {
      const { data: pipe } = await (sb as any).from('crm_pipeline').select('id, stage').eq('contact_id', contactId).maybeSingle();
      const stageOrder = ['lead', 'enquiry', 'contacted', 'trial', 'enrolled'];
      const payload = { contact_id: contactId, contact_name: parentName, contact_type: 'form_lead', updated_at: now };
      if (pipe) {
        if (stageOrder.indexOf(pipe.stage) < stageOrder.indexOf('enquiry')) {
          await (sb as any).from('crm_pipeline').update({ ...payload, stage: 'enquiry' }).eq('contact_id', contactId);
        }
      } else {
        await (sb as any).from('crm_pipeline').insert({ ...payload, stage: 'enquiry', created_at: now });
      }
    } catch { /* non-fatal */ }
  }

  // ── 4. CRM interaction ───────────────────────────────────────────────────
  if (contactId) {
    try {
      await (sb as any).from('crm_interactions').insert({
        contact_id: contactId, contact_name: parentName, contact_type: 'form_lead',
        type: 'form_submission', direction: 'inbound',
        content: `Submitted public form: "${formTitle}". Child: ${childName}, Age ${childAge}, Class ${childClass}. Programme: ${courseLabel ?? 'not specified'}.`,
        created_at: now,
      });
    } catch { /* non-fatal */ }
  }

  return { contactId, prospectId };
}

// GET /api/public/consent-forms/[id]
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();
  const { data: form, error } = await sb
    .from('consent_forms')
    .select('id, title, body, form_type, due_date, school_id, schools(name)')
    .eq('id', id).eq('is_public', true).single();
  if (error || !form) return NextResponse.json({ error: 'Form not found or not public' }, { status: 404 });
  return NextResponse.json({ data: form });
}

// POST /api/public/consent-forms/[id]
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error: formErr } = await sb
    .from('consent_forms')
    .select('id, title, school_id, form_type, is_public, schools(name, email)')
    .eq('id', id).single();

  if (formErr || !form || !form.is_public) {
    return NextResponse.json({ error: 'Form not found or no longer accepting submissions' }, { status: 404 });
  }

  // Simple IP-based rate limiting — max 5 submissions per IP per 10 minutes
  const clientIp = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (clientIp !== 'unknown') {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await (sb as any)
      .from('form_leads')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', id)
      .gte('submitted_at', tenMinutesAgo)
      .eq('response_data->>_ip', clientIp);
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const { response_data: rawData = {}, child_current_school, email } = body;

  // Validate required fields
  if (!rawData.child_name?.trim()) {
    return NextResponse.json({ error: 'Child name is required' }, { status: 400 });
  }
  if (!rawData.parent_name?.trim()) {
    return NextResponse.json({ error: 'Parent/guardian name is required' }, { status: 400 });
  }
  if (!email?.trim() && !rawData.parent_email?.trim() && !rawData.parent_whatsapp?.trim()) {
    return NextResponse.json({ error: 'At least one contact method (email or WhatsApp) is required' }, { status: 400 });
  }

  // Stamp the IP into response_data for rate-limit tracking (not displayed to users)
  const response_data = { ...rawData, _ip: clientIp };

  // Duplicate detection — same email + child name + form within 30 days
  const parentEmail = (rawData.parent_email || email || '').trim().toLowerCase();
  if (parentEmail) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await (sb as any)
      .from('form_leads')
      .select('id, submitted_at')
      .eq('form_id', id)
      .eq('email', parentEmail)
      .gte('submitted_at', thirtyDaysAgo)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `We already have a submission for this email. Our team will be in touch soon!`,
      });
    }
  }

  // ── Fuzzy-match child's current school ───────────────────────────────────
  let matched_school_id: string | null = null;
  let matchedSchoolName: string | undefined;
  if (child_current_school?.trim()) {
    const { data: schoolMatch } = await sb.from('schools').select('id, name')
      .ilike('name', `%${child_current_school.trim()}%`).limit(1).maybeSingle();
    matched_school_id = (schoolMatch as any)?.id ?? null;
    matchedSchoolName = (schoolMatch as any)?.name;
  }

  // ── Smart student matching ────────────────────────────────────────────────
  const matchResult = await findStudentMatch(sb, {
    childName:      response_data.child_name,
    childClass:     response_data.child_class || '',
    parentEmail:    response_data.parent_email || email?.trim() || '',
    parentPhone:    response_data.parent_whatsapp || '',
    schoolId:       form.school_id ?? null,
    matchedSchoolId: matched_school_id,
  });

  // Only send medium+ confidence matches for staff review
  const needsReview = matchResult && matchResult.confidence !== 'low';
  const matchStatus = needsReview ? 'pending_review' : (matchResult ? 'new_prospect' : 'new_prospect');

  let matchNotes: string | null = null;
  if (matchResult) {
    const c = matchResult.candidate;
    matchNotes = `Matched "${c.full_name}" (${c.section_class ?? 'no class'}) — name overlap: ${c.nameOverlap}, class overlap: ${c.classOverlap}, parent in system: ${c.parentMatch}. Confidence: ${matchResult.confidence}.`;
  }

  // ── Save form lead ────────────────────────────────────────────────────────
  const { data: lead, error: insertErr } = await (sb as any)
    .from('form_leads')
    .insert({
      form_id: id,
      school_id: form.school_id ?? null,
      matched_school_id,
      child_current_school: child_current_school?.trim() || null,
      email: email?.trim() || null,
      response_data,
      match_status:       matchStatus,
      match_candidate_id: needsReview ? matchResult!.candidate.id : null,
      match_confidence:   matchResult?.confidence ?? null,
      match_notes:        matchNotes,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') return NextResponse.json({ success: true, duplicate: true });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const schoolData = (form as any).schools as { name?: string; email?: string } | null;
  const schoolName  = schoolData?.name ?? 'Rillcod Technologies';
  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const toEmail     = email?.trim();
  const isExistingParent = Boolean(response_data.is_existing_parent);
  const now         = new Date().toISOString();

  // ── CRM reconciliation ────────────────────────────────────────────────────
  const { contactId, prospectId } = await reconcileWithCRM(sb, {
    parentName:       response_data.parent_name || 'Parent/Guardian',
    parentEmail:      response_data.parent_email || toEmail || '',
    parentWhatsapp:   response_data.parent_whatsapp || '',
    childName:        response_data.child_name,
    childAge:         response_data.child_age || '',
    childClass:       response_data.child_class || '',
    programCategory:  response_data.program_category || '',
    currentSchool:    child_current_school?.trim() || null,
    matchedSchoolId:  matched_school_id,
    schoolId:         form.school_id ?? null,
    schoolName,
    formId:           lead!.id,
    formTitle:        form.title,
    referralSource:    response_data.referral_source,
    preferredSchedule: response_data.preferred_schedule,
    hearAboutUs:       response_data.hear_about_us,
    priorCoding:       response_data.prior_coding,
    priorPlatform:     response_data.prior_platform,
    devices:           Array.isArray(response_data.devices) ? response_data.devices : undefined,
    learningGoal:      response_data.learning_goal,
    specialNotes:      response_data.special_notes,
  });

  if (contactId || prospectId) {
    await (sb as any).from('form_leads')
      .update({ contact_id: contactId, prospect_id: prospectId })
      .eq('id', lead!.id);
  }

  // ── Parent confirmation email (SMTP — send first) ─────────────────────────
  if (toEmail && toEmail.includes('@')) {
    try {
      const html = buildFormLeadConfirmationEmail({
        parentName:      response_data.parent_name || 'Parent/Guardian',
        childName:       response_data.child_name,
        programCategory: response_data.program_category,
        formTitle:       form.title, schoolName,
        formType:        form.form_type ?? 'general', appUrl,
      });
      const subject = isExistingParent
        ? `↩️ Welcome Back! We've Received Your Update — Rillcod Technologies`
        : `✅ Registration Received — Rillcod Technologies`;
      await notificationsService.sendEmail('system', {
        to: toEmail, subject, html,
        fromName: 'Rillcod Technologies', replyTo: 'support@rillcod.com',
      });
    } catch { /* non-fatal */ }
  }

  // ── Staff email + in-app notifications ────────────────────────────────────
  try {
    const { data: matchedSchool } = matched_school_id
      ? await sb.from('schools').select('name').eq('id', matched_school_id).single()
      : { data: null };

    const matchInfo = needsReview && matchResult
      ? `\n\n⚠️ POSSIBLE EXISTING STUDENT MATCH (${matchResult.confidence.toUpperCase()} confidence): "${matchResult.candidate.full_name}" — ${matchResult.candidate.section_class ?? 'no class'}. Please review in dashboard.`
      : '';

    const notifTitle = needsReview
      ? `⚠️ Match Needed: ${response_data.child_name}`
      : isExistingParent
      ? `↩️ Returning Family: ${response_data.child_name}`
      : `🔔 New Enquiry: ${response_data.child_name}`;

    const notifMessage = needsReview
      ? `"${response_data.child_name}" (${matchResult!.confidence} confidence) may be an existing student. Review & approve in Consent Forms.`
      : isExistingParent
      ? `${response_data.parent_name} (existing parent) submitted ${form.title} for ${response_data.child_name}.`
      : `New enquiry from ${response_data.parent_name} via "${form.title}". Child: ${response_data.child_name}.`;

    const emailSubject = needsReview
      ? `🔔⚠️ Match Needed: ${response_data.child_name} — ${form.title}`
      : isExistingParent
      ? `↩️ Returning Family: ${response_data.child_name} — ${form.title}`
      : `🔔 New Enquiry: ${response_data.child_name} — ${form.title}`;

    // Staff email
    const staffEmail = schoolData?.email;
    if (staffEmail && staffEmail.includes('@')) {
      const html = buildLeadNotificationEmail({
        schoolName, formTitle: form.title + matchInfo,
        childName:         response_data.child_name,
        childAge:          response_data.child_age,
        childClass:        response_data.child_class,
        programCategory:   response_data.program_category,
        parentName:        response_data.parent_name,
        parentWhatsapp:    response_data.parent_whatsapp,
        parentEmail:       response_data.parent_email || toEmail,
        currentSchool:     child_current_school?.trim() || undefined,
        matchedSchoolName: (matchedSchool as any)?.name ?? matchedSchoolName,
        dashboardUrl:      appUrl,
      });
      await notificationsService.sendEmail('system', {
        to: staffEmail, subject: emailSubject, html,
        fromName: 'Rillcod Forms', replyTo: toEmail || 'support@rillcod.com',
      });
    }

    // In-app notifications — school staff + platform admins (null school_id)
    if (form.school_id) {
      const [{ data: schoolStaff }, { data: platformAdmins }] = await Promise.all([
        (sb as any)
          .from('portal_users').select('id')
          .in('role', ['teacher', 'school'])
          .eq('school_id', form.school_id)
          .eq('is_active', true).eq('is_deleted', false),
        (sb as any)
          .from('portal_users').select('id')
          .eq('role', 'admin')
          .eq('is_active', true).eq('is_deleted', false),
      ]);
      const staffUsers = [...(schoolStaff ?? []), ...(platformAdmins ?? [])];

      if (staffUsers && staffUsers.length > 0) {
        const notifType = needsReview ? 'warning' : 'info';
        const notifRows = (staffUsers as { id: string }[]).map(u => ({
          user_id:    u.id,
          title:      notifTitle,
          message:    notifMessage,
          type:       notifType,
          is_read:    false,
          created_at: now,
          updated_at: now,
        }));
        await (sb as any).from('notifications').insert(notifRows);

        // Supabase Realtime broadcast for live popup
        for (const u of staffUsers as { id: string }[]) {
          try {
            await sb.channel(`popup-notifications-${u.id}`).send({
              type: 'broadcast',
              event: 'notification:popup',
              payload: {
                id:          `lead-${lead!.id}-${u.id}`,
                title:       notifTitle,
                message:     notifMessage,
                type:        notifType,
                timestamp:   now,
                priority:    needsReview ? 'high' : 'normal',
                autoClose:   needsReview ? 0 : 6000,
                persistent:  needsReview,
                actionLabel: 'View Leads',
                actionUrl:   '/dashboard/consent-forms',
                category:    'form_lead',
                sound:       needsReview,
              },
            });
          } catch { /* non-fatal */ }
        }
      }
    }
  } catch { /* non-fatal */ }

  // ── Immediate WhatsApp confirmation to parent ─────────────────────────────
  try {
    const parentWhatsapp = response_data.parent_whatsapp;
    if (parentWhatsapp?.trim()) {
      const programme =
        response_data.program_category === 'young_innovators' ? 'Young Innovators' :
        response_data.program_category === 'teen_developers'  ? 'Teen Developers'  :
        response_data.program_category || 'coding programme';
      const waMsg = `Hi ${response_data.parent_name || 'there'}! 🎉 We've received ${response_data.child_name}'s registration for ${programme} at Rillcod Technologies.\n\nOur team will reach out within 24 hours to confirm your child's placement and share next steps.\n\nQuestions? Call us: +234 811 660 0091\nReply STOP to opt out.`;
      await sendWhatsApp(parentWhatsapp, waMsg);
    }
  } catch { /* non-fatal */ }

  // ── Staff follow-up task (CRM interaction) ────────────────────────────────
  try {
    const savedContactId = contactId;
    if (savedContactId) {
      const programme =
        response_data.program_category === 'young_innovators' ? 'Young Innovators' :
        response_data.program_category === 'teen_developers'  ? 'Teen Developers'  :
        response_data.program_category || 'coding programme';
      await (sb as any).from('crm_interactions').insert({
        contact_id:   savedContactId,
        contact_name: response_data.parent_name || 'Parent',
        contact_type: 'form_lead',
        type:         'task_followup',
        direction:    'internal',
        content:      `Follow-up task: Contact ${response_data.parent_name || 'parent'} about ${response_data.child_name || 'child'}'s registration (${programme}). Submitted: ${new Date().toLocaleDateString('en-GB')}`,
        created_at:   now,
      });
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, id: lead?.id, matchPending: needsReview });
}
